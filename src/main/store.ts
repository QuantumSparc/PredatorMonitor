import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_SETTINGS, type EventEntry, type SessionSummary, type Settings, type Snapshot } from '../shared/types';

/** Metrics rolled up per minute (min / avg / max) for the History view. */
export const HISTORY_METRICS = [
  'cpuUtil', 'cpuMhz', 'pkgW', 'cpuTempC', 'zoneC', 'gpuUtil', 'gpuTempC', 'gpuW', 'gpuMHz', 'vramMiB',
  'memGiB', 'netRxMBs', 'netTxMBs', 'diskRMBs', 'diskWMBs', 'systemW', 'batteryWh', 'healthScore',
] as const;
export type MetricKey = (typeof HISTORY_METRICS)[number];
export interface Rollup { t: number; n: number; avg: Partial<Record<MetricKey, number>>; min: Partial<Record<MetricKey, number>>; max: Partial<Record<MetricKey, number>> }

const day = (t: number) => new Date(t).toISOString().slice(0, 10);

export function metricsOf(s: Snapshot): Partial<Record<MetricKey, number>> {
  const k = s.tick; const g = s.gpu; const d = s.derived;
  const sum = (a: { [x: string]: any }[] | undefined, f: string) => (a ?? []).reduce((acc, x) => acc + (x[f] ?? 0), 0);
  const m: Partial<Record<MetricKey, number>> = {
    cpuUtil: k?.cpu.util, cpuMhz: k?.cpu.mhz, pkgW: k?.power.pkgW ?? undefined, cpuTempC: d.cpuTempC ?? undefined, zoneC: k?.thermal.zoneC ?? undefined,
    gpuUtil: g?.util ?? undefined, gpuTempC: g?.tempC ?? undefined, gpuW: g?.powerW ?? undefined, gpuMHz: g?.coreMHz ?? undefined, vramMiB: g?.memUsedMiB ?? undefined,
    memGiB: k ? k.mem.used / 2 ** 30 : undefined,
    netRxMBs: k ? sum(k.net, 'rx') / 2 ** 20 : undefined, netTxMBs: k ? sum(k.net, 'tx') / 2 ** 20 : undefined,
    diskRMBs: k ? sum(k.disks, 'r') / 2 ** 20 : undefined, diskWMBs: k ? sum(k.disks, 'w') / 2 ** 20 : undefined,
    systemW: d.systemDrawW ?? undefined, batteryWh: k?.battery?.remainingWh ?? undefined, healthScore: d.healthScore,
  };
  for (const key of Object.keys(m) as MetricKey[]) if (m[key] == null || !Number.isFinite(m[key]!)) delete m[key];
  return m;
}

export class Store {
  readonly dir: string;
  settings: Settings;
  events: EventEntry[] = [];
  sessions: SessionSummary[] = [];
  private bucket: { minute: number; n: number; sum: Partial<Record<MetricKey, number>>; min: Partial<Record<MetricKey, number>>; max: Partial<Record<MetricKey, number>> } | null = null;

  constructor(userData: string) {
    this.dir = path.join(userData, 'data');
    fs.mkdirSync(path.join(this.dir, 'history'), { recursive: true });
    this.settings = this.loadSettings();
    this.events = this.readNdjson<EventEntry>('events.ndjson').slice(-1000);
    this.sessions = this.readNdjson<SessionSummary>('sessions.ndjson').slice(-500);
    this.prune();
  }

  // ── settings ──────────────────────────────────────────────────
  private loadSettings(): Settings {
    // fall back to the last good copy if settings.json was cut short (e.g. power loss mid-write)
    const read = (name: string) => JSON.parse(fs.readFileSync(path.join(this.dir, name), 'utf8'));
    try {
      let raw: any;
      try { raw = read('settings.json'); } catch { raw = read('settings.json.bak'); }
      const merged: Settings = { ...DEFAULT_SETTINGS, ...raw, thresholds: { ...DEFAULT_SETTINGS.thresholds, ...(raw.thresholds ?? {}) } };
      if ((raw.tilesVersion ?? 1) < 2) {   // v2 added the Cooling (fans) tile
        if (!merged.overviewTiles.includes('fans')) merged.overviewTiles.splice(Math.min(4, merged.overviewTiles.length), 0, 'fans');
        merged.tilesVersion = 2;
      }
      return merged;
    } catch { return structuredClone(DEFAULT_SETTINGS); }
  }
  saveSettings(patch: Partial<Settings>): Settings {
    this.settings = { ...this.settings, ...patch, thresholds: { ...this.settings.thresholds, ...(patch.thresholds ?? {}) } };
    // crash-safe: write a temp file, keep the previous file as .bak, then atomically rename into place
    const f = path.join(this.dir, 'settings.json');
    try {
      fs.writeFileSync(`${f}.tmp`, JSON.stringify(this.settings, null, 2));
      if (fs.existsSync(f)) fs.copyFileSync(f, `${f}.bak`);
      fs.renameSync(`${f}.tmp`, f);
    } catch (e) { console.error('settings save', e); }
    return this.settings;
  }
  resetSettings(): Settings { this.settings = structuredClone(DEFAULT_SETTINGS); return this.saveSettings({}); }

  // ── per-minute rollups ───────────────────────────────────────
  add(s: Snapshot) {
    const minute = Math.floor(s.t / 60000) * 60000;
    if (this.bucket && this.bucket.minute !== minute) this.flush();
    if (!this.bucket) this.bucket = { minute, n: 0, sum: {}, min: {}, max: {} };
    const b = this.bucket; b.n++;
    for (const [k, v] of Object.entries(metricsOf(s)) as [MetricKey, number][]) {
      b.sum[k] = (b.sum[k] ?? 0) + v;
      b.min[k] = Math.min(b.min[k] ?? v, v);
      b.max[k] = Math.max(b.max[k] ?? v, v);
    }
  }
  flush() {
    const b = this.bucket; this.bucket = null;
    if (!b || !b.n) return;
    const r: Rollup = { t: b.minute, n: b.n, avg: {}, min: b.min, max: b.max };
    for (const k of Object.keys(b.sum) as MetricKey[]) r.avg[k] = +(b.sum[k]! / b.n).toFixed(2);
    fs.appendFileSync(path.join(this.dir, 'history', `${day(b.minute)}.ndjson`), JSON.stringify(r) + '\n');
  }
  history(fromMs: number, toMs = Date.now()): Rollup[] {
    const out: Rollup[] = [];
    for (let t = Math.floor(fromMs / 86400000) * 86400000; t <= toMs; t += 86400000) {
      const f = path.join(this.dir, 'history', `${day(t)}.ndjson`);
      if (!fs.existsSync(f)) continue;
      for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
        if (!line) continue;
        try { const r: Rollup = JSON.parse(line); if (r.t >= fromMs && r.t <= toMs) out.push(r); } catch { /* skip */ }
      }
    }
    return out;
  }
  prune() {
    const keepFrom = day(Date.now() - this.settings.historyDays * 86400000);
    for (const f of fs.readdirSync(path.join(this.dir, 'history'))) if (f.slice(0, 10) < keepFrom) fs.rmSync(path.join(this.dir, 'history', f));
  }

  // ── events / sessions / battery log ──────────────────────────
  event(e: Omit<EventEntry, 't'>) {
    const entry = { t: Date.now(), ...e };
    this.events.push(entry); if (this.events.length > 1000) this.events.shift();
    fs.appendFileSync(path.join(this.dir, 'events.ndjson'), JSON.stringify(entry) + '\n');
    return entry;
  }
  session(s: SessionSummary) {
    this.sessions.push(s);
    fs.appendFileSync(path.join(this.dir, 'sessions.ndjson'), JSON.stringify(s) + '\n');
  }
  logBattery(fullWh: number) {
    const log = this.batteryLog();
    const today = day(Date.now());
    if (log.length && day(log[log.length - 1].t) === today) return;
    fs.appendFileSync(path.join(this.dir, 'battery.ndjson'), JSON.stringify({ t: Date.now(), fullWh }) + '\n');
  }
  batteryLog(): { t: number; fullWh: number }[] { return this.readNdjson('battery.ndjson'); }

  private readNdjson<T>(name: string): T[] {
    const f = path.join(this.dir, name);
    if (!fs.existsSync(f)) return [];
    return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
  }
}

/** Detects gaming sessions from sustained GPU load and summarises them. */
export class SessionTracker {
  active = false;
  private hiSince = 0; private loSince = 0;
  private acc: { start: number; n: number; pkg: number[]; gpuW: number[]; gpuT: number[]; zone: number[]; cpuMhz: number[]; gpuMhz: number[]; gpuUtil: number[]; throttle: number; games: Map<string, number>; mode: string } | null = null;

  update(s: Snapshot, threshold: number, topGpuProc: string | null): SessionSummary | null {
    const util = s.gpu?.util ?? 0; const now = s.t;
    if (!this.active) {
      if (util >= threshold) { this.hiSince ||= now; if (now - this.hiSince > 30000) this.begin(now - 30000, s.derived.psMode); }
      else this.hiSince = 0;
      return null;
    }
    const a = this.acc!;
    a.n++;
    const push = (arr: number[], v: number | null | undefined) => { if (v != null) arr.push(v); };
    push(a.pkg, s.tick?.power.pkgW); push(a.gpuW, s.gpu?.powerW); push(a.gpuT, s.gpu?.tempC); push(a.zone, s.tick?.thermal.zoneC);
    push(a.cpuMhz, s.tick?.cpu.mhz); push(a.gpuMhz, s.gpu?.coreMHz); push(a.gpuUtil, s.gpu?.util);
    if (s.insights.some((i) => i.id === 'gpu-throttle' && i.level === 'warn') || s.derived.plState.startsWith('Thermal')) a.throttle++;
    if (topGpuProc) a.games.set(topGpuProc, (a.games.get(topGpuProc) ?? 0) + 1);
    if (util < 20) { this.loSince ||= now; if (now - this.loSince > 60000) return this.end(now - 60000); }
    else this.loSince = 0;
    return null;
  }
  seconds(now: number) { return this.active && this.acc ? Math.round((now - this.acc.start) / 1000) : 0; }
  private begin(start: number, mode: string) {
    this.active = true; this.loSince = 0;
    this.acc = { start, n: 0, pkg: [], gpuW: [], gpuT: [], zone: [], cpuMhz: [], gpuMhz: [], gpuUtil: [], throttle: 0, games: new Map(), mode };
  }
  private end(end: number): SessionSummary | null {
    const a = this.acc!; this.active = false; this.acc = null; this.hiSince = 0;
    const avg = (x: number[]) => (x.length ? x.reduce((p, c) => p + c, 0) / x.length : 0);
    const max = (x: number[]) => (x.length ? Math.max(...x) : 0);
    const game = [...a.games.entries()].sort((p, q) => q[1] - p[1])[0]?.[0] ?? null;
    const durationS = Math.round((end - a.start) / 1000);
    if (durationS < 60) return null;
    return {
      start: a.start, end, durationS, game, mode: a.mode,
      cpuPkgAvgW: +avg(a.pkg).toFixed(1), cpuPkgMaxW: +max(a.pkg).toFixed(1), gpuAvgW: +avg(a.gpuW).toFixed(1), gpuMaxW: +max(a.gpuW).toFixed(1),
      gpuTempAvg: +avg(a.gpuT).toFixed(1), gpuTempMax: max(a.gpuT), zoneTempMax: max(a.zone), cpuMhzAvg: Math.round(avg(a.cpuMhz)), gpuMhzAvg: Math.round(avg(a.gpuMhz)),
      gpuUtilAvg: +avg(a.gpuUtil).toFixed(0), throttleS: a.throttle,
    };
  }
}
