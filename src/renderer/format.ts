import type { Settings } from '../shared/types';

let unit: Settings['tempUnit'] = 'C';
export const setTempUnit = (u: Settings['tempUnit']) => { unit = u; };
export const tempUnit = () => unit;

export const temp = (c: number | null | undefined, digits = 0) =>
  c == null ? '–' : unit === 'F' ? `${(c * 9 / 5 + 32).toFixed(digits)}°F` : `${c.toFixed(digits)}°C`;
export const tempVal = (c: number) => (unit === 'F' ? c * 9 / 5 + 32 : c);

export function bytes(b: number | null | undefined, digits = 1): string {
  if (b == null || !Number.isFinite(b)) return '–';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let v = Math.abs(b);
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${(b < 0 ? -v : v).toFixed(i === 0 ? 0 : digits)} ${u[i]}`;
}
export const rate = (bps: number | null | undefined) => (bps == null ? '–' : `${bytes(bps)}/s`);
export function bits(bps: number | null | undefined): string {
  if (bps == null) return '–';
  const v = bps * 8;
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)} Gb/s`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)} Mb/s`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)} Kb/s`;
  return `${v.toFixed(0)} b/s`;
}
export const pct = (v: number | null | undefined, d = 0) => (v == null ? '–' : `${v.toFixed(d)}%`);
export const watts = (v: number | null | undefined, d = 1) => (v == null ? '–' : `${v.toFixed(d)} W`);
export const mhz = (v: number | null | undefined) => (v == null ? '–' : v >= 1000 ? `${(v / 1000).toFixed(2)} GHz` : `${Math.round(v)} MHz`);
export function duration(s: number): string {
  if (s < 60) return `${Math.round(s)} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
  const h = Math.floor(s / 3600); const m = Math.round((s % 3600) / 60);
  return h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h ${m} min`;
}
export const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const dateTime = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
export function ago(t: number): string {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
