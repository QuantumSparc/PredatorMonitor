import type { EventEntry, GpuStatic, LhmSensorMeta, ProcsMsg, SessionSummary, Settings, SlowMsg, Snapshot, StaticMsg } from '../shared/types';
import { PROFILE } from '../shared/profile';
import { SeriesStore } from './ui';

declare global { interface Window { api: any } }
export const api = window.api;

export const state = {
  static: null as StaticMsg | null,
  slow: null as SlowMsg | null,
  procs: null as ProcsMsg | null,
  gpuStatic: null as GpuStatic | null,
  lhmMeta: [] as LhmSensorMeta[],
  /** energy integrated since the app started, Wh per component (power view) */
  energy: { since: 0, last: 0, wh: {} as Record<string, number> },
  settings: null as unknown as Settings,
  events: [] as EventEntry[],
  sessions: [] as SessionSummary[],
  batteryLog: [] as { t: number; fullWh: number }[],
  profile: null as unknown as typeof PROFILE,
  admin: false,
  lhmInstalled: false,
  version: '',
  dataDir: '',
  last: null as Snapshot | null,
  agent: 'starting' as string,
};

export const series = new SeriesStore(120000);

/** A page in the app. mount() builds it; update() runs every tick while it is visible. */
export interface View {
  id: string; title: string; icon: string; group: string; subtitle?: string;
  mount(root: HTMLElement): void;
  update?(s: Snapshot): void;
  onProcs?(): void; onSlow?(): void; onEvent?(): void;
  unmount?(): void;
  badge?(): { text: string; level: string } | null;
}

/** Index cards so they cascade in (CSS reads --i). */
export function stagger(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.card').forEach((c, i) => c.style.setProperty('--i', String(i)));
}

/** Push every live metric of a snapshot into the chart buffers. */
export function ingest(s: Snapshot) {
  state.last = s;
  const t = s.t; const k = s.tick; const g = s.gpu; const d = s.derived;
  const p = (key: string, v: number | null | undefined) => series.push(key, t, v);
  if (k) {
    p('cpuUtil', k.cpu.util); p('cpuMhz', k.cpu.mhz); p('cpuPriv', k.cpu.priv);
    k.cpu.coreUtil.forEach((v, i) => p(`core${i}`, v));
    k.cpu.coreMhz.forEach((v, i) => p(`coreMhz${i}`, v));
    p('pkgW', k.power.pkgW); p('coresW', k.power.coresW); p('igpuW', k.power.igpuW); p('dramW', k.power.dramW);
    p('zoneC', k.thermal.zoneC);
    p('memUsed', k.mem.used / 2 ** 30); p('memCommit', k.mem.commit / 2 ** 30); p('memCache', k.mem.cache / 2 ** 30); p('pageFaults', k.mem.pageFaults);
    let rx = 0, tx = 0; for (const n of k.net) { rx += n.rx; tx += n.tx; p(`rx:${n.name}`, n.rx / 2 ** 20); p(`tx:${n.name}`, n.tx / 2 ** 20); }
    p('netRx', rx / 2 ** 20); p('netTx', tx / 2 ** 20);
    let dr = 0, dw = 0; for (const x of k.disks) { dr += x.r; dw += x.w; p(`dr:${x.name}`, x.r / 2 ** 20); p(`dw:${x.name}`, x.w / 2 ** 20); p(`da:${x.name}`, x.active); }
    p('diskR', dr / 2 ** 20); p('diskW', dw / 2 ** 20);
    if (k.battery) { p('batWh', k.battery.remainingWh); p('batRate', k.battery.charging ? k.battery.chargeRateW : -k.battery.dischargeRateW); p('batV', k.battery.voltageV); }
    if (k.acer) { p('acerCpuFan', k.acer.cpuFanRpm ?? k.acer.cpuFanPct); p('acerGpuFan', k.acer.gpuFanRpm ?? k.acer.gpuFanPct); }
    if (k.lhm) for (const [id, v] of k.lhm) p(`lhm:${id}`, v);
  }
  if (g) {
    p('gpuUtil', g.util); p('gpuTemp', g.tempC); p('gpuW', g.powerW); p('gpuLimit', g.limitW); p('gpuMHz', g.coreMHz); p('gpuMemMHz', g.memMHz);
    p('vram', g.memUsedMiB != null ? g.memUsedMiB / 1024 : null); p('gpuMemUtil', g.memUtil);
  }
  // CPU "uncore" (ring, LLC, system agent) = package − IA cores − iGPU
  const pw = k?.power;
  const uncore = pw?.pkgW != null && pw.coresW != null ? Math.max(0, pw.pkgW - pw.coresW - (pw.igpuW ?? 0)) : null;
  p('uncoreW', uncore);
  const chargeW = k?.battery?.charging ? k.battery.chargeRateW : 0; p('chargeW', chargeW);
  const e = state.energy; if (!e.since) e.since = t;
  const dtH = e.last ? Math.min(5000, Math.max(0, t - e.last)) / 3600000 : 0; e.last = t;
  const add = (key: string, w: number | null | undefined) => { if (w != null && Number.isFinite(w)) e.wh[key] = (e.wh[key] ?? 0) + w * dtH; };
  add('system', d.systemDrawW); add('pkg', pw?.pkgW); add('cores', pw?.coresW); add('uncore', uncore); add('igpu', pw?.igpuW); add('dram', pw?.dramW);
  add('gpu', g?.powerW); add('charge', chargeW); add('rest', d.systemDrawW != null && d.systemDrawSource !== 'battery' ? d.restW : d.systemDrawW != null ? Math.max(0, d.systemDrawW - (pw?.pkgW ?? 0) - (g?.powerW ?? 0)) : null);
  if (k?.battery?.discharging) add('fromBattery', k.battery.dischargeRateW);
  p('cpuTemp', d.cpuTempC); p('systemW', d.systemDrawW); p('ewma', d.tauEwmaW); p('pl1Eff', d.pl1EffW); p('health', d.healthScore);
}
