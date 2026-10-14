import { PROFILE } from '../shared/profile';
import type { Snapshot } from '../shared/types';
import * as F from './format';
import { api, series, state, stagger, type View } from './state';
import { AnimNum, card, FanWidget, Gauge, h, icon, KV, LiveChart, Meter, MinMax, pill, spark } from './ui';

const head = (title: string, sub: string, actions?: any) => h('div', { class: 'view-head' }, h('div', null, h('h1', null, title), h('p', null, sub)), actions ? h('div', { class: 'actions' }, actions) : null);
const win = () => state.settings.chartWindowS * 1000;
const tempGauge = (label: string, warn: number, crit: number) =>
  new Gauge({ label, unit: F.tempUnit() === 'F' ? '°F' : '°C', max: F.tempUnit() === 'F' ? 212 : 100, fmt: (v) => v.toFixed(0), warn: F.tempVal(warn), crit: F.tempVal(crit), marks: [{ at: F.tempVal(PROFILE.cpu.prochotC), label: 'PROCHOT' }] });

// ═══════════════════════════════════════════════════════════════
//  OVERVIEW
// ═══════════════════════════════════════════════════════════════
/** One line saying how the whole-laptop draw was obtained. */
export function drawSource(s: Snapshot): string {
  const d = s.derived;
  return d.systemDrawSource === 'battery' ? 'measured · battery discharge rate'
    : d.systemDrawSource === 'learned' ? `CPU + GPU + ${d.restW.toFixed(0)} W rest (learned on battery)`
    : `CPU + GPU + ~${d.restW.toFixed(0)} W rest (estimate)`;
}

export function overviewView(): View {
  let u: ((s: Snapshot) => void)[] = [];
  return {
    id: 'overview', title: 'Overview', icon: 'dashboard', group: 'Monitor',
    mount(root) {
      u = [];
      const tiles: Record<string, () => HTMLElement> = {
        cpu: () => {
          const n = new AnimNum((v) => v.toFixed(0), 'hero-num'); const side = h('div', { class: 'hero-side' });
          const sp = spark(series, 'cpuUtil', 'var(--accent)', 54, 100);
          const mm = new MinMax((v) => `${v.toFixed(0)}%`);
          u.push((s) => {
            n.set(s.tick?.cpu.util); side.innerHTML = `<b>${F.mhz(s.tick?.cpu.mhz)}</b><br>${F.temp(s.derived.cpuTempC)} · <b>${F.watts(s.tick?.power.pkgW)}</b>`;
            mm.set(series.stats('cpuUtil'), series.peak('cpuUtil'));
            const t = series.stats('cpuTemp'); const w = series.stats('pkgW'); const tp = series.peak('cpuTemp'); const c = series.stats('cpuMhz'); const cp = series.peak('cpuMhz');
            const ghz = (v: number) => (v / 1000).toFixed(2);
            mm.setExtra(`Clock <b>${c ? `${ghz(c.min)} – ${ghz(c.max)} GHz` : '–'}</b> · avg <b>${c ? ghz(c.avg) : '–'}</b> · peak <b>${cp ? ghz(cp.v) : '–'}</b><br>Temp <b>${t ? `${F.temp(t.min)} – ${F.temp(t.max)}` : '–'}</b> · peak <b>${tp ? F.temp(tp.v) : '–'}</b> &nbsp; Power <b>${w ? `${w.min.toFixed(0)}–${w.max.toFixed(0)} W` : '–'}</b>`);
          });
          return card({ title: 'CPU', sub: state.static?.cpu.name.replace(/\(R\)|\(TM\)|CPU @.*/g, '') ?? 'i7-10750H', icon: 'cpu', cls: 'hero', span: 4, to: 'cpu' }, h('div', { class: 'hero-top' }, n.el, h('span', { class: 'hero-unit' }, '%'), side), sp.el, mm.el);
        },
        gpu: () => {
          const n = new AnimNum((v) => v.toFixed(0), 'hero-num'); const side = h('div', { class: 'hero-side' });
          const sp = spark(series, 'gpuUtil', 'var(--green)', 54, 100);
          const mm = new MinMax((v) => `${v.toFixed(0)}%`);
          u.push((s) => {
            n.set(s.gpu?.util); side.innerHTML = `<b>${F.mhz(s.gpu?.coreMHz)}</b><br>${F.temp(s.gpu?.tempC)} · <b>${F.watts(s.gpu?.powerW)}</b>`;
            mm.set(series.stats('gpuUtil'), series.peak('gpuUtil'));
            const t = series.stats('gpuTemp'); const w = series.stats('gpuW'); const tp = series.peak('gpuTemp'); const c = series.stats('gpuMHz'); const cp = series.peak('gpuMHz');
            const ghz = (v: number) => (v / 1000).toFixed(2);
            mm.setExtra(`Clock <b>${c ? `${ghz(c.min)} – ${ghz(c.max)} GHz` : '–'}</b> · avg <b>${c ? ghz(c.avg) : '–'}</b> · peak <b>${cp ? ghz(cp.v) : '–'}</b><br>Temp <b>${t ? `${F.temp(t.min)} – ${F.temp(t.max)}` : '–'}</b> · peak <b>${tp ? F.temp(tp.v) : '–'}</b> &nbsp; Power <b>${w ? `${w.min.toFixed(0)}–${w.max.toFixed(0)} W` : '–'}</b>`);
          });
          return card({ title: 'GPU', sub: 'RTX 2060 · 6 GB GDDR6', icon: 'gpu', cls: 'hero', span: 4, to: 'gpu' }, h('div', { class: 'hero-top' }, n.el, h('span', { class: 'hero-unit' }, '%'), side), sp.el, mm.el);
        },
        power: () => {
          const n = new AnimNum((v) => v.toFixed(0), 'hero-num'); const side = h('div', { class: 'hero-side' });
          const sp = new LiveChart(series, [{ key: 'pkgW', label: '', color: 'var(--peach)' }, { key: 'gpuW', label: '', color: 'var(--green)' }], { height: 54, mini: true, windowMs: () => 60000 });
          const mm = new MinMax((v) => `${v.toFixed(0)} W`);
          u.push((s) => {
            n.set(s.derived.systemDrawW); side.innerHTML = `<b>${s.derived.psMode}</b><br>${s.derived.plState} · ${s.derived.adapterPct != null ? `<b>${s.derived.adapterPct.toFixed(0)}%</b> of 230 W` : 'on battery'}`;
            const src = drawSource(s); if (subEl && subEl.textContent !== src) subEl.textContent = src;
            mm.set(series.stats('systemW'), series.peak('systemW'));
            const c = series.stats('pkgW'); const g = series.stats('gpuW'); const pk = series.peak('pkgW'); const gk = series.peak('gpuW');
            mm.setExtra(`<span style="color:var(--peach)">●</span> CPU <b>${c ? `${c.min.toFixed(0)}–${c.max.toFixed(0)} W` : '–'}</b> peak <b>${pk ? pk.v.toFixed(0) : '–'}</b> &nbsp; <span style="color:var(--green)">●</span> GPU <b>${g ? `${g.min.toFixed(0)}–${g.max.toFixed(0)} W` : '–'}</b> peak <b>${gk ? gk.v.toFixed(0) : '–'}</b>`);
          });
          const el = card({ title: 'System power', sub: 'CPU package + GPU + rest', icon: 'power', cls: 'hero', span: 4, to: 'power' }, h('div', { class: 'hero-top' }, n.el, h('span', { class: 'hero-unit' }, 'W'), side), sp.el, mm.el);
          const subEl = el.querySelector<HTMLElement>('.card-sub');
          return el;
        },
        memory: () => {
          const m = new Meter('RAM', 100, state.settings.thresholds.ramWarn, 95); const v = new Meter('VRAM', 100, state.settings.thresholds.vramWarn, 97); const c = new Meter('Commit', 100, 85, 95);
          u.push((s) => {
            const k = s.tick; if (k) { m.set((k.mem.used / k.mem.total) * 100, `${F.bytes(k.mem.used)} / ${F.bytes(k.mem.total)}`); c.set((k.mem.commit / k.mem.commitLimit) * 100, `${F.bytes(k.mem.commit)} / ${F.bytes(k.mem.commitLimit)}`); }
            const g = s.gpu; if (g?.memUsedMiB != null && g.memTotalMiB) v.set((g.memUsedMiB / g.memTotalMiB) * 100, `${(g.memUsedMiB / 1024).toFixed(2)} / ${(g.memTotalMiB / 1024).toFixed(0)} GB`);
          });
          return card({ title: 'Memory', sub: '2 × 8 GB DDR4-2933 dual-channel', icon: 'memory', span: 4, to: 'memory' }, m.el, v.el, c.el);
        },
        thermal: () => {
          const g1 = tempGauge('CPU', state.settings.thresholds.cpuTempWarn, state.settings.thresholds.cpuTempCrit);
          const g2 = tempGauge('GPU', state.settings.thresholds.gpuTempWarn, state.settings.thresholds.gpuTempCrit);
          const g3 = tempGauge('Board', state.settings.thresholds.zoneTempWarn, PROFILE.cpu.prochotC);
          [g1, g2, g3].forEach((g) => (g.el.style.width = g.el.style.height = '128px'));
          u.push((s) => { g1.set(s.derived.cpuTempC != null ? F.tempVal(s.derived.cpuTempC) : null, s.derived.cpuTempSource.split(' (')[0]); g2.set(s.gpu?.tempC != null ? F.tempVal(s.gpu.tempC) : null, s.gpu?.pstate ?? ''); g3.set(s.tick?.thermal.zoneC != null ? F.tempVal(s.tick.thermal.zoneC) : null, 'ACPI zone'); });
          return card({ title: 'Temperatures', sub: `PROCHOT ${F.temp(PROFILE.cpu.prochotC)}`, icon: 'thermal', span: 4, to: 'thermal' }, h('div', { class: 'gauges' }, g1.el, g2.el, g3.el));
        },
        battery: () => {
          const n = new AnimNum((v) => v.toFixed(0), 'hero-num'); const side = h('div', { class: 'hero-side' });
          u.push((s) => {
            const b = s.tick?.battery; const full = state.slow?.battery.fullWh;
            n.set(b && full ? Math.min(100, (b.remainingWh / full) * 100) : null);
            side.innerHTML = b ? `<b>${b.online ? (b.charging ? `charging ${b.chargeRateW.toFixed(1)} W` : 'on AC') : `−${b.dischargeRateW.toFixed(1)} W`}</b><br>${b.remainingWh.toFixed(1)} Wh · ${b.voltageV.toFixed(2)} V · health <b>${full ? ((full / PROFILE.power.batteryDesignWh) * 100).toFixed(0) : '–'}%</b>` : '';
          });
          return card({ title: 'Battery', sub: 'AP18E7M · 230 W Delta adapter', icon: 'battery', cls: 'hero', span: 4, to: 'power', toLabel: 'Power & battery' }, h('div', { class: 'hero-top' }, n.el, h('span', { class: 'hero-unit' }, '%'), side), spark(series, 'batWh', 'var(--teal)', 40).el);
        },
        storage: () => {
          const box = h('div');
          const render = () => { box.replaceChildren(...(state.slow?.volumes ?? []).sort((a, b) => a.letter.localeCompare(b.letter)).map((v) => { const m = new Meter(`${v.letter}:  ${v.label || ''}`, 100, 100 - state.settings.thresholds.diskFreeWarnPct * 2, 100 - state.settings.thresholds.diskFreeWarnPct); m.set(((v.size - v.free) / v.size) * 100, `${F.bytes(v.free)} free`); return m.el; })); };
          render(); u.push(() => { if ((box as any)._t !== state.slow?.t) { (box as any)._t = state.slow?.t; render(); } });
          const io = h('div', { class: 'stat-row', style: { marginTop: '12px' } });
          u.push((s) => { const k = s.tick; if (k) io.innerHTML = `Read<b>${F.rate(k.disks.reduce((a, d) => a + d.r, 0))}</b> Write<b>${F.rate(k.disks.reduce((a, d) => a + d.w, 0))}</b>`; });
          return card({ title: 'Storage', sub: '2.26 TB · 3 drives', icon: 'storage', span: 4, to: 'storage' }, box, io);
        },
        network: () => {
          const ch = new LiveChart(series, [{ key: 'netRx', label: 'Down', color: 'var(--sky)', fmt: (v) => `${v.toFixed(2)} MB/s` }, { key: 'netTx', label: 'Up', color: 'var(--pink)', fmt: (v) => `${v.toFixed(2)} MB/s` }], { height: 120, yFmt: (v) => v.toFixed(1), windowMs: win });
          const info = h('div', { class: 'stat-row' });
          u.push(() => { const a = state.slow?.adapters.find((x) => x.up); const w = state.slow?.wifi; info.innerHTML = a ? `${a.name}<b>${(a.speed / 1e6).toFixed(0)} Mb/s</b>${w?.signal ? ` Signal<b>${w.signal}</b>` : ''}` : 'offline'; });
          return card({ title: 'Network', sub: 'Killer AX1650i · E2600', icon: 'network', span: 4, to: 'network' }, info, ch.el);
        },
        fans: () => {
          const c = new FanWidget({ label: 'CPU', maxRpm: PROFILE.cooling.cpuFanMaxRpm, blades: 26, size: 150, style: 'polymer' });
          const g = new FanWidget({ label: 'GPU', maxRpm: PROFILE.cooling.gpuFanMaxRpm, blades: 32, size: 150, style: 'metal' });
          u.push((s) => { const a = s.tick?.acer; c.set(a?.cpuFanRpm ?? null, a?.cpuFanMode ?? null); g.set(a?.gpuFanRpm ?? null, a?.gpuFanMode ?? null); });
          return card({ title: 'Cooling', sub: 'Fan RPM from the EC', icon: 'fan', span: 4, to: 'thermal', toLabel: 'Fan control' }, h('div', { class: 'fans' }, c.el, g.el));
        },
        display: () => {
          const kvv = new KV(['Ultrawide', 'Laptop panel', 'Link budget', 'Optimus']);
          u.push((s) => {
            const vcs = state.slow?.videoControllers ?? []; const nv = vcs.find((v) => /nvidia/i.test(v.name) && v.w); const it = vcs.find((v) => /intel/i.test(v.name) && v.w);
            kvv.set('Ultrawide', nv ? `${nv.w}×${nv.h} @ ${nv.hz} Hz` : 'not connected');
            kvv.set('Laptop panel', it ? `on · ${it.w}×${it.h} @ ${it.hz} Hz` : 'off');
            kvv.set('Link budget', s.derived.linkPct != null ? `${s.derived.linkPct.toFixed(0)}% of HBR3${s.derived.linkNeedsDsc ? ' · DSC for 10-bit' : ''}` : '–');
            kvv.set('Optimus', pill(s.derived.optimusBypass === 'bypassed' ? 'bypassed' : s.derived.optimusBypass === 'laptop-on' ? 'laptop screen on' : s.derived.optimusBypass, s.derived.optimusBypass === 'bypassed' ? 'ok' : s.derived.optimusBypass === 'laptop-on' ? 'warn' : ''));
          });
          return card({ title: 'Displays', sub: 'AW3425DWM via mDP → DP', icon: 'display', span: 4, to: 'display' }, kvv.el);
        },
      };
      // health + insights strip
      const ring = h('div', { class: 'health-ring' }, h('span', null, '–'));
      const insList = new InsightList();
      const pMode = pill('–', 'info'); const pPl = pill('–', 'ok'); const pSess = pill('', 'warn'); pSess.style.display = 'none';
      const mode = h('div', { class: 'row' }, pMode, pPl, pSess);
      u.push((s) => {
        ring.style.setProperty('--v', String(s.derived.healthScore)); ring.querySelector('span')!.textContent = String(s.derived.healthScore);
        if (pMode.textContent !== s.derived.psMode) pMode.textContent = s.derived.psMode;
        if (pPl.textContent !== s.derived.plState) { pPl.textContent = s.derived.plState; pPl.className = `pill ${/hermal/.test(s.derived.plState) ? 'crit' : s.derived.plState === 'PL2 boost' ? 'warn' : 'ok'}`; }
        pSess.style.display = s.derived.sessionActive ? '' : 'none'; if (s.derived.sessionActive) pSess.textContent = `Gaming ${F.duration(s.derived.sessionS)}`;
        const rank = (l: string) => (l === 'crit' ? 0 : l === 'warn' ? 1 : l === 'info' ? 2 : 3);
        const top = s.insights.filter((i) => i.level !== 'ok').sort((a, b) => rank(a.level) - rank(b.level) || a.id.localeCompare(b.id)).slice(0, 4);
        insList.set(top.length ? top : s.insights.slice(0, 3));
      });
      const healthCard = card({ title: 'Machine health', sub: 'Live checks against the PH315-53 profile', icon: 'sparkles', span: 12, actions: h('button', { class: 'btn ghost', onclick: () => location.hash = '#insights' }, 'All insights', icon('chevron', 14, 'flip')) },
        h('div', { class: 'health' }, ring, h('div', { style: { flex: '1', minWidth: '0' } }, mode, h('div', { style: { marginTop: '12px' } }, insList.el))));
      const tileEls = state.settings.overviewTiles.filter((t) => tiles[t]).map((t) => tiles[t]());
      // fill the last row: a lone tile spans the full width, a pair splits it
      const rem = tileEls.length % 3;
      if (rem === 1) tileEls[tileEls.length - 1].style.gridColumn = 'span 12';
      if (rem === 2) tileEls.slice(-2).forEach((el) => (el.style.gridColumn = 'span 6'));
      const grid = h('div', { class: 'grid' }, healthCard, ...tileEls);
      root.append(head('Overview', `${state.static?.system.model ?? 'Predator PH315-53'} · ${state.static?.system.os ?? ''} · live`), grid);
      stagger(root);
    },
    update(s) { for (const f of u) f(s); },
  };
}

function wifiKv(w: Record<string, string>) {
  const k = new KV(['SSID', 'Radio', 'Band / channel', 'Signal', 'Rx / Tx rate', 'Security']);
  k.set('SSID', w.ssid); k.set('Radio', w.radio); k.set('Band / channel', `${w.band} · ch ${w.channel}`); k.set('Signal', w.signal); k.set('Rx / Tx rate', `${w.rx} / ${w.tx} Mb/s`); k.set('Security', w.auth);
  return k.el;
}

/** Keyed insight list: rows are created once and patched in place, so nothing re-animates or flickers.
 *  Only insights that newly appear play the entrance animation. */
export class InsightList {
  el = h('div', { class: 'insights' });
  private rows = new Map<string, { el: HTMLElement; lvl: HTMLElement; title: HTMLElement; detail: HTMLElement; tip: HTMLElement; bar: HTMLElement; barFill: HTMLElement; cat: HTMLElement; level: string }>();
  set(list: { id: string; level: string; title: string; detail: string; tip?: string; category: string; value?: number; max?: number }[]) {
    const keep = new Set(list.map((i) => i.id));
    for (const [id, r] of this.rows) if (!keep.has(id)) { r.el.remove(); this.rows.delete(id); }
    list.forEach((i, idx) => {
      let r = this.rows.get(i.id);
      if (!r) {
        const lvl = h('div', { class: 'lvl' }); const title = h('b'); const detail = h('p'); const tip = h('div', { class: 'tip' });
        const barFill = h('i'); const bar = h('div', { class: 'ins-bar' }, barFill); const cat = h('span', { class: 'cat' });
        const el = h('div', { class: 'insight' }, lvl, h('div', null, title, detail, tip, bar), cat);
        r = { el, lvl, title, detail, tip, bar, barFill, cat, level: '' };
        this.rows.set(i.id, r);
      }
      if (r.level !== i.level) { r.el.className = `insight ${i.level}`; r.lvl.replaceChildren(icon(i.level === 'ok' ? 'check' : i.level === 'info' ? 'info' : 'alert', 18)); r.level = i.level; }
      if (r.title.textContent !== i.title) r.title.textContent = i.title;
      if (r.detail.textContent !== i.detail) r.detail.textContent = i.detail;
      const tip = i.tip ? `→ ${i.tip}` : '';
      if (r.tip.textContent !== tip) { r.tip.textContent = tip; r.tip.style.display = tip ? '' : 'none'; }
      if (r.cat.textContent !== i.category) r.cat.textContent = i.category;
      const hasBar = i.value != null && !!i.max;
      r.bar.style.display = hasBar ? '' : 'none';
      if (hasBar) r.barFill.style.transform = `scaleX(${Math.min(1, i.value! / i.max!)})`;
      // keep DOM order = list order without re-inserting rows that are already in place
      if (this.el.children[idx] !== r.el) this.el.insertBefore(r.el, this.el.children[idx] ?? null);
    });
  }
}

export function insightRow(i: { level: string; title: string; detail: string; tip?: string; category: string; value?: number; max?: number }) {
  const ic = i.level === 'ok' ? 'check' : i.level === 'info' ? 'info' : 'alert';
  return h('div', { class: `insight ${i.level}` }, h('div', { class: 'lvl' }, icon(ic, 18)),
    h('div', null, h('b', null, i.title), h('p', null, i.detail), i.tip ? h('div', { class: 'tip' }, '→ ', i.tip) : null,
      i.value != null && i.max ? h('div', { class: 'ins-bar' }, h('i', { style: { transform: `scaleX(${Math.min(1, i.value / i.max)})` } })) : null),
    h('span', { class: 'cat' }, i.category));
}

// ═══════════════════════════════════════════════════════════════
//  CPU
// ═══════════════════════════════════════════════════════════════
export function cpuView(): View {
  let u: ((s: Snapshot) => void)[] = [];
  return {
    id: 'cpu', title: 'Processor', icon: 'cpu', group: 'Hardware',
    mount(root) {
      u = [];
      const st = state.static?.cpu;
      const gLoad = new Gauge({ label: 'Load', unit: '%', max: 100, warn: 85, crit: 97 });
      const gClk = new Gauge({ label: 'Clock', unit: 'GHz', max: 5, fmt: (v) => v.toFixed(2), marks: [{ at: 2.6, label: 'base' }, { at: 4.3, label: 'all-core' }] });
      const gPkg = new Gauge({ label: 'Package', unit: 'W', max: PROFILE.cpu.pl2W, fmt: (v) => v.toFixed(1), warn: PROFILE.cpu.pl1W, marks: [{ at: PROFILE.cpu.pl1W, label: 'PL1' }] });
      const gTmp = tempGauge('Temperature', state.settings.thresholds.cpuTempWarn, state.settings.thresholds.cpuTempCrit);
      u.push((s) => { gLoad.set(s.tick?.cpu.util); gClk.set(s.tick ? s.tick.cpu.mhz / 1000 : null, `${s.tick?.cpu.perf?.toFixed(0) ?? '–'}% of base`); gPkg.set(s.tick?.power.pkgW, s.derived.plState); gTmp.set(s.derived.cpuTempC != null ? F.tempVal(s.derived.cpuTempC) : null, s.derived.cpuTempSource.split(' (')[0]); });

      const cores = h('div', { class: 'cores' });
      const fills: HTMLElement[] = []; const labels: HTMLElement[] = []; const mhzL: HTMLElement[] = [];
      (st?.coreNames ?? Array.from({ length: 12 }, (_, i) => `0,${i}`)).forEach((_, i) => {
        const f = h('div', { class: 'core-fill' }); const l = h('b', null, '–'); const m = h('span', null, '');
        fills.push(f); labels.push(l); mhzL.push(m);
        cores.append(h('div', { class: 'core' }, l, h('div', { class: 'core-bar' }, f), h('span', null, `T${i}`), m));
      });
      u.push((s) => s.tick?.cpu.coreUtil.forEach((v, i) => { if (fills[i]) { fills[i].style.transform = `scaleY(${v / 100})`; labels[i].textContent = `${Math.round(v)}`; mhzL[i].textContent = `${((s.tick!.cpu.coreMhz[i] ?? 0) / 1000).toFixed(1)}`; } }));

      const loadChart = new LiveChart(series, [{ key: 'cpuUtil', label: 'Total', color: 'var(--accent)', fmt: (v) => `${v.toFixed(0)}%` }, { key: 'cpuPriv', label: 'Kernel', color: 'var(--peach)', fmt: (v) => `${v.toFixed(0)}%`, fill: false }], { height: 200, max: 100, windowMs: win, yFmt: (v) => `${v}%` });
      const clkChart = new LiveChart(series, [{ key: 'cpuMhz', label: 'Effective clock', color: 'var(--sky)', fmt: (v) => `${(v / 1000).toFixed(2)} GHz` }], { height: 200, windowMs: win, yFmt: (v) => (v / 1000).toFixed(1), refLines: [{ v: 2600, label: 'base 2.6', color: 'var(--ov1)' }, { v: 4300, label: 'all-core 4.3', color: 'var(--green)' }] });
      const pwrChart = new LiveChart(series, [{ key: 'pkgW', label: 'Package', color: 'var(--peach)', fmt: (v) => `${v.toFixed(1)} W` }, { key: 'coresW', label: 'Cores', color: 'var(--yellow)', fmt: (v) => `${v.toFixed(1)} W`, fill: false }, { key: 'ewma', label: 'Tau EWMA', color: 'var(--mauve)', fmt: (v) => `${v.toFixed(1)} W`, fill: false, dashed: true }],
        { height: 220, windowMs: win, yFmt: (v) => `${v.toFixed(0)}`, refLines: [{ v: PROFILE.cpu.pl1W, label: 'PL1 70 W', color: 'var(--yellow)' }, { v: PROFILE.cpu.pl2W, label: 'PL2 107 W', color: 'var(--red)' }] });

      const info = new KV(['Model', 'Cores / threads', 'Base / turbo', 'Cache', 'Socket', 'Context switches', 'Run queue', 'Threads / processes', 'Interrupt / DPC']);
      info.set('Model', st?.name ?? '–'); info.set('Cores / threads', `${st?.cores ?? 6} / ${st?.threads ?? 12}`); info.set('Base / turbo', '2.60 GHz / 5.00 GHz (TVB)');
      info.set('Cache', `L2 ${st?.l2KB ?? '–'} KB · L3 ${st?.l3KB ?? '–'} KB`); info.set('Socket', st?.socket ?? 'FCBGA1440');
      u.push((s) => { const c = s.tick?.cpu; if (!c) return; info.set('Context switches', `${c.ctxSwitches.toLocaleString()}/s`); info.set('Run queue', String(c.queue)); info.set('Threads / processes', `${c.threads} / ${c.processes}`); info.set('Interrupt / DPC', `${c.intr.toFixed(2)}% / ${c.dpc.toFixed(2)}%`); });

      const limits = new KV(['State', 'Effective PL1', 'PL2 · Tau', 'Boost left', 'TVB (≤65 °C)', 'PROCHOT']);
      u.push((s) => {
        const d = s.derived; limits.set('State', pill(d.plState, d.plState.startsWith('Thermal') ? 'crit' : d.plState === 'PL2 boost' ? 'warn' : 'ok'));
        limits.set('Effective PL1', `${d.pl1EffW} W${d.pl1EffW < 70 ? ' (EC sharing with GPU)' : ''}`); limits.set('PL2 · Tau', `107 W · ${/Turbo/.test(d.psMode) ? 56 : 28} s`);
        limits.set('Boost left', d.tauLeftS != null ? `~${d.tauLeftS.toFixed(0)} s` : '–'); limits.set('TVB (≤65 °C)', d.cpuTempC != null && d.cpuTempSource.startsWith('CPU') ? (d.cpuTempC <= 65 ? pill('5.0 GHz available', 'ok') : pill('off — 4.8 GHz max', 'info')) : 'needs CPU temp sensor');
        limits.set('PROCHOT', d.cpuTempC != null ? `${Math.max(0, 92 - d.cpuTempC).toFixed(0)} °C headroom` : '–');
      });

      root.append(head('Processor', `${st?.name ?? 'Intel Core i7-10750H'} · live per-thread load, clocks and power limits`),
        h('div', { class: 'grid' },
          card({ title: 'Live', icon: 'gauge', span: 12 }, h('div', { class: 'gauges' }, gLoad.el, gClk.el, gPkg.el, gTmp.el)),
          card({ title: 'Per-thread load & clock', sub: '% load (top) · GHz (bottom)', icon: 'layers', span: 12 }, cores),
          card({ title: 'Load', icon: 'activity', span: 6 }, loadChart.el),
          card({ title: 'Effective clock', icon: 'clock', span: 6 }, clkChart.el),
          card({ title: 'Package power vs PL1 / PL2', sub: 'Intel RAPL · no admin needed', icon: 'zap', span: 8 }, pwrChart.el),
          card({ title: 'Power-limit model', sub: 'EWMA of package power with Tau', icon: 'gauge', span: 4 }, limits.el),
          card({ title: 'Details', icon: 'info', span: 12 }, info.el)));
      stagger(root);
    },
    update(s) { for (const f of u) f(s); },
  };
}

// ═══════════════════════════════════════════════════════════════
//  GPU
// ═══════════════════════════════════════════════════════════════
export function gpuView(): View {
  let u: ((s: Snapshot) => void)[] = [];
  return {
    id: 'gpu', title: 'Graphics', icon: 'gpu', group: 'Hardware',
    mount(root) {
      u = [];
      const gs = state.gpuStatic;
      const gU = new Gauge({ label: 'Load', unit: '%', max: 100 });
      const gT = tempGauge('Temperature', state.settings.thresholds.gpuTempWarn, state.settings.thresholds.gpuTempCrit);
      const gP = new Gauge({ label: 'Power', unit: 'W', max: 95, fmt: (v) => v.toFixed(1), marks: [{ at: 80, label: 'Normal' }, { at: 90, label: 'Turbo' }] });
      const gC = new Gauge({ label: 'Core', unit: 'MHz', max: 2100, marks: [{ at: 1485, label: 'Normal' }, { at: 1680, label: 'Turbo' }] });
      const gV = new Gauge({ label: 'VRAM', unit: 'GB', max: 6, fmt: (v) => v.toFixed(2), warn: 5.4, crit: 5.85 });
      u.push((s) => { const g = s.gpu; gU.set(g?.util, g?.pstate ?? ''); gT.set(g?.tempC != null ? F.tempVal(g.tempC) : null); gP.set(g?.powerW, `limit ${g?.limitW ?? '–'} W`); gC.set(g?.coreMHz, `mem ${g?.memMHz ?? '–'} MHz`); gV.set(g?.memUsedMiB != null ? g.memUsedMiB / 1024 : null, `${g?.memUtil ?? '–'}% bus`); });
      const c1 = new LiveChart(series, [{ key: 'gpuUtil', label: 'Load', color: 'var(--green)', fmt: (v) => `${v.toFixed(0)}%` }, { key: 'gpuMemUtil', label: 'Memory bus', color: 'var(--teal)', fmt: (v) => `${v.toFixed(0)}%`, fill: false }], { height: 200, max: 100, windowMs: win });
      const c2 = new LiveChart(series, [{ key: 'gpuW', label: 'Power', color: 'var(--peach)', fmt: (v) => `${v.toFixed(1)} W` }, { key: 'gpuLimit', label: 'Limit', color: 'var(--red)', fmt: (v) => `${v.toFixed(0)} W`, fill: false, dashed: true }], { height: 200, windowMs: win, yFmt: (v) => v.toFixed(0) });
      const c3 = new LiveChart(series, [{ key: 'gpuMHz', label: 'Core', color: 'var(--sky)', fmt: (v) => `${v.toFixed(0)} MHz` }], { height: 200, windowMs: win, refLines: [{ v: 1485, label: 'Normal top', color: 'var(--ov1)' }, { v: 1680, label: 'Turbo top', color: 'var(--green)' }] });
      const c4 = new LiveChart(series, [{ key: 'gpuTemp', label: 'GPU', color: 'var(--red)', fmt: (v) => F.temp(v) }], { height: 200, windowMs: win, refLines: [{ v: state.settings.thresholds.gpuTempWarn, label: 'warn', color: 'var(--yellow)' }] });
      const kvv = new KV(['Model', 'Driver', 'VBIOS', 'CUDA compute', 'PCIe', 'Power limits', 'PredatorSense', 'Throttle reasons', 'Encoder', 'Driving display']);
      kvv.set('Model', gs?.name ?? 'RTX 2060'); kvv.set('Driver', gs?.driver ?? '–'); kvv.set('VBIOS', gs?.vbios ?? '–'); kvv.set('CUDA compute', gs?.computeCap ?? '–');
      u.push((s) => {
        const g = s.gpu; if (!g) return;
        kvv.set('PCIe', `Gen ${g.pcieGen} x${g.pcieWidth} (max Gen ${gs?.pcieGenMax ?? 3} x${gs?.pcieWidthMax ?? 16})`);
        kvv.set('Power limits', `enforced ${g.limitW} W · default ${gs?.defaultLimitW ?? 80} W · max ${g.maxLimitW} W`);
        kvv.set('PredatorSense', pill(s.derived.psMode, 'info'));
        const r = gpuReasons(g.throttleMask); kvv.set('Throttle reasons', r.length ? r.join(', ') : 'none');
        kvv.set('Encoder', `${g.encSessions ?? 0} sessions · ${g.encFps ?? 0} fps`); kvv.set('Driving display', g.displayActive ?? '–');
      });
      const tiers = h('table', { class: 'table' }, h('thead', null, h('tr', null, ['Mode', 'TGP', 'Offsets', 'Sustained clock'].map((x) => h('th', null, x)))),
        h('tbody', null, [['Normal', '80 W', '+0 / +0', '1,350–1,485 MHz'], ['Fast', '85–90 W', '+50 / +30', '1,500–1,590 MHz'], ['Turbo', '90 W (~93.5 peak)', '+100 / +60', '1,575–1,680 MHz']].map((r) => h('tr', null, r.map((c) => h('td', null, c))))));
      root.append(head('Graphics', `${gs?.name ?? 'NVIDIA GeForce RTX 2060'} · driver ${gs?.driver ?? ''} · live from nvidia-smi`),
        h('div', { class: 'grid' },
          card({ title: 'Live', icon: 'gauge', span: 12 }, h('div', { class: 'gauges' }, gU.el, gT.el, gP.el, gC.el, gV.el)),
          card({ title: 'Load', icon: 'activity', span: 6 }, c1.el), card({ title: 'Power vs limit', icon: 'zap', span: 6 }, c2.el),
          card({ title: 'Core clock', icon: 'clock', span: 6 }, c3.el), card({ title: 'Temperature', icon: 'thermal', span: 6 }, c4.el),
          card({ title: 'Details', icon: 'info', span: 7 }, kvv.el), card({ title: 'PredatorSense VBIOS tiers', sub: 'from the dossier', icon: 'layers', span: 5 }, tiers)));
      stagger(root);
    },
    update(s) { for (const f of u) f(s); },
  };
}
export function gpuReasons(mask: number | null): string[] {
  if (mask == null) return [];
  return ([[0x4, 'SW power cap'], [0x8, 'HW slowdown'], [0x20, 'SW thermal'], [0x40, 'HW thermal'], [0x80, 'HW power brake'], [0x100, 'Display clock']] as [number, string][]).filter(([b]) => mask & b).map(([, n]) => n);
}

// ═══════════════════════════════════════════════════════════════
//  MEMORY
// ═══════════════════════════════════════════════════════════════
export function memoryView(): View {
  let u: ((s: Snapshot) => void)[] = [];
  return {
    id: 'memory', title: 'Memory', icon: 'memory', group: 'Hardware',
    mount(root) {
      u = [];
      const g = new Gauge({ label: 'In use', unit: '%', max: 100, warn: state.settings.thresholds.ramWarn, crit: 95 });
      const meters = ['Used', 'Committed', 'Cache', 'Compressed', 'Paged pool', 'Non-paged pool', 'Page file'].map((n) => new Meter(n));
      u.push((s) => {
        const m = s.tick?.mem; if (!m) return;
        g.set((m.used / m.total) * 100, `${(m.used / 2 ** 30).toFixed(1)} / ${(m.total / 2 ** 30).toFixed(1)} GB`);
        meters[0].set((m.used / m.total) * 100, F.bytes(m.used)); meters[1].set((m.commit / m.commitLimit) * 100, `${F.bytes(m.commit)} / ${F.bytes(m.commitLimit)}`);
        meters[2].set((m.cache / m.total) * 100, F.bytes(m.cache)); meters[3].set((m.compressed / m.total) * 100, F.bytes(m.compressed));
        meters[4].set((m.paged / m.total) * 100, F.bytes(m.paged)); meters[5].set((m.nonpaged / m.total) * 100, F.bytes(m.nonpaged)); meters[6].set(m.pagefilePct, F.pct(m.pagefilePct, 1));
      });
      const chart = new LiveChart(series, [{ key: 'memUsed', label: 'Used', color: 'var(--accent)', fmt: (v) => `${v.toFixed(2)} GB` }, { key: 'memCommit', label: 'Committed', color: 'var(--peach)', fmt: (v) => `${v.toFixed(2)} GB`, fill: false }, { key: 'memCache', label: 'Cache', color: 'var(--teal)', fmt: (v) => `${v.toFixed(2)} GB`, fill: false }], { height: 220, windowMs: win });
      const faults = new LiveChart(series, [{ key: 'pageFaults', label: 'Page faults/s', color: 'var(--yellow)', fmt: (v) => v.toFixed(0) }], { height: 140, windowMs: win });
      const mods = h('table', { class: 'table' }, h('thead', null, h('tr', null, ['Slot', 'Size', 'Maker', 'Part', 'Rated', 'Running', 'Width', 'Voltage'].map((x) => h('th', null, x)))),
        h('tbody', null, (state.static?.memory.modules ?? []).map((m) => h('tr', null, [m.slot, F.bytes(m.bytes, 0), m.maker, m.part, `${m.rated} MT/s`, `${m.running} MT/s`, `${m.width}-bit`, `${m.volts.toFixed(2)} V`].map((c) => h('td', null, c))))));
      root.append(head('Memory', '16 GB DDR4 · dual-channel 128-bit · IMC-capped at 2933 MT/s'),
        h('div', { class: 'grid' },
          card({ title: 'Usage', icon: 'gauge', span: 4 }, h('div', { class: 'gauges' }, g.el)),
          card({ title: 'Breakdown', icon: 'layers', span: 8 }, ...meters.map((m) => m.el)),
          card({ title: 'History', icon: 'activity', span: 8 }, chart.el), card({ title: 'Paging', icon: 'activity', span: 4 }, faults.el),
          card({ title: 'Modules', sub: 'dual-channel = 46.9 GB/s peak', icon: 'memory', span: 12 }, mods)));
      stagger(root);
    },
    update(s) { for (const f of u) f(s); },
  };
}

// ═══════════════════════════════════════════════════════════════
//  STORAGE
// ═══════════════════════════════════════════════════════════════
export function storageView(): View {
  let u: ((s: Snapshot) => void)[] = [];
  return {
    id: 'storage', title: 'Storage', icon: 'storage', group: 'Hardware',
    mount(root) {
      u = [];
      const grid = h('div', { class: 'grid' });
      const disks = state.static?.disks ?? []; const parts = state.slow?.partitions ?? []; const vols = state.slow?.volumes ?? [];
      const bus: Record<number, string> = { 8: 'RAID (Intel RST)', 17: 'NVMe', 11: 'SATA', 7: 'USB' };
      for (const d of [...disks].sort((a, b) => a.id - b.id)) {
        const counter = (state.static as any)?.diskCounters?.find((n: string) => n.startsWith(`${d.id} `)) ?? `${d.id}`;
        const letters = parts.filter((p) => p.disk === d.id).map((p) => p.letter);
        const act = new Meter('Active time', 100, 80, 95);
        const kvv = new KV(['Read', 'Write', 'IOPS', 'Latency', 'Queue']);
        u.push((s) => {
          const t = s.tick?.disks.find((x) => x.name === counter); if (!t) return;
          act.set(t.active, F.pct(t.active)); kvv.set('Read', F.rate(t.r)); kvv.set('Write', F.rate(t.w)); kvv.set('IOPS', `${t.riops} r · ${t.wiops} w`); kvv.set('Latency', `${t.rlatMs.toFixed(2)} ms r · ${t.wlatMs.toFixed(2)} ms w`); kvv.set('Queue', String(t.q));
        });
        const chart = new LiveChart(series, [{ key: `dr:${counter}`, label: 'Read', color: 'var(--sky)', fmt: (v) => `${v.toFixed(2)} MB/s` }, { key: `dw:${counter}`, label: 'Write', color: 'var(--peach)', fmt: (v) => `${v.toFixed(2)} MB/s` }], { height: 150, windowMs: win, yFmt: (v) => v.toFixed(0) });
        const volMeters = vols.filter((v) => letters.includes(v.letter)).map((v) => { const m = new Meter(`${v.letter}:  ${v.label}`, 100, 100 - state.settings.thresholds.diskFreeWarnPct * 2, 100 - state.settings.thresholds.diskFreeWarnPct); m.set(((v.size - v.free) / v.size) * 100, `${F.bytes(v.size - v.free)} / ${F.bytes(v.size)}`); return m.el; });
        grid.append(card({ title: d.model, sub: `${(d.sizeBytes / 1e12).toFixed(2)} TB · ${d.mediaType === 3 ? 'HDD' : 'SSD'} · ${bus[d.busType] ?? d.busType} · fw ${d.firmware} · ${letters.map((l) => l + ':').join(' ')}`, icon: 'storage', span: 4, actions: pill(d.health === 0 ? 'Healthy' : 'Check', d.health === 0 ? 'ok' : 'warn') },
          act.el, h('div', { style: { height: '10px' } }), kvv.el, h('div', { style: { height: '10px' } }), chart.el, h('div', { style: { height: '8px' } }), ...volMeters));
      }
      grid.append(card({ title: 'Slots & topology', sub: 'from the dossier', icon: 'layers', span: 12 }, h('div', { class: 'kv', html: '' },
        ...[['JSSD1 (M.2 left)', 'PCIe 3.0 x4 NVMe only · ~3,500 MB/s'], ['JSSD2 (M.2 right)', 'PCIe 3.0 x4 NVMe or SATA III · RAID 0/1'], ['JSATA1 (2.5" bay)', 'SATA III 6 Gbps · 7 / 9.5 mm'], ['Chipset link', 'HM470 DMI 3.0 x4 — 3.93 GB/s shared by all drives'], ['SN850X note', 'PCIe 4.0 drive running at PCIe 3.0 x4 (~3.5 GB/s)']].flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]))));
      root.append(head('Storage', '3 drives · 2.26 TB · Intel RST'), grid);
      stagger(root);
    },
    update(s) { for (const f of u) f(s); },
  };
}

// ═══════════════════════════════════════════════════════════════
//  NETWORK
// ═══════════════════════════════════════════════════════════════
export function networkView(): View {
  let u: ((s: Snapshot) => void)[] = [];
  return {
    id: 'network', title: 'Network', icon: 'network', group: 'Hardware',
    mount(root) {
      u = [];
      const grid = h('div', { class: 'grid' });
      const nics = (state.static as any)?.nicCounters as string[] ?? [];
      for (const name of nics) {
        const ad = state.slow?.adapters.find((a) => a.desc.replace(/[()]/g, '') === name.replace(/[[\]()]/g, '') || name.includes(a.desc.slice(0, 18)));
        const ip = state.slow?.ipConfig.find((c) => c.index === ad?.index);
        const kvv = new KV(['Status', 'Link', 'IPv4', 'Gateway', 'DNS', 'MAC', 'Down', 'Up']);
        kvv.set('Status', pill(ad?.up ? 'connected' : 'disconnected', ad?.up ? 'ok' : '')); kvv.set('Link', ad?.speed ? `${(ad.speed / 1e6).toFixed(0)} Mb/s` : '–');
        kvv.set('IPv4', ip?.ip.filter((x) => x.includes('.')).join(', ') || '–'); kvv.set('Gateway', ip?.gateway.filter((x) => x.includes('.')).join(', ') || '–'); kvv.set('DNS', ip?.dns.join(', ') || '–'); kvv.set('MAC', ad?.mac ? (ad.mac.replace(/[^0-9a-f]/gi, '').match(/../g)?.join(':') ?? ad.mac) : '–');
        u.push((s) => { const t = s.tick?.net.find((n) => n.name === name); if (!t) return; kvv.set('Down', `${F.rate(t.rx)} · ${F.bits(t.rx)}`); kvv.set('Up', `${F.rate(t.tx)} · ${F.bits(t.tx)}`); });
        const ch = new LiveChart(series, [{ key: `rx:${name}`, label: 'Down', color: 'var(--sky)', fmt: (v) => `${v.toFixed(2)} MB/s` }, { key: `tx:${name}`, label: 'Up', color: 'var(--pink)', fmt: (v) => `${v.toFixed(2)} MB/s` }], { height: 170, windowMs: win, yFmt: (v) => v.toFixed(1) });
        grid.append(card({ title: ad?.name ?? name, sub: name, icon: /wi-?fi|wireless/i.test(name) ? 'wifi' : 'network', span: 6 }, kvv.el, h('div', { style: { height: '12px' } }), ch.el));
      }
      const w = state.slow?.wifi;
      grid.append(card({ title: 'Wi-Fi link', sub: w ? 'live from netsh' : 'needs Location access for details', icon: 'wifi', span: 6 }, w ? wifiKv(w) : h('p', { class: 'muted' }, 'Windows only shares SSID, signal and channel with apps that have Location access.')),
        card({ title: 'Hardware', sub: 'from the dossier', icon: 'info', span: 6 }, h('dl', { class: 'kv' }, ...[['Wi-Fi', 'Killer AX1650i (Intel AX201 CNVi2) · Wi-Fi 6 2×2 · 160 MHz · up to 2.4 Gbps · BT 5.1'], ['Ethernet', 'Killer E2600 · 1 GbE · jumbo frames · WoL'], ['DoubleShot Pro', 'Both at once — up to 3.4 Gbps']].flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]))));
      root.append(head('Network', 'Killer DoubleShot Pro · per-adapter throughput'), grid);
      stagger(root);
    },
    update(s) { for (const f of u) f(s); },
  };
}
