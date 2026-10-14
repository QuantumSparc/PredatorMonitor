import { PROFILE, linkGbps } from '../shared/profile';
import type { Snapshot } from '../shared/types';
import * as F from './format';
import { api, series, state, stagger, type View } from './state';
import { AnimNum, card, FanWidget, Gauge, h, icon, KV, LiveChart, Meter, MinMax, pill, spark } from './ui';
import { drawSource, gpuReasons } from './views-hw';

const head = (title: string, sub: string, actions?: any) => h('div', { class: 'view-head' }, h('div', null, h('h1', null, title), h('p', null, sub)), actions ? h('div', { class: 'actions' }, actions) : null);
const win = () => state.settings.chartWindowS * 1000;

// ═══════════════════════════════════════════════════════════════
//  POWER & BATTERY
// ═══════════════════════════════════════════════════════════════
export function powerView(): View {
  let u: ((s: Snapshot) => void)[] = [];
  return {
    id: 'power', title: 'Power & Battery', icon: 'power', group: 'Machine',
    mount(root) {
      u = [];
      const gSys = new Gauge({ label: 'System draw', unit: 'W', max: PROFILE.power.adapterW, warn: 200, crit: 225, marks: [{ at: 180, label: '180 W brick' }] });
      const gPkg = new Gauge({ label: 'CPU package', unit: 'W', max: PROFILE.cpu.pl2W, fmt: (v) => v.toFixed(1), marks: [{ at: 70, label: 'PL1' }] });
      const gGpu = new Gauge({ label: 'GPU', unit: 'W', max: 95, fmt: (v) => v.toFixed(1), marks: [{ at: 80, label: 'Normal' }] });
      const gBat = new Gauge({ label: 'Battery health', unit: '%', max: 100, fmt: (v) => v.toFixed(0) });
      u.push((s) => {
        gSys.set(s.derived.systemDrawW, s.derived.adapterPct != null ? `${s.derived.adapterPct.toFixed(0)}% of 230 W` : s.derived.systemDrawSource === 'battery' ? 'measured on battery' : 'on battery');
        gPkg.set(s.tick?.power.pkgW, s.derived.plState); gGpu.set(s.gpu?.powerW, s.derived.psMode);
        const full = state.slow?.battery.fullWh; gBat.set(full ? (full / PROFILE.power.batteryDesignWh) * 100 : null, full ? `${full.toFixed(1)} / 58.75 Wh` : '');
      });
      const rapl = new LiveChart(series, [
        { key: 'pkgW', label: 'Package', color: 'var(--peach)', fmt: (v) => `${v.toFixed(1)} W` }, { key: 'coresW', label: 'Cores', color: 'var(--yellow)', fmt: (v) => `${v.toFixed(1)} W`, fill: false },
        { key: 'igpuW', label: 'iGPU', color: 'var(--sky)', fmt: (v) => `${v.toFixed(2)} W`, fill: false }, { key: 'dramW', label: 'DRAM', color: 'var(--teal)', fmt: (v) => `${v.toFixed(2)} W`, fill: false },
        { key: 'gpuW', label: 'RTX 2060', color: 'var(--green)', fmt: (v) => `${v.toFixed(1)} W` }], { height: 240, windowMs: win, yFmt: (v) => v.toFixed(0) });
      const sys = new LiveChart(series, [{ key: 'systemW', label: 'System (est.)', color: 'var(--accent)', fmt: (v) => `${v.toFixed(0)} W` }], { height: 240, windowMs: win, refLines: [{ v: 230, label: 'Adapter 230 W', color: 'var(--red)' }, { v: 180, label: '180 W brick', color: 'var(--yellow)' }] });
      const batKv = new KV(['State', 'Charge', 'Rate', 'Voltage', 'Full capacity', 'Design', 'Wear', 'Cycles', 'Time left']);
      u.push((s) => {
        const b = s.tick?.battery; const full = state.slow?.battery.fullWh;
        if (!b) return;
        batKv.set('State', pill(b.online ? (b.charging ? 'charging' : 'on AC') : 'on battery', b.online ? 'ok' : 'warn'));
        batKv.set('Charge', `${b.remainingWh.toFixed(2)} Wh${full ? ` · ${Math.min(100, (b.remainingWh / full) * 100).toFixed(0)}%` : ''}`);
        batKv.set('Rate', b.charging ? `+${b.chargeRateW.toFixed(2)} W` : b.discharging ? `−${b.dischargeRateW.toFixed(2)} W` : '0 W');
        batKv.set('Voltage', `${b.voltageV.toFixed(3)} V (15.4 V nominal, 17.6 V max)`);
        batKv.set('Full capacity', full ? `${full.toFixed(2)} Wh` : '–'); batKv.set('Design', `${PROFILE.power.batteryDesignWh} Wh (${PROFILE.power.batteryModel})`);
        batKv.set('Wear', full ? `${(100 - (full / PROFILE.power.batteryDesignWh) * 100).toFixed(1)}%` : '–'); batKv.set('Cycles', state.slow?.battery.cycles ? String(state.slow.battery.cycles) : 'not reported');
        batKv.set('Time left', b.discharging && b.dischargeRateW > 0.5 ? F.duration((b.remainingWh / b.dischargeRateW) * 3600) : b.charging && full && b.chargeRateW > 0.5 ? `full in ${F.duration(((full - b.remainingWh) / b.chargeRateW) * 3600)}` : '–');
      });
      const batChart = new LiveChart(series, [{ key: 'batRate', label: 'Charge (+) / discharge (−)', color: 'var(--teal)', fmt: (v) => `${v.toFixed(1)} W` }], { height: 160, windowMs: win, min: undefined, yFmt: (v) => v.toFixed(0) });
      const wear = h('div');
      const renderWear = () => {
        const log = state.batteryLog;
        if (log.length < 2) { wear.replaceChildren(h('p', { class: 'muted' }, `Logging daily. ${log.length ? `First reading ${F.dateTime(log[0].t)}: ${log[0].fullWh.toFixed(2)} Wh.` : 'First reading comes with the next slow update.'} A projection appears after a few days.`)); return; }
        const a = log[0]; const b = log[log.length - 1]; const days = (b.t - a.t) / 86400000; const perDay = (a.fullWh - b.fullWh) / Math.max(1, days);
        const to50 = perDay > 0 ? (b.fullWh - PROFILE.power.batteryDesignWh * 0.5) / perDay : Infinity;
        wear.replaceChildren(new (class { el = (() => { const k = new KV(['Tracked', 'Change', 'Rate', 'Reaches 50%']); k.set('Tracked', `${days.toFixed(0)} days`); k.set('Change', `${a.fullWh.toFixed(2)} → ${b.fullWh.toFixed(2)} Wh`); k.set('Rate', `${(perDay * 30).toFixed(2)} Wh / month`); k.set('Reaches 50%', Number.isFinite(to50) ? `~${new Date(Date.now() + to50 * 86400000).toLocaleDateString()}` : 'not declining'); return k.el; })(); })().el);
      };
      renderWear();
      const budget = new KV(['PredatorSense', 'Effective PL1', 'PL2 / Tau', 'Boost left', 'NOS boost', 'Power plan', 'Adapter']);
      u.push((s) => {
        const d = s.derived; budget.set('PredatorSense', pill(d.psMode, 'info')); budget.set('Effective PL1', `${d.pl1EffW} W${d.pl1EffW < 70 ? ' (GPU > 40 W → EC sharing)' : ''}`);
        budget.set('PL2 / Tau', `107 W · ${/Turbo/.test(d.psMode) ? 56 : 28} s · EWMA ${d.tauEwmaW.toFixed(1)} W`); budget.set('Boost left', d.tauLeftS != null ? `~${d.tauLeftS.toFixed(0)} s` : '–');
        budget.set('NOS boost', d.nosActive ? pill('active — battery assisting', 'warn') : pill('idle', 'ok')); budget.set('Power plan', state.slow?.powerPlan ?? '–'); budget.set('Adapter', '◆ 230 W Delta Electronics (ADP-230JB D)');
      });
      // ── where the power goes: one stacked bar + one tile per component ──
      type Comp = { key: string; name: string; sub: string; color: string; energy: string; limit?: (s: Snapshot) => { w: number; label: string } | null; est?: boolean };
      const pkgComp: Comp = { key: 'pkgW', name: 'CPU package', sub: 'RAPL package = cores + uncore + iGPU', color: 'var(--accent)', energy: 'pkg',
        limit: (s) => ({ w: s.derived.pl1EffW, label: 'effective PL1' }) };
      const comps: Comp[] = [
        { key: 'coresW', name: 'CPU cores', sub: 'RAPL PP0 · 6 cores / 12 threads', color: 'var(--peach)', energy: 'cores' },
        { key: 'uncoreW', name: 'CPU uncore', sub: 'ring · L3 · system agent (pkg − cores − iGPU)', color: 'var(--red)', energy: 'uncore' },
        { key: 'igpuW', name: 'Intel UHD iGPU', sub: 'RAPL PP1', color: 'var(--sky)', energy: 'igpu' },
        { key: 'dramW', name: 'Memory (DRAM)', sub: 'RAPL DRAM · 2 × 8 GB DDR4', color: 'var(--teal)', energy: 'dram' },
        { key: 'gpuW', name: 'RTX 2060', sub: 'NVIDIA board power', color: 'var(--green)', energy: 'gpu',
          limit: (s) => (s.gpu?.limitW ? { w: s.gpu.limitW, label: 'enforced limit' } : null) },
        { key: '', name: 'Rest of system', sub: 'screen, fans, chipset, SSDs, Wi-Fi', color: 'var(--text-3)', energy: 'rest', est: true },
        { key: 'chargeW', name: 'Battery charging', sub: 'power going into the battery', color: 'var(--yellow)', energy: 'charge' },
      ];
      const valOf = (s: Snapshot, c: Comp): number | null =>
        c.est ? (s.derived.systemDrawW == null ? null : s.derived.systemDrawSource === 'battery' ? Math.max(0, s.derived.systemDrawW - (s.tick?.power.pkgW ?? 0) - (s.gpu?.powerW ?? 0)) : s.derived.restW) : series.last(c.key) ?? null;
      const pct = (v: number, of: number) => (of ? ((v / of) * 100).toFixed(0) : '0');
      const bar = h('div', { class: 'pw-bar' }); const legend = h('div', { class: 'pw-legend' });
      const segs = comps.map((c) => { const seg = h('div', { class: 'pw-seg', style: { background: c.color } }); bar.append(seg); return seg; });
      const legs = comps.map((c) => { const v = h('b', null, '–'); legend.append(h('span', { class: 'pw-leg' }, h('i', { style: { background: c.color } }), c.name, v)); return v; });
      const totalNum = new AnimNum((v) => v.toFixed(0), 'hero-num'); const totalSide = h('div', { class: 'hero-side' });
      u.push((s) => {
        const vals = comps.map((c) => Math.max(0, valOf(s, c) ?? 0)); const tot = vals.reduce((a, b) => a + b, 0);
        vals.forEach((v, i) => {
          segs[i].style.flexGrow = String(v); segs[i].title = `${comps[i].name}: ${v.toFixed(1)} W (${pct(v, tot)}%)`;
          legs[i].textContent = ` ${v.toFixed(v < 10 ? 1 : 0)} W · ${pct(v, tot)}%`;
        });
        totalNum.set(tot);
        const ad = PROFILE.power.adapterW;
        totalSide.innerHTML = `<b>${pct(tot, ad)}%</b> of the ${ad} W adapter<br>headroom <b>${Math.max(0, ad - tot).toFixed(0)} W</b> · DRAM counted separately from package`;
      });
      const fmtWh = (wh: number | undefined) => (wh == null ? '–' : wh < 1 ? `${(wh * 1000).toFixed(0)} mWh` : `${wh.toFixed(2)} Wh`);
      const tile = (c: Comp) => {
        const num = new AnimNum((v) => v.toFixed(v < 10 ? 2 : 1)); const share = h('span', { class: 'comp-share' });
        const lim = new Meter('', 100, 85, 97); const limText = h('div', { class: 'comp-lim' }); const mm = new MinMax((v) => v.toFixed(1));
        const energy = h('div', { class: 'comp-energy' });
        const estTag = h('span', { class: 'comp-est' }); const estNote = h('div', { class: 'comp-flat muted' });
        const el = h('div', { class: 'comp', style: { '--c': c.color } as any },
          h('div', { class: 'comp-head' }, h('i', { class: 'comp-dot' }), h('div', null, h('b', null, c.name), h('small', null, c.sub)), share),
          h('div', { class: 'comp-val' }, num.el, h('span', { class: 'hero-unit' }, 'W'), c.est ? estTag : null),
          c.est ? estNote : spark(series, c.key, c.color, 34).el,
          c.limit ? h('div', null, lim.el, limText) : null, c.est ? null : mm.el, energy);
        u.push((s) => {
          const v = valOf(s, c); num.set(v);
          if (c.est) {
            const src = s.derived.systemDrawSource;
            estTag.textContent = src === 'battery' ? '● measured' : src === 'learned' ? '◐ learned' : '○ estimate';
            estTag.title = src === 'battery' ? 'battery discharge minus CPU package and GPU' : src === 'learned' ? 'average of what was measured on battery' : 'fixed estimate from the dossier';
            estNote.textContent = src === 'battery' ? 'Measured now: battery discharge rate minus CPU package and GPU board power.'
              : src === 'learned' ? `Learned on battery: ${s.derived.restW.toFixed(1)} W on average. Used to estimate draw on AC, where the total can't be metered.`
              : 'Software cannot meter this on AC. A fixed 25 W guess is used until it has been measured on battery.';
          }
          const sysW = s.derived.systemDrawW; share.textContent = v != null && sysW ? `${pct(v, sysW)}% of system` : '';
          const L = c.limit?.(s);
          if (L) { lim.set(v != null ? (v / L.w) * 100 : null); limText.textContent = `${v != null ? pct(v, L.w) : '–'}% of ${L.w.toFixed(0)} W ${L.label}`; }
          if (!c.est) mm.set(series.stats(c.key), series.peak(c.key));
          const wh = state.energy.wh[c.energy]; energy.textContent = wh != null ? `${fmtWh(wh)} used this session` : '';
        });
        return el;
      };
      const compGrid = h('div', { class: 'comp-grid' }, tile(pkgComp), ...comps.map(tile));

      // ── GPU power & limits (nvidia-smi) ──
      const gpuKv = new KV(['Board power', 'Enforced limit', 'Default / max limit', 'Headroom', 'P-state', 'Throttle reasons', 'Clocks', 'PCIe link']);
      u.push((s) => {
        const g = s.gpu; const gs = state.gpuStatic; if (!g) return;
        gpuKv.set('Board power', g.powerW != null ? `${g.powerW.toFixed(1)} W` : '–');
        gpuKv.set('Enforced limit', g.limitW != null ? h('span', null, `${g.limitW.toFixed(0)} W `, pill(s.derived.psMode, 'info')) : '–');
        gpuKv.set('Default / max limit', `${gs?.defaultLimitW?.toFixed(0) ?? '–'} W / ${(g.maxLimitW ?? gs?.maxLimitW)?.toFixed(0) ?? '–'} W`);
        gpuKv.set('Headroom', g.powerW != null && g.limitW ? `${Math.max(0, g.limitW - g.powerW).toFixed(1)} W (${pct(g.powerW, g.limitW)}% used)` : '–');
        gpuKv.set('P-state', g.pstate ?? '–');
        const r = gpuReasons(g.throttleMask); gpuKv.set('Throttle reasons', r.length ? r.join(', ') : pill('none', 'ok'));
        gpuKv.set('Clocks', `core ${g.coreMHz ?? '–'} MHz · mem ${g.memMHz ?? '–'} MHz`);
        gpuKv.set('PCIe link', g.pcieGen ? `Gen ${g.pcieGen} ×${g.pcieWidth}` : '–');
      });

      // ── session energy ──
      const enKv = new KV(['Tracking since', 'System (est.)', 'CPU package', 'RTX 2060', 'DRAM', 'Into battery', 'From battery', 'Average draw']);
      u.push(() => {
        const e = state.energy;
        enKv.set('Tracking since', e.since ? `${new Date(e.since).toLocaleTimeString()} (${F.duration((Date.now() - e.since) / 1000)})` : '–');
        enKv.set('System (est.)', fmtWh(e.wh.system)); enKv.set('CPU package', fmtWh(e.wh.pkg)); enKv.set('RTX 2060', fmtWh(e.wh.gpu)); enKv.set('DRAM', fmtWh(e.wh.dram));
        enKv.set('Into battery', fmtWh(e.wh.charge)); enKv.set('From battery', fmtWh(e.wh.fromBattery));
        const hrs = e.last && e.since ? (e.last - e.since) / 3600000 : 0;
        enKv.set('Average draw', hrs > 0 && e.wh.system ? `${(e.wh.system / hrs).toFixed(1)} W` : '–');
      });

      // ── electrical sensors from LibreHardwareMonitor (voltages, currents, power, energy) ──
      const elecTypes = ['Power', 'Voltage', 'Current', 'Energy'];
      const unit: Record<string, string> = { Power: 'W', Voltage: 'V', Current: 'A', Energy: 'mWh' };
      const elecBox = h('div', { class: 'elec' }); let elecSig = '';
      const renderElec = () => {
        const list = state.lhmMeta.filter((m) => elecTypes.includes(m.type));
        const sig = list.map((m) => m.id).join('|'); if (sig === elecSig && elecBox.childElementCount) return; elecSig = sig;
        if (!list.length) { elecBox.replaceChildren(h('p', { class: 'muted' }, state.admin ? 'LibreHardwareMonitor has not reported electrical sensors yet.' : 'Core voltages, battery current and per-rail power need full sensors (Settings → Sensors → Restart with full sensors).')); return; }
        const byHw = new Map<string, typeof list>();
        for (const m of list) { if (!byHw.has(m.hw)) byHw.set(m.hw, []); byHw.get(m.hw)!.push(m); }
        elecBox.replaceChildren(...[...byHw].map(([hw, ms]) => h('div', { class: 'elec-group' }, h('h4', null, hw),
          h('table', { class: 'elec-table' },
            h('thead', null, h('tr', null, h('th', null, 'Type'), h('th', null, 'Sensor'), h('th', null, 'Now'), h('th', null, 'Min'), h('th', null, 'Max'), h('th', null, 'Peak'))),
            h('tbody', null, ...ms.sort((a, b) => elecTypes.indexOf(a.type) - elecTypes.indexOf(b.type)).map((m) =>
              h('tr', { 'data-elec': m.id }, h('td', { class: 'elec-type' }, m.type), h('td', { class: 'elec-name', title: m.name }, m.name), h('td', { class: 'n' }, '–'), h('td', { class: 'n' }, '–'), h('td', { class: 'n' }, '–'), h('td', { class: 'n' }, '–'))))))));
      };
      renderElec();
      u.push(() => {
        renderElec();
        elecBox.querySelectorAll<HTMLElement>('[data-elec]').forEach((row) => {
          const id = row.dataset.elec!; const m = state.lhmMeta.find((x) => x.id === id);
          const dp = m?.type === 'Voltage' ? 3 : m?.type === 'Energy' ? 0 : 2;
          const fmt = (v: number | null | undefined) => (v == null ? '–' : `${v.toFixed(dp)} ${unit[m?.type ?? ''] ?? ''}`);
          const st = series.stats(`lhm:${id}`); const pk = series.peak(`lhm:${id}`);
          [series.last(`lhm:${id}`), st?.min, st?.max, pk?.v].forEach((v, i) => { const t = fmt(v); const cell = row.children[i + 2]; if (cell.textContent !== t) cell.textContent = t; });
        });
      });

      const sysCard = card({ title: 'System draw vs adapter', sub: 'CPU + GPU + rest + charging', icon: 'plug', span: 5 }, sys.el);
      const sysSub = sysCard.querySelector<HTMLElement>('.card-sub');
      u.push((s) => { const t = drawSource(s); if (sysSub && sysSub.textContent !== t) sysSub.textContent = t; });
      root.append(head('Power & Battery', 'Per-component power, Intel RAPL rails, GPU limits, adapter budget, PL1/PL2/Tau model, electrical sensors and battery'),
        h('div', { class: 'grid' },
          card({ title: 'Live', icon: 'gauge', span: 12 }, h('div', { class: 'gauges' }, gSys.el, gPkg.el, gGpu.el, gBat.el)),
          card({ title: 'Where the power goes', sub: 'live split of the estimated system draw by component', icon: 'layers', cls: 'hero', span: 12 },
            h('div', { class: 'hero-top' }, totalNum.el, h('span', { class: 'hero-unit' }, 'W'), totalSide), bar, legend),
          card({ title: 'Components', sub: 'live watts · share · limit · 60 s min/avg/max · session peak · energy used', icon: 'cpu', span: 12 }, compGrid),
          card({ title: 'Power rails', sub: 'RAPL package / cores / iGPU / DRAM + NVIDIA board power', icon: 'zap', span: 7 }, rapl.el),
          sysCard,
          card({ title: 'GPU power & limits', sub: 'nvidia-smi · VBIOS-enforced', icon: 'gpu', span: 4 }, gpuKv.el),
          card({ title: 'Limits & mode', sub: 'CPU PL1 / PL2 / Tau model', icon: 'gauge', span: 4 }, budget.el),
          card({ title: 'Energy this session', sub: 'integrated from live power since the app started', icon: 'zap', span: 4 }, enKv.el),
          card({ title: 'Battery', icon: 'battery', span: 7 }, batKv.el, h('div', { style: { height: '12px' } }), batChart.el),
          card({ title: 'Battery wear trend', sub: 'full-charge capacity logged once a day', icon: 'history', span: 5 }, wear),
          card({ title: 'Voltages, currents & power sensors', sub: 'LibreHardwareMonitor · now / 60 s min / max / session peak', icon: 'activity', span: 12 }, elecBox)));
      stagger(root);
    },
    update(s) { for (const f of u) f(s); },
  };
}

// ═══════════════════════════════════════════════════════════════
//  THERMALS, FANS & PREDATORSENSE
// ═══════════════════════════════════════════════════════════════
export function thermalView(): View {
  let u: ((s: Snapshot) => void)[] = [];
  return {
    id: 'thermal', title: 'Thermals & Fans', icon: 'fan', group: 'Machine',
    mount(root) {
      u = [];
      const ps = new KV(['Thermal profile', 'GPU overclock tier', 'CPU fan', 'GPU fan', 'CPU fan speed', 'GPU fan speed', 'Turbo key LED', 'EC CPU temp', 'EC GPU temp', 'Mode from GPU limit']);
      const acerNote = h('p', { class: 'muted', style: { marginTop: '10px' } });
      u.push((s) => {
        const a = s.tick?.acer;
        if (!state.admin) { acerNote.textContent = 'PredatorSense data (fan modes, profile, turbo LED) comes from Acer’s WMI interface, which needs admin. Settings → Sensors → Restart with full sensors.'; }
        else if (!state.static?.caps.acerWmi) acerNote.textContent = 'Acer gaming WMI not found on this system.';
        else acerNote.textContent = 'Read-only: values come from the same Acer WMI methods PredatorSense uses. Nothing is changed.';
        ps.set('Thermal profile', a ? (a.platformProfile ?? (a.platformProfileRaw != null ? `raw ${a.platformProfileRaw}` : 'not reported by the PH315-53 EC')) : '–');
        ps.set('GPU overclock tier', a?.gpuOverclock ?? '–'); ps.set('CPU fan', a?.cpuFanMode ?? '–'); ps.set('GPU fan', a?.gpuFanMode ?? '–');
        ps.set('CPU fan speed', a?.cpuFanRpm != null ? `${a.cpuFanRpm} RPM (max ${PROFILE.cooling.cpuFanMaxRpm})` : a?.cpuFanPct != null ? `${a.cpuFanPct}% setting` : '–');
        ps.set('GPU fan speed', a?.gpuFanRpm != null ? `${a.gpuFanRpm} RPM (max ${PROFILE.cooling.gpuFanMaxRpm})` : a?.gpuFanPct != null ? `${a.gpuFanPct}% setting` : '–');
        ps.set('Turbo key LED', a?.turboLed == null ? '–' : pill(a.turboLed ? 'on' : 'off', a.turboLed ? 'warn' : ''));
        ps.set('EC CPU temp', a?.cpuTempC != null ? F.temp(a.cpuTempC) : '–'); ps.set('EC GPU temp', a?.gpuTempC != null ? F.temp(a.gpuTempC) : '–');
        ps.set('Mode from GPU limit', pill(s.derived.psMode, 'info'));
      });
      const temps = new LiveChart(series, [
        { key: 'cpuTemp', label: 'CPU', color: 'var(--peach)', fmt: (v) => F.temp(v) }, { key: 'gpuTemp', label: 'GPU', color: 'var(--green)', fmt: (v) => F.temp(v) }, { key: 'zoneC', label: 'Board zone', color: 'var(--sky)', fmt: (v) => F.temp(v), fill: false }],
        { height: 260, windowMs: win, min: 20, refLines: [{ v: PROFILE.cpu.prochotC, label: 'PROCHOT 92 °C', color: 'var(--red)' }, { v: PROFILE.cpu.tvbC, label: 'TVB 65 °C', color: 'var(--green)' }] });
      const cpuFan = new FanWidget({ label: 'CPU', maxRpm: PROFILE.cooling.cpuFanMaxRpm, blades: 26, style: 'polymer' });
      const gpuFan = new FanWidget({ label: 'GPU', maxRpm: PROFILE.cooling.gpuFanMaxRpm, blades: 32, style: 'metal' });
      const modes: [string, string, RegExp][] = [['Auto', 'fan', /auto/i], ['Max', 'zap', /max|turbo|coolboost/i], ['Custom', 'settings', /custom/i]];
      const chips = modes.map(([l, ic]) => h('div', { class: 'fan-mode-chip' }, icon(ic, 26), l));
      const fanNote = h('p', { class: 'muted', style: { textAlign: 'center', margin: '4px 0 0' } });
      u.push((s) => {
        const a = s.tick?.acer;
        cpuFan.set(a?.cpuFanRpm ?? null, a?.cpuFanMode ?? null); gpuFan.set(a?.gpuFanRpm ?? null, a?.gpuFanMode ?? null);
        chips.forEach((c, i) => c.classList.toggle('on', !!a?.cpuFanMode && modes[i][2].test(a.cpuFanMode)));
        fanNote.textContent = a ? 'Live from the embedded controller — the same reading PredatorSense shows.' : 'Fan RPM comes from Acer’s EC and needs full sensors (Settings → Sensors).';
      });
      const fans = new LiveChart(series, [{ key: 'acerCpuFan', label: 'CPU fan', color: 'var(--blue)', fmt: (v) => v.toFixed(0) }, { key: 'acerGpuFan', label: 'GPU fan', color: 'var(--mauve)', fmt: (v) => v.toFixed(0) }], { height: 200, windowMs: win });
      const zone = new KV(['Board zone', 'Firmware throttling', 'Throttle reasons', 'CPU source', 'PROCHOT headroom']);
      u.push((s) => {
        const t = s.tick?.thermal; zone.set('Board zone', F.temp(t?.zoneC, 1)); zone.set('Firmware throttling', t?.passivePct != null ? `${100 - t.passivePct}%` : '–');
        zone.set('Throttle reasons', t?.reasons ? `0x${t.reasons.toString(16)}` : 'none'); zone.set('CPU source', s.derived.cpuTempSource);
        zone.set('PROCHOT headroom', s.derived.cpuTempC != null ? `${(PROFILE.cpu.prochotC - s.derived.cpuTempC).toFixed(0)} °C` : '–');
      });
      // LibreHardwareMonitor sensors grouped by hardware
      // every LibreHardwareMonitor sensor: hardware tabs + search, groups laid out in columns
      const lhmBox = h('div', { class: 'sensor-cols' });
      const unitOf: Record<string, string> = { Temperature: '°C', Voltage: 'V', Clock: 'MHz', Load: '%', Power: 'W', Fan: 'RPM', Data: 'GB', SmallData: 'MB', Throughput: 'B/s', Level: '%', Energy: 'mWh', Current: 'A', Factor: '' };
      const fmtLhm = (type: string | undefined, v: number | null | undefined) =>
        v == null ? '–' : type === 'Temperature' ? F.temp(v, 1) : type === 'Throughput' ? `${F.bytes(v)}/s` : `${v.toFixed(type === 'Voltage' ? 3 : type === 'Energy' || type === 'Fan' ? 0 : 1)} ${unitOf[type ?? ''] ?? ''}`;
      let hwFilter = 'All'; let query = '';
      const hwTabs = h('div', { class: 'seg sensor-tabs' });
      const search = h('input', { class: 'search-input sensor-search', placeholder: 'Filter sensors…', oninput: () => { query = search.value.toLowerCase(); renderLhm(); } }) as HTMLInputElement;
      const count = h('span', { class: 'muted sensor-count' });
      const renderTabs = () => {
        const hws = ['All', ...new Set(state.lhmMeta.map((m) => m.hw))];
        hwTabs.replaceChildren(...hws.map((hw) => h('button', { class: hw === hwFilter ? 'on' : '', onclick: () => { hwFilter = hw; renderTabs(); renderLhm(); } }, hw.replace(/^Intel Core |^NVIDIA GeForce |^Intel\(R\) /, ''))));
      };
      const renderLhm = () => {
        if (!state.lhmMeta.length) { lhmBox.replaceChildren(h('p', { class: 'muted' }, state.admin ? (state.lhmInstalled ? 'LibreHardwareMonitor is installed but needs the PawnIO driver for CPU sensors.' : 'Set up LibreHardwareMonitor in Settings → Sensors to see per-core temperatures, voltages and more.') : 'Per-core temperatures, voltages and clocks need admin + LibreHardwareMonitor (Settings → Sensors).')); return; }
        const list = state.lhmMeta.filter((m) => (hwFilter === 'All' || m.hw === hwFilter) && (!query || `${m.hw} ${m.type} ${m.name}`.toLowerCase().includes(query)));
        count.textContent = `${list.length} of ${state.lhmMeta.length} sensors`;
        const groups = new Map<string, typeof state.lhmMeta>();
        for (const m of list) { const k = `${m.hw}|${m.type}`; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(m); }
        if (!groups.size) { lhmBox.replaceChildren(h('p', { class: 'muted' }, 'No sensors match.')); return; }
        lhmBox.replaceChildren(...[...groups.entries()].map(([k, ms]) => {
          const [hw, type] = k.split('|');
          return h('div', { class: 'sensor-group' }, h('h4', null, h('span', null, type), h('small', null, hw)),
            h('table', { class: 'sensor-table' }, h('tbody', null, ...ms.map((m) => h('tr', { 'data-lhm': m.id }, h('td', { title: m.name }, m.name), h('td', { class: 'n' }, '–'), h('td', { class: 'n mm' }, ''))))));
        }));
        paintLhm();
      };
      const paintLhm = () => {
        lhmBox.querySelectorAll<HTMLElement>('[data-lhm]').forEach((row) => {
          const id = row.dataset.lhm!; const meta = state.lhmMeta.find((m) => m.id === id);
          const v = series.last(`lhm:${id}`); const st = series.stats(`lhm:${id}`);
          const now = fmtLhm(meta?.type, v); const range = st && st.max !== st.min ? `${fmtLhm(meta?.type, st.min)} – ${fmtLhm(meta?.type, st.max)}` : '';
          if (row.children[1].textContent !== now) row.children[1].textContent = now;
          if (row.children[2].textContent !== range) row.children[2].textContent = range;
        });
      };
      renderTabs(); renderLhm();
      let lhmSig = state.lhmMeta.length;
      u.push(() => { if (state.lhmMeta.length !== lhmSig) { lhmSig = state.lhmMeta.length; renderTabs(); renderLhm(); } else paintLhm(); });
      root.append(head('Thermals & Fans', 'Temperatures, firmware throttling, PredatorSense state and every LibreHardwareMonitor sensor'),
        h('div', { class: 'grid' },
          card({ title: 'Fan control', sub: 'AeroBlade 3D (GPU) · polymer (CPU) · read-only', icon: 'fan', span: 12 }, h('div', { class: 'fan-modes' }, ...chips), h('div', { class: 'fans' }, cpuFan.el, gpuFan.el), fanNote),
          card({ title: 'Temperatures', icon: 'thermal', span: 8 }, temps.el),
          card({ title: 'Thermal zone', sub: 'ACPI \\_TZ.TZ00 · no admin', icon: 'gauge', span: 4 }, zone.el),
          card({ title: 'PredatorSense', sub: 'Acer gaming WMI (read-only)', icon: 'keyboard', span: 6 }, ps.el, acerNote),
          card({ title: 'Fan speed history', sub: 'RPM from the embedded controller', icon: 'activity', span: 6 }, fans.el),
          card({ title: 'Cooling hardware', sub: 'from the dossier', icon: 'info', span: 12 }, h('dl', { class: 'kv kv-2col' }, ...[
            ['GPU fan', '4th-gen AeroBlade 3D metal, 59 blades (0.1 mm) · up to 6,122 RPM'], ['CPU fan', 'High-static-pressure polymer · up to 5,660 RPM · ~53–55 dBA at 40 cm'],
            ['Heatpipes', '4 copper (2 shared CPU+GPU, 1 GPU+VRAM/VRM, 1 CPU+VRM) · 4 fin stacks'], ['Pads', '1.0 mm VRAM & DrMOS · 1.5 mm chokes'], ['Limits', 'Tj max 100 °C · PROCHOT 92 °C · TVB ≤ 65 °C'], ['Tip', 'PTM7950 phase-change pad: −8 to −14 °C sustained']].flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]))),
          card({ title: 'All hardware sensors', sub: 'LibreHardwareMonitor · now and 60 s range', icon: 'layers', span: 12, actions: h('div', { class: 'sensor-tools' }, count, search) }, hwTabs, lhmBox)));
      stagger(root);
    },
    update(s) { for (const f of u) f(s); },
  };
}

// ═══════════════════════════════════════════════════════════════
//  DISPLAYS
// ═══════════════════════════════════════════════════════════════
export function displayView(): View {
  let u: ((s: Snapshot) => void)[] = [];
  return {
    id: 'display', title: 'Displays', icon: 'display', group: 'Machine',
    mount(root) {
      u = [];
      const link = new Gauge({ label: 'DP link (8-bit)', unit: '% HBR3', max: 120, fmt: (v) => v.toFixed(0), warn: 95, crit: 100, marks: [{ at: 100, label: 'HBR3' }] });
      const outputs = h('div');
      const linkKv = new KV(['Mode', '8-bit need', '10-bit need', 'HBR3 payload', 'DSC', 'HDMI 2.0b would give']);
      u.push((s) => {
        link.set(s.derived.linkPct, s.derived.linkNeedsDsc ? 'DSC for 10-bit' : '');
        const nv = state.slow?.videoControllers.find((v) => /nvidia/i.test(v.name) && v.w);
        if (nv) {
          linkKv.set('Mode', `${nv.w}×${nv.h} @ ${nv.hz} Hz`); linkKv.set('8-bit need', `${linkGbps(nv.w, nv.h, nv.hz, 8).toFixed(2)} Gbps`); linkKv.set('10-bit need', `${linkGbps(nv.w, nv.h, nv.hz, 10).toFixed(2)} Gbps`);
          linkKv.set('HBR3 payload', '25.92 Gbps (4 × 8.1 Gbps, 8b/10b)'); linkKv.set('DSC', s.derived.linkNeedsDsc ? '10-bit HDR → DSC 1.2a → 9.52 Gbps' : 'not needed'); linkKv.set('HDMI 2.0b would give', '100 Hz 8-bit / 85 Hz 10-bit, no G-Sync');
        }
        const outSig = JSON.stringify((state.slow?.videoControllers ?? []).map((v) => [v.name, v.w, v.h, v.hz, v.bpp]));
        if ((outputs as any)._sig !== outSig) { (outputs as any)._sig = outSig; outputs.replaceChildren(...(state.slow?.videoControllers ?? []).map((v) => h('div', { class: 'insight ' + (v.w ? 'ok' : 'info') }, h('div', { class: 'lvl' }, icon('display', 18)),
          h('div', null, h('b', null, v.name), h('p', null, v.w ? `${v.w}×${v.h} @ ${v.hz} Hz · ${v.bpp}-bit desktop · driver ${v.driver}` : 'no active output')), h('span', { class: 'cat' }, /nvidia/i.test(v.name) ? 'dGPU' : 'iGPU')))); }
      });
      const opt = h('div');
      u.push((s) => {
        const o = s.derived.optimusBypass;
        if ((opt as any)._o === o) return; (opt as any)._o = o;
        opt.replaceChildren(h('div', { class: `insight ${o === 'bypassed' ? 'ok' : o === 'laptop-on' ? 'warn' : 'info'}` }, h('div', { class: 'lvl' }, icon(o === 'bypassed' ? 'check' : 'alert', 18)),
          h('div', null, h('b', null, o === 'bypassed' ? 'Optimus bypassed' : o === 'laptop-on' ? 'Laptop screen is on' : 'No external display on the RTX 2060'),
            h('p', null, o === 'laptop-on' ? 'The internal panel keeps the Intel iGPU in the loop. Win + P → "Second screen only" before gaming: +8–15% 1% lows, −1.5 to −3 ms latency.' : o === 'bypassed' ? 'Frames go straight from the RTX 2060 to the AW3425DWM — the fastest path this laptop has.' : 'Connect the AW3425DWM to the Mini-DP port for the direct dGPU path.')), h('span', { class: 'cat' }, 'Optimus')));
      });
      const mons = (state.static?.monitors ?? []).map((m) => card({ title: `${m.maker === 'DEL' ? 'Dell / Alienware' : m.maker} ${m.model}`, sub: `EDID ${m.maker}${m.product}`, icon: 'display', span: 6 },
        h('dl', { class: 'kv' }, ...[['Size (EDID)', `${m.widthCm} × ${m.heightCm} cm · ${(Math.hypot(m.widthCm, m.heightCm) / 2.54).toFixed(1)}"`], ['Manufactured', `week ${m.week} of ${m.year}`],
          ['Panel', '34" 1500R VA · 3440×1440 · 110 PPI'], ['Refresh / VRR', '180 Hz · G-Sync Compatible 48–180 Hz + LFC'], ['Colour / HDR', '10-bit (8 + FRC) · 95% DCI-P3 · DisplayHDR 400 · 3000:1'], ['Inputs', '1 × DP 1.4 · 2 × HDMI 2.1 FRL · 3-port USB 5 Gbps hub'], ['Power', '31–32 W typical · 45 W HDR · 85 W max']].flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]))));
      root.append(head('Displays', 'Active outputs, Optimus path and DisplayPort link budget'),
        h('div', { class: 'grid' },
          card({ title: 'Link budget', icon: 'gauge', span: 4 }, h('div', { class: 'gauges' }, link.el)),
          card({ title: 'DisplayPort 1.4 maths', sub: 'CVT-RBv2 timing', icon: 'activity', span: 8 }, linkKv.el),
          card({ title: 'Outputs', icon: 'display', span: 6 }, h('div', { class: 'insights' }, outputs)),
          card({ title: 'Optimus path', icon: 'layers', span: 6 }, opt),
          ...mons,
          card({ title: 'Laptop panel', sub: PROFILE.display.laptopPanel, icon: 'display', span: 6 }, h('dl', { class: 'kv' }, ...[['Panel', 'BOE (EDID BOE08B3) — NV156FHM-N4K tier'], ['Spec', '1920×1080 · 144 Hz · 8-bit · 295–319 nits · 1,400–1,450:1 · 92.3% sRGB · 0 Hz PWM'], ['Link', '40-pin eDP 1.4 · 4 lanes HBR2 = 21.6 Gbps'], ['Routing', 'Intel UHD 630 (Optimus, no MUX)']].flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)])))));
      stagger(root);
    },
    update(s) { for (const f of u) f(s); },
  };
}
