import { spawn, ChildProcessWithoutNullStreams, execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import * as readline from 'node:readline';
import type { AgentTick, GpuStatic, GpuTick, LhmSensorMeta, ProcsMsg, SlowMsg, StaticMsg } from '../shared/types';

const GPU_FIELDS = [
  'temperature.gpu', 'utilization.gpu', 'utilization.memory', 'memory.used', 'memory.total', 'power.draw', 'enforced.power.limit', 'power.max_limit',
  'clocks.gr', 'clocks.sm', 'clocks.mem', 'clocks.video', 'clocks.max.graphics', 'clocks.max.memory', 'pstate', 'fan.speed',
  'clocks_event_reasons.active', 'pcie.link.gen.gpucurrent', 'pcie.link.width.current', 'encoder.stats.sessionCount', 'encoder.stats.averageFps', 'display_active',
] as const;
const GPU_STATIC_FIELDS = ['name', 'driver_version', 'vbios_version', 'compute_cap', 'pci.bus_id', 'power.default_limit', 'power.max_limit', 'pcie.link.gen.max', 'pcie.link.width.max'];

const num = (s: string | undefined): number | null => {
  if (s == null) return null;
  const v = parseFloat(s.trim());
  return Number.isFinite(v) ? v : null;
};

/**
 * Runs the PowerShell sensor agent and a streaming nvidia-smi, restarts them if they die,
 * and emits: 'static', 'tick', 'gpu', 'procs', 'slow', 'lhmMeta', 'log', 'status'.
 */
export class SensorHub extends EventEmitter {
  agent: ChildProcessWithoutNullStreams | null = null;
  smi: ChildProcessWithoutNullStreams | null = null;
  static: StaticMsg | null = null;
  gpuStatic: GpuStatic | null = null;
  lastTick: AgentTick | null = null;
  lastGpu: GpuTick | null = null;
  lastProcs: ProcsMsg | null = null;
  lastSlow: SlowMsg | null = null;
  lhmMeta: LhmSensorMeta[] = [];
  lastAcer: AgentTick['acer'] = null;
  private stopped = false;
  private restarts = 0;

  constructor(private agentDir: string, private intervalMs: number) { super(); }

  start() {
    this.stopped = false;
    this.startAgent();
    this.startSmi();
    this.readGpuStatic();
  }

  stop() {
    this.stopped = true;
    this.agent?.kill();
    this.smi?.kill();
  }

  setInterval(ms: number) {
    if (ms === this.intervalMs) return;
    this.intervalMs = ms;
    this.agent?.kill();   // restarts with the new interval
    this.smi?.kill();
  }

  private startAgent() {
    const script = path.join(this.agentDir, 'agent.ps1');
    const proc = spawn('pwsh.exe', ['-NoProfile', '-NoLogo', '-ExecutionPolicy', 'Bypass', '-File', script, '-IntervalMs', String(this.intervalMs), '-ParentPid', String(process.pid)], { windowsHide: true });
    this.agent = proc;
    this.emit('status', { agent: 'starting' });
    readline.createInterface({ input: proc.stdout }).on('line', (line) => {
      if (!line.startsWith('{')) return;
      let msg: any;
      try { msg = JSON.parse(line); } catch { return; }
      switch (msg.type) {
        case 'static': this.static = msg; this.restarts = 0; this.emit('static', msg); this.emit('status', { agent: 'running', admin: msg.admin }); break;
        case 'tick':
          // Acer WMI is read every other tick; carry the last reading forward so the UI never blanks
          if (msg.acer) this.lastAcer = msg.acer; else msg.acer = this.lastAcer;
          this.lastTick = msg; this.emit('tick', msg); break;
        case 'procs': this.lastProcs = msg; this.emit('procs', msg); break;
        case 'slow': this.lastSlow = msg; this.emit('slow', msg); break;
        case 'lhmMeta': this.lhmMeta = msg.sensors ?? []; this.emit('lhmMeta', this.lhmMeta); break;
        case 'log': this.emit('log', msg); break;
      }
    });
    proc.stderr.on('data', (d) => this.emit('log', { level: 'error', msg: String(d).slice(0, 500) }));
    proc.on('exit', (code) => {
      this.agent = null;
      this.emit('status', { agent: 'stopped', code });
      if (!this.stopped) {
        const delay = Math.min(30000, 1000 * 2 ** Math.min(this.restarts++, 5));
        setTimeout(() => !this.stopped && this.startAgent(), delay);
      }
    });
  }

  private startSmi() {
    const ms = Math.max(250, this.intervalMs);
    const proc = spawn('nvidia-smi', [`--query-gpu=${GPU_FIELDS.join(',')}`, '--format=csv,noheader,nounits', `-lms`, String(ms)], { windowsHide: true });
    this.smi = proc;
    readline.createInterface({ input: proc.stdout }).on('line', (line) => {
      const f = line.split(',').map((s) => s.trim());
      if (f.length < GPU_FIELDS.length) return;
      const g: GpuTick = {
        t: Date.now(), tempC: num(f[0]), util: num(f[1]), memUtil: num(f[2]), memUsedMiB: num(f[3]), memTotalMiB: num(f[4]),
        powerW: num(f[5]), limitW: num(f[6]), maxLimitW: num(f[7]), coreMHz: num(f[8]), smMHz: num(f[9]), memMHz: num(f[10]), videoMHz: num(f[11]),
        maxCoreMHz: num(f[12]), maxMemMHz: num(f[13]), pstate: f[14] || null, fanPct: num(f[15]),
        throttleMask: f[16]?.startsWith('0x') ? parseInt(f[16], 16) : null,
        pcieGen: num(f[17]), pcieWidth: num(f[18]), encSessions: num(f[19]), encFps: num(f[20]), displayActive: f[21] || null,
      };
      this.lastGpu = g;
      this.emit('gpu', g);
    });
    proc.on('error', () => this.emit('log', { level: 'warn', msg: 'nvidia-smi not available' }));
    proc.on('exit', () => {
      this.smi = null;
      if (!this.stopped) setTimeout(() => !this.stopped && this.startSmi(), 3000);
    });
  }

  private readGpuStatic() {
    execFile('nvidia-smi', [`--query-gpu=${GPU_STATIC_FIELDS.join(',')}`, '--format=csv,noheader,nounits'], { windowsHide: true }, (err, stdout) => {
      if (err) return;
      const f = stdout.trim().split(',').map((s) => s.trim());
      this.gpuStatic = {
        name: f[0], driver: f[1], vbios: f[2], computeCap: f[3], busId: f[4],
        defaultLimitW: num(f[5]), maxLimitW: num(f[6]), pcieGenMax: num(f[7]), pcieWidthMax: num(f[8]),
      };
      this.emit('gpuStatic', this.gpuStatic);
    });
  }
}

/** GPU throttle reason bits (nvidia-smi clocks_event_reasons). */
export function gpuThrottleReasons(mask: number | null): string[] {
  if (mask == null) return [];
  const names: [number, string][] = [
    [0x1, 'Idle'], [0x2, 'App clock setting'], [0x4, 'SW power cap'], [0x8, 'HW slowdown'], [0x10, 'Sync boost'],
    [0x20, 'SW thermal'], [0x40, 'HW thermal'], [0x80, 'HW power brake'], [0x100, 'Display clock'],
  ];
  return names.filter(([b]) => mask & b).map(([, n]) => n);
}
