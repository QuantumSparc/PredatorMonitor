import uPlot from 'uplot';
import { DEVELOPER, PROFILE } from '../shared/profile';
import type { EventEntry, ProcInfo, Settings, Snapshot } from '../shared/types';
import * as F from './format';
import { api, state, stagger, type View } from './state';
import { card, h, icon, KV, Meter, pill, resolveColor, Table, toast } from './ui';
import { InsightList } from './views-hw';

const head = (title: string, sub: string, actions?: any) => h('div', { class: 'view-head' }, h('div', null, h('h1', null, title), h('p', null, sub)), actions ? h('div', { class: 'actions' }, actions) : null);

// ═══════════════════════════════════════════════════════════════
//  PROCESSES
// ═══════════════════════════════════════════════════════════════
export function processesView(): View {
  let table: Table<ProcInfo>; let q = ''; let summary: HTMLElement;
  return {
    id: 'processes', title: 'Processes', icon: 'list', group: 'Monitor',
    mount(root) {
      const search = h('input', { class: 'search-input', placeholder: 'Filter processes…', oninput: (e: Event) => { q = (e.target as HTMLInputElement).value; table.render(); } });
      table = new Table<ProcInfo>([
        { key: 'name', label: 'Process', get: (r) => r.name, fmt: (r) => h('span', null, r.name, r.title ? h('span', { class: 'muted' }, `  ${r.title.slice(0, 48)}`) : null) },
        { key: 'pid', label: 'PID', get: (r) => r.pid, align: 'right', width: '70px' },
        { key: 'cpu', label: 'CPU', get: (r) => r.cpu, fmt: (r) => `${r.cpu.toFixed(1)}%`, align: 'right', width: '90px', bar: (r) => r.cpu / 100 },
        { key: 'ws', label: 'Memory', get: (r) => r.ws, fmt: (r) => F.bytes(r.ws), align: 'right', width: '100px', bar: (r) => r.ws / (state.static?.memory.totalBytes ?? 17e9) },
        { key: 'gpu', label: 'GPU', get: (r) => r.gpu, fmt: (r) => (r.gpu ? `${r.gpu.toFixed(1)}%` : '–'), align: 'right', width: '80px', bar: (r) => r.gpu / 100 },
        { key: 'gpuEng', label: 'GPU engine', get: (r) => r.gpuEng ?? '', fmt: (r) => r.gpuEng ?? '', width: '110px' },
        { key: 'gpuMem', label: 'GPU memory', get: (r) => r.gpuMem, fmt: (r) => (r.gpuMem ? F.bytes(r.gpuMem) : '–'), align: 'right', width: '110px' },
        { key: 'threads', label: 'Threads', get: (r) => r.threads, align: 'right', width: '80px' },
        { key: 'handles', label: 'Handles', get: (r) => r.handles, align: 'right', width: '80px' },
      ], (r) => r.pid, 'cpu', () => q);
      summary = h('p', { class: 'muted' });
      root.append(head('Processes', 'Top 40 by CPU + GPU + memory · per-app GPU from Windows GPU-engine counters', search),
        h('div', { class: 'grid' }, card({ title: 'Running', icon: 'list', span: 12, actions: summary }, table.el)));
      stagger(root);
      this.onProcs!();
    },
    onProcs() { if (!table || !state.procs) return; table.set(state.procs.top); summary.textContent = `${state.procs.count} processes · updated ${F.time(state.procs.t)}`; },
  };
}

// ═══════════════════════════════════════════════════════════════
//  INSIGHTS
// ═══════════════════════════════════════════════════════════════
export function insightsView(): View {
  let box: HTMLElement; let list: InsightList; let filter = 'all';
  return {
    id: 'insights', title: 'Insights', icon: 'sparkles', group: 'Monitor',
    badge: () => { const n = state.last?.insights.filter((i) => i.level === 'warn' || i.level === 'crit').length ?? 0; return n ? { text: String(n), level: state.last!.insights.some((i) => i.level === 'crit') ? 'crit' : 'warn' } : null; },
    mount(root) {
      list = new InsightList(); box = h('div', null, list.el);
      const seg = h('div', { class: 'seg' }, ...['all', 'crit', 'warn', 'info', 'ok'].map((f) => h('button', { class: f === filter ? 'on' : '', onclick: (e: Event) => { filter = f; seg.querySelectorAll('button').forEach((b) => b.classList.remove('on')); (e.target as HTMLElement).classList.add('on'); this.update!(state.last!); } }, f === 'all' ? 'All' : f === 'crit' ? 'Critical' : f === 'warn' ? 'Warnings' : f === 'info' ? 'Info' : 'Good')));
      root.append(head('Insights', 'What this PH315-53 is doing right now, judged against its own limits', seg), h('div', { class: 'grid' }, card({ title: 'Live insights', icon: 'sparkles', span: 12 }, box)));
      stagger(root);
      if (state.last) this.update!(state.last);
    },
    update(s: Snapshot) {
      if (!box) return;
      const order = { crit: 0, warn: 1, info: 2, ok: 3 } as Record<string, number>;
      const items = s.insights.filter((i) => filter === 'all' || i.level === filter).sort((a, b) => order[a.level] - order[b.level] || a.id.localeCompare(b.id));
      list.set(items);
      let empty = box.querySelector<HTMLElement>('.empty');
      if (!items.length && !empty) box.append(h('div', { class: 'empty' }, 'Nothing here.'));
      else if (items.length && empty) empty.remove();
    },
  };
}

// ═══════════════════════════════════════════════════════════════
//  SESSIONS
// ═══════════════════════════════════════════════════════════════
export function sessionsView(): View {
  let box: HTMLElement; let live: HTMLElement;
  const render = () => {
    if (!box) return;
    const list = [...state.sessions].reverse();
    box.replaceChildren(...(list.length ? list.map((s) => card({ title: s.game ?? 'Gaming session', sub: `${F.dateTime(s.start)} · ${F.duration(s.durationS)} · ${s.mode}`, icon: 'gamepad', span: 6, actions: s.throttleS ? pill(`throttled ${s.throttleS}s`, 'warn') : pill('no throttling', 'ok') },
      h('dl', { class: 'kv' }, ...[['CPU package', `avg ${s.cpuPkgAvgW} W · max ${s.cpuPkgMaxW} W · ${F.mhz(s.cpuMhzAvg)} avg`], ['GPU', `avg ${s.gpuAvgW} W · max ${s.gpuMaxW} W · ${s.gpuMhzAvg} MHz · ${s.gpuUtilAvg}% load`],
        ['GPU temperature', `avg ${F.temp(s.gpuTempAvg)} · max ${F.temp(s.gpuTempMax)}`], ['Board zone max', F.temp(s.zoneTempMax)]].flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)])))) : [emptyCard()]));
    stagger(box);
  };
  // empty state: explain the rule and show live progress toward it
  let gpuMeter: Meter | null = null; let gpuNote: HTMLElement | null = null;
  const emptyCard = () => {
    gpuMeter = new Meter('GPU load now', 100, state.settings.sessionGpuUtil, 101); gpuNote = h('p', { class: 'muted', style: { margin: '10px 0 0' } });
    return card({ title: 'No sessions recorded yet', sub: 'sessions are detected automatically — nothing to start or stop', icon: 'gamepad', span: 12 },
      h('div', { class: 'session-empty' },
        h('div', { class: 'session-empty-art' }, icon('gamepad', 42)),
        h('div', null,
          h('p', null, `Play a game and a session starts by itself once the GPU stays above `, h('b', null, `${state.settings.sessionGpuUtil}%`), ' for 30 s. It ends after a minute below 20 %. Each session records:'),
          h('ul', { class: 'session-empty-list' }, ...['Game name (top GPU process)', 'CPU package and GPU power — average and max', 'GPU clock, load and temperature', 'Seconds spent throttling', 'PredatorSense mode'].map((x) => h('li', null, x))),
          gpuMeter.el, gpuNote)));
  };
  return {
    id: 'sessions', title: 'Gaming sessions', icon: 'gamepad', group: 'Analyse',
    mount(root) {
      live = h('div'); box = h('div', { class: 'grid' });
      root.append(head('Gaming sessions', 'Detected automatically from sustained GPU load — temperatures, power and throttling per session', h('button', { class: 'btn', onclick: () => api.exportData('sessions') }, icon('download', 15), 'Export')), live, box);
      render();
    },
    update(s) {
      if (!live) return;
      if (gpuMeter && gpuNote && box.isConnected) {
        const u = s.gpu?.util ?? null; gpuMeter.set(u, u != null ? `${u}%` : '–');
        gpuNote.textContent = u == null ? 'Waiting for GPU data…' : u >= state.settings.sessionGpuUtil ? 'Above the threshold — a session starts if it stays there for 30 s.' : `Below the ${state.settings.sessionGpuUtil}% threshold (change it in Settings → Units & data).`;
      }
      const t = live.querySelector<HTMLElement>('b'); const p = live.querySelector<HTMLElement>('p');
      if (s.derived.sessionActive && t && p) { t.textContent = `Session in progress — ${F.duration(s.derived.sessionS)}`; p.textContent = `GPU ${s.gpu?.util ?? '–'}% · ${s.gpu?.powerW?.toFixed(0) ?? '–'} W · ${F.temp(s.gpu?.tempC)}`; return; }
      if (!s.derived.sessionActive && !live.childElementCount) return;
      live.replaceChildren(...(s.derived.sessionActive ? [h('div', { class: 'insight warn', style: { marginBottom: '16px' } }, h('div', { class: 'lvl' }, icon('gamepad', 18)), h('div', null, h('b', null, `Session in progress — ${F.duration(s.derived.sessionS)}`), h('p', null, `GPU ${s.gpu?.util ?? '–'}% · ${s.gpu?.powerW?.toFixed(0) ?? '–'} W · ${F.temp(s.gpu?.tempC)}`)), h('span', { class: 'cat' }, 'live'))] : []));
    },
    onEvent: render,
  };
}

// ═══════════════════════════════════════════════════════════════
//  HISTORY (uPlot)
// ═══════════════════════════════════════════════════════════════
const HIST_CHARTS: { title: string; icon: string; series: { key: string; label: string; color: string }[]; unit: string }[] = [
  { title: 'Load', icon: 'activity', unit: '%', series: [{ key: 'cpuUtil', label: 'CPU', color: 'var(--accent)' }, { key: 'gpuUtil', label: 'GPU', color: 'var(--green)' }] },
  { title: 'Temperatures', icon: 'thermal', unit: '°C', series: [{ key: 'cpuTempC', label: 'CPU', color: 'var(--peach)' }, { key: 'gpuTempC', label: 'GPU', color: 'var(--green)' }, { key: 'zoneC', label: 'Board', color: 'var(--sky)' }] },
  { title: 'Power', icon: 'zap', unit: 'W', series: [{ key: 'pkgW', label: 'CPU pkg', color: 'var(--peach)' }, { key: 'gpuW', label: 'GPU', color: 'var(--green)' }, { key: 'systemW', label: 'System', color: 'var(--accent)' }] },
  { title: 'Clocks', icon: 'clock', unit: 'MHz', series: [{ key: 'cpuMhz', label: 'CPU', color: 'var(--sky)' }, { key: 'gpuMHz', label: 'GPU', color: 'var(--green)' }] },
  { title: 'Memory', icon: 'memory', unit: 'GB', series: [{ key: 'memGiB', label: 'RAM GB', color: 'var(--accent)' }] },
  { title: 'Network & disk', icon: 'network', unit: 'MB/s', series: [{ key: 'netRxMBs', label: 'Down', color: 'var(--sky)' }, { key: 'netTxMBs', label: 'Up', color: 'var(--pink)' }, { key: 'diskRMBs', label: 'Disk read', color: 'var(--yellow)' }, { key: 'diskWMBs', label: 'Disk write', color: 'var(--peach)' }] },
  { title: 'Battery & health', icon: 'battery', unit: 'Wh / score', series: [{ key: 'batteryWh', label: 'Battery Wh', color: 'var(--teal)' }, { key: 'healthScore', label: 'Health score', color: 'var(--mauve)' }] },
];
export function historyView(): View {
  let plots: uPlot[] = []; let range = 3600000; let host: HTMLElement; let mode: 'avg' | 'max' = 'avg';
  const load = async () => {
    plots.forEach((p) => p.destroy()); plots = [];
    const rows: any[] = await api.history(Date.now() - range);
    host.replaceChildren();
    if (!rows.length) { host.append(h('div', { class: 'empty', style: { gridColumn: 'span 12' } }, 'History builds up one point per minute — check back in a few minutes.')); return; }
    const xs = rows.map((r) => r.t / 1000);
    HIST_CHARTS.forEach((c, i) => {
      const el = h('div', { style: { height: '230px' } });
      const cardEl = card({ title: c.title, sub: c.unit, icon: c.icon, span: 6 }, el); cardEl.style.setProperty('--i', String(i));
      host.append(cardEl);
      const data: uPlot.AlignedData = [xs, ...c.series.map((sd) => rows.map((r) => r[mode][sd.key] ?? null))];
      requestAnimationFrame(() => {
        const w = el.clientWidth || 600;
        const grid = { stroke: resolveColor('var(--grid)'), width: 1 };
        const axis = { stroke: resolveColor('var(--ov1)'), grid, ticks: grid, font: '11px Segoe UI' };
        // legend shows the latest values when the cursor is not over the chart (instead of "--")
        const latest = (u: uPlot) => { if (u.cursor.idx == null) u.setLegend({ idx: u.data[0].length - 1 }); };
        const dec = c.unit === 'MB/s' ? 2 : 1;
        plots.push(new uPlot({ width: w, height: 210, cursor: { drag: { x: true, y: false } }, legend: { live: true }, scales: { x: { time: true } }, axes: [axis, axis],
          hooks: { ready: [latest], setCursor: [latest] },
          series: [{ label: 'Time', value: '{M}/{D} {h}:{mm}{aa}' }, ...c.series.map((sd) => ({ label: sd.label, stroke: resolveColor(sd.color), width: 2, fill: resolveColor(sd.color) + '22', points: { show: false }, spanGaps: true,
            value: (_u: uPlot, v: number | null) => (v == null ? '–' : `${v.toFixed(dec)}${c.unit.includes(' / ') ? '' : ` ${c.unit}`}`) }))] }, data, el));
      });
    });
  };
  return {
    id: 'history', title: 'History', icon: 'history', group: 'Analyse',
    mount(root) {
      host = h('div', { class: 'grid' });
      const ranges: [string, number][] = [['1 h', 3600e3], ['6 h', 6 * 3600e3], ['24 h', 86400e3], ['7 d', 7 * 86400e3], ['30 d', 30 * 86400e3]];
      const seg = h('div', { class: 'seg' }, ...ranges.map(([l, ms]) => h('button', { class: ms === range ? 'on' : '', onclick: (e: Event) => { range = ms; seg.querySelectorAll('button').forEach((b) => b.classList.remove('on')); (e.target as HTMLElement).classList.add('on'); load(); } }, l)));
      const seg2 = h('div', { class: 'seg' }, ...(['avg', 'max'] as const).map((m) => h('button', { class: m === mode ? 'on' : '', onclick: (e: Event) => { mode = m; seg2.querySelectorAll('button').forEach((b) => b.classList.remove('on')); (e.target as HTMLElement).classList.add('on'); load(); } }, m === 'avg' ? 'Average' : 'Peak')));
      root.append(head('History', 'Per-minute rollups · drag to zoom, double-click to reset', h('div', { class: 'row' }, seg2, seg, h('button', { class: 'btn', onclick: () => api.exportData('history', Math.ceil(range / 86400e3)) }, icon('download', 15), 'Export'))), host);
      load();
    },
    unmount() { plots.forEach((p) => p.destroy()); plots = []; },
  };
}

// ═══════════════════════════════════════════════════════════════
//  EVENTS
// ═══════════════════════════════════════════════════════════════
export function eventsView(): View {
  let box: HTMLElement; let summary: HTMLElement; let filter = 'all'; let collapse = true;
  const kinds: [string, string][] = [['all', 'All'], ['throttle', 'Throttling'], ['power', 'Power'], ['mode', 'Mode'], ['session', 'Sessions'], ['nos', 'NOS']];
  const dayLabel = (t: number) => {
    const d = new Date(t); const today = new Date(); const y = new Date(Date.now() - 86400000);
    return d.toDateString() === today.toDateString() ? 'Today' : d.toDateString() === y.toDateString() ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  };
  const render = () => {
    if (!box) return;
    const all = [...state.events].reverse();
    const counts = new Map<string, number>(); for (const e of all) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
    summary.replaceChildren(...kinds.slice(1).filter(([k]) => counts.get(k)).map(([k, l]) => h('span', { class: 'ev-count' }, h('b', null, String(counts.get(k))), ` ${l.toLowerCase()}`)));
    const list = all.filter((e) => filter === 'all' || e.kind === filter).slice(0, 400);
    if (!list.length) { box.replaceChildren(h('div', { class: 'empty' }, filter === 'all' ? 'No events yet — mode changes, throttling, power source changes and sessions show up here.' : 'No events of this kind yet.')); return; }
    // collapse runs of the same kind that alternate within a few minutes (e.g. throttling flapping at a threshold)
    type Row = { e: EventEntry; n: number; first: number };
    const rows: Row[] = [];
    for (const e of list) {
      const prev = rows[rows.length - 1];
      if (collapse && prev && prev.e.kind === e.kind && e.kind === 'throttle' && prev.first - e.t < 5 * 60000) { prev.n++; prev.first = e.t; continue; }
      rows.push({ e, n: 1, first: e.t });
    }
    const out: HTMLElement[] = []; let day = '';
    for (const r of rows) {
      const d = dayLabel(r.e.t); if (d !== day) { day = d; out.push(h('div', { class: 'tl-day' }, d)); }
      const span = r.n > 1 ? `${F.time(r.first)} – ${F.time(r.e.t)}` : '';
      out.push(h('div', { class: `tl-item ${r.n > 1 ? 'warn' : r.e.level}` }, h('div', { class: 'tl-time' }, F.time(r.e.t)), h('div', { class: 'tl-dot' }),
        h('div', null, h('b', null, r.n > 1 ? `Throttling on and off ×${Math.ceil(r.n / 2)}` : r.e.title, r.n > 1 ? h('span', { class: 'tl-n' }, `${r.n} events`) : null),
          h('p', null, r.n > 1 ? `${span} · latest: ${r.e.title.toLowerCase()} — ${r.e.detail}` : r.e.detail))));
    }
    box.replaceChildren(...out);
  };
  return {
    id: 'events', title: 'Events', icon: 'bell', group: 'Analyse',
    mount(root) {
      box = h('div', { class: 'timeline' }); summary = h('div', { class: 'ev-summary' });
      const seg = h('div', { class: 'seg' }, ...kinds.map(([k, l]) => h('button', { class: k === filter ? 'on' : '', onclick: (e: Event) => { filter = k; seg.querySelectorAll('button').forEach((b) => b.classList.remove('on')); (e.target as HTMLElement).classList.add('on'); render(); } }, l)));
      const tog = h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: collapse, onchange: (e: Event) => { collapse = (e.target as HTMLInputElement).checked; render(); } }), 'Group repeats');
      root.append(head('Events', 'Timeline of everything notable', h('div', { class: 'row' }, seg, h('button', { class: 'btn', onclick: () => api.exportData('events') }, icon('download', 15), 'Export'))),
        h('div', { class: 'grid' }, card({ title: 'Timeline', sub: 'newest first', icon: 'bell', span: 12, actions: h('div', { class: 'row' }, summary, tog) }, box)));
      stagger(root); render();
    },
    onEvent: render,
  };
}

// ═══════════════════════════════════════════════════════════════
//  SYSTEM
// ═══════════════════════════════════════════════════════════════
export function systemView(): View {
  return {
    id: 'system', title: 'System', icon: 'info', group: 'Machine',
    mount(root) {
      const sys = state.static?.system ?? {}; const cpu = state.static?.cpu; const g = state.gpuStatic;
      const block = (title: string, ic: string, rows: [string, any][], span = 6) => card({ title, icon: ic, span }, h('dl', { class: 'kv' }, ...rows.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v ?? '–')])));
      root.append(head('System', 'Everything about this machine — live identity plus the dossier'),
        h('div', { class: 'grid' },
          block('Machine', 'info', [['Model', `${sys.maker} ${sys.model}`], ['Family', sys.family], ['Regulatory model', 'N20C3'], ['Board', `${sys.board} · rev ${sys.boardRev}`], ['PCB (dossier)', 'Compal FH52M (LA-J891P Rev 1.0 / 1B)'], ['Computer name', sys.computerName]]),
          block('Firmware', 'shield', [['BIOS', `${sys.bios} (${sys.biosDate})`], ['Embedded controller', `${sys.ec} · ENE KB9022Q D`], ['SMBIOS', sys.smbios], ['Secure Boot', sys.secureBoot ? pill('on', 'ok') : pill('off', 'warn')], ['VBS', ['off', 'enabled', 'running'][sys.vbs] ?? sys.vbs], ['Hypervisor', sys.hypervisor ? 'running' : 'off']]),
          block('Windows', 'layers', [['Edition', `${sys.os} ${sys.osVersion}`], ['Build', sys.build], ['Installed', sys.installDate], ['Architecture', sys.arch], ['Booted', state.slow ? F.dateTime(Date.parse(state.slow.bootTime)) : '–'], ['Power plan', state.slow?.powerPlan]]),
          block('Processor', 'cpu', [['CPU', cpu?.name], ['Cores / threads', `${cpu?.cores} / ${cpu?.threads}`], ['Cache', `L2 ${cpu?.l2KB} KB · L3 ${cpu?.l3KB} KB`], ['Limits', 'TDP 45 W · PL1 70 W · PL2 107 W · PL4 179 W · Tau 28/56 s'], ['Thermal', 'Tj max 100 °C · PROCHOT 92 °C · TVB 65 °C'], ['Undervolt', 'locked (CFG Lock + OC Lock)']]),
          block('Graphics', 'gpu', [['GPU', g?.name], ['Driver', g?.driver], ['VBIOS', g?.vbios], ['CUDA', g?.computeCap], ['Bus', g?.busId], ['Silicon', 'TU106 · 1920 CUDA · 240 Tensor · 30 RT · 6 GB GDDR6 192-bit']]),
          block('App', 'settings', [['Version', state.version], ['Developer', h('a', { href: '#', onclick: (e: Event) => { e.preventDefault(); api.openUrl(DEVELOPER.url); } }, `${DEVELOPER.name} ↗`)], ['Sensor agent', state.agent], ['Admin', state.admin ? pill('yes', 'ok') : pill('no', 'info')], ['Acer WMI', state.static?.caps.acerWmi ? pill('connected', 'ok') : pill('needs admin', 'info')], ['LibreHardwareMonitor', state.static?.caps.lhm ? pill('running', 'ok') : state.lhmInstalled ? pill('installed', 'info') : pill('not set up', 'info')], ['Data folder', h('a', { href: '#', onclick: (e: Event) => { e.preventDefault(); api.openData(); } }, state.dataDir)]]),
        ));
      stagger(root);
    },
  };
}

// ═══════════════════════════════════════════════════════════════
//  SETTINGS — every customisation
// ═══════════════════════════════════════════════════════════════
export function settingsView(apply: (s: Settings) => void): View {
  return {
    id: 'settings', title: 'Settings', icon: 'settings', group: 'App',
    mount(root) {
      const s = state.settings;
      const save = async (patch: Partial<Settings>) => { const n = await api.setSettings(patch); state.settings = n; apply(n); };
      const row = (title: string, desc: string, control: HTMLElement) => h('div', { class: 'set-row' }, h('div', null, h('b', null, title), h('p', null, desc)), control);
      const sw = (val: boolean, onChange: (v: boolean) => void) => { const b = h('button', { class: `switch ${val ? 'on' : ''}`, onclick: () => { b.classList.toggle('on'); onChange(b.classList.contains('on')); } }); return b; };
      const seg = <T extends string>(opts: [T, string][], val: T, onChange: (v: T) => void) => { const el = h('div', { class: 'seg' }, ...opts.map(([v, l]) => h('button', { class: v === val ? 'on' : '', onclick: (e: Event) => { el.querySelectorAll('button').forEach((b) => b.classList.remove('on')); (e.target as HTMLElement).classList.add('on'); onChange(v); } }, l))); return el; };
      const range = (min: number, max: number, step: number, val: number, fmt: (v: number) => string, onChange: (v: number) => void) => {
        const out = h('span', null, fmt(val)); const inp = h('input', { type: 'range', min, max, step, value: val, oninput: (e: Event) => { out.textContent = fmt(+(e.target as HTMLInputElement).value); }, onchange: (e: Event) => onChange(+(e.target as HTMLInputElement).value) });
        return h('div', { class: 'range' }, inp, out);
      };
      const numIn = (val: number, onChange: (v: number) => void) => h('input', { class: 'num-input', type: 'number', value: val, onchange: (e: Event) => onChange(+(e.target as HTMLInputElement).value) });

      // Appearance
      const themes: [Settings['theme'], string, string[]][] = [
        ['mocha', 'Mocha', ['#1e1e2e', '#cba6f7', '#89b4fa', '#a6e3a1']], ['macchiato', 'Macchiato', ['#24273a', '#c6a0f6', '#8aadf4', '#a6da95']], ['frappe', 'Frappé', ['#303446', '#ca9ee6', '#8caaee', '#a6d189']],
        ['latte', 'Latte', ['#eff1f5', '#8839ef', '#1e66f5', '#40a02b']], ['midnight', 'Midnight', ['#0d1226', '#b794ff', '#4fb6ff', '#6bf0a8']], ['predator', 'Predator', ['#060f13', '#00e5ff', '#00ffc8', '#2bff9e']]];
      const themeGrid = h('div', { class: 'themes' }, ...themes.map(([id, name, cols]) => h('div', { class: `theme-card ${s.theme === id ? 'on' : ''}`, style: { background: cols[0] }, onclick: (e: Event) => { themeGrid.querySelectorAll('.theme-card').forEach((c) => c.classList.remove('on')); (e.currentTarget as HTMLElement).classList.add('on'); save({ theme: id }); } },
        h('div', { class: 'tc-prev', style: { background: `linear-gradient(135deg, ${cols[0]}, ${cols[1]}33)` } }, ...cols.slice(1).map((c, i) => h('i', { style: { background: c, height: `${[60, 90, 40][i]}%` } }))), h('span', { style: { color: id === 'latte' ? '#4c4f69' : '#e6e6f0' } }, name))));
      const accents = ['rosewater', 'flamingo', 'pink', 'mauve', 'red', 'maroon', 'peach', 'yellow', 'green', 'teal', 'sky', 'sapphire', 'blue', 'lavender'];
      const sw2 = h('div', { class: 'swatches' }, ...accents.map((a) => h('div', { class: `swatch ${s.accent === a ? 'on' : ''}`, title: a, style: { background: `var(--${a})`, color: `var(--${a})` }, onclick: (e: Event) => { sw2.querySelectorAll('.swatch').forEach((x) => x.classList.remove('on')); (e.target as HTMLElement).classList.add('on'); save({ accent: a }); } })));

      // Dashboard tiles
      const allTiles: [string, string][] = [['cpu', 'CPU'], ['gpu', 'GPU'], ['power', 'Power'], ['fans', 'Cooling'], ['memory', 'Memory'], ['thermal', 'Temperatures'], ['battery', 'Battery'], ['storage', 'Storage'], ['network', 'Network'], ['display', 'Displays']];
      // ordered list: shown tiles first in Overview order, then hidden ones; arrows reorder, switch shows/hides
      const tileIcon: Record<string, string> = { cpu: 'cpu', gpu: 'gpu', power: 'power', fans: 'fan', memory: 'memory', thermal: 'thermal', battery: 'battery', storage: 'storage', network: 'network', display: 'display' };
      const tiles = h('div', { class: 'tile-order' });
      const renderTiles = () => {
        const shown = state.settings.overviewTiles.filter((id) => allTiles.some(([t]) => t === id));
        const order = [...shown, ...allTiles.map(([id]) => id).filter((id) => !shown.includes(id))];
        const commit = (next: string[]) => { save({ overviewTiles: next }).then(renderTiles); };
        tiles.replaceChildren(...order.map((id, i) => {
          const on = shown.includes(id); const label = allTiles.find(([t]) => t === id)![1];
          const move = (d: number) => { const n = [...shown]; const j = i + d; [n[i], n[j]] = [n[j], n[i]]; commit(n); };
          return h('div', { class: `tile-row ${on ? 'on' : ''}` },
            h('span', { class: 'tile-pos' }, on ? String(i + 1) : '–'), icon(tileIcon[id] ?? 'layers', 16), h('span', { class: 'tile-name' }, label),
            h('button', { class: 'icon-btn', title: 'Move up', disabled: !on || i === 0, onclick: () => move(-1) }, icon('chevron', 14, 'up')),
            h('button', { class: 'icon-btn', title: 'Move down', disabled: !on || i === shown.length - 1, onclick: () => move(1) }, icon('chevron', 14, 'down')),
            sw(on, (v) => commit(v ? [...shown, id] : shown.filter((x) => x !== id))));
        }));
      };
      renderTiles();

      const T = s.thresholds;
      const thr = (k: keyof Settings['thresholds']) => numIn(T[k], (v) => save({ thresholds: { ...state.settings.thresholds, [k]: v } }));

      // Sensors
      const log = h('div', { class: 'log', style: { display: 'none' } });
      api.onSetupLog((t: string) => { log.style.display = 'block'; log.textContent += t; log.scrollTop = log.scrollHeight; });
      const sensors = h('div', null,
        row('Full sensors (admin)', state.admin ? 'Running as administrator — Acer WMI and LibreHardwareMonitor are available.' : 'Restart elevated to read PredatorSense data, CPU core temperatures and fans.', state.admin ? pill('active', 'ok') : h('button', { class: 'btn primary', onclick: () => api.elevate() }, icon('shield', 15), 'Restart with full sensors')),
        row('LibreHardwareMonitor', state.lhmInstalled ? 'Library installed in agent/lhm. CPU sensors also need the PawnIO driver (winget install namazso.PawnIO, admin).' : 'Downloads LibreHardwareMonitorLib 0.9.6 (MPL-2.0) from nuget.org into the app folder.', h('button', { class: 'btn', onclick: async () => { log.textContent = ''; const code = await api.setupLhm(); toast(code === 0 ? 'LibreHardwareMonitor ready' : 'Setup failed', code === 0 ? 'Restart the sensor agent to load it.' : 'See the log below.', code === 0 ? 'ok' : 'warn'); state.lhmInstalled = code === 0 || state.lhmInstalled; } }, icon('download', 15), state.lhmInstalled ? 'Reinstall' : 'Set up')),
        row('Sensor agent', `Status: ${state.agent}. Restart after installing sensors or changing drivers.`, h('button', { class: 'btn', onclick: () => { api.restartAgent(); toast('Sensor agent restarting', '', 'info', 2500); } }, icon('activity', 15), 'Restart agent')),
        log);

      root.append(head('Settings', 'Every option in one place — changes apply instantly', h('button', { class: 'btn ghost', onclick: async () => { const n = await api.resetSettings(); state.settings = n; apply(n); toast('Settings reset', '', 'ok'); } }, 'Reset all')),
        h('div', { class: 'grid' },
          card({ title: 'Theme', icon: 'palette', span: 12 }, themeGrid, row('Accent colour', 'Used for highlights, gauges, charts and the nav marker', sw2)),
          card({ title: 'Look & feel', icon: 'layers', span: 6 },
            row('Window material', 'Windows 11 glass behind the app', seg([['acrylic', 'Acrylic'], ['mica', 'Mica'], ['none', 'Solid']], s.windowMaterial, (v) => save({ windowMaterial: v }))),
            row('Panel translucency', 'How much of the background shows through cards', range(20, 100, 1, s.glass, (v) => `${v}%`, (v) => save({ glass: v }))),
            row('Density', 'Spacing between and inside cards', seg([['compact', 'Compact'], ['comfortable', 'Comfortable'], ['spacious', 'Spacious']], s.density, (v) => save({ density: v }))),
            row('Text size', 'Scales all text', range(0.85, 1.3, 0.05, s.fontScale, (v) => `${Math.round(v * 100)}%`, (v) => save({ fontScale: v }))),
            row('Collapsed sidebar', 'Icons only', sw(s.sidebarCollapsed, (v) => save({ sidebarCollapsed: v })))),
          card({ title: 'Motion', icon: 'activity', span: 6 },
            row('Animations', 'Full, reduced or none', seg([['full', 'Full'], ['reduced', 'Reduced'], ['off', 'Off']], s.animations, (v) => save({ animations: v }))),
            row('Animation speed', 'Slower is silkier, faster is snappier', range(0.5, 2, 0.1, s.animationSpeed, (v) => `${v.toFixed(1)}×`, (v) => save({ animationSpeed: v }))),
            row('Live chart span', 'How much time live charts show', range(30, 600, 30, s.chartWindowS, (v) => (v >= 60 ? `${v / 60} min` : `${v} s`), (v) => save({ chartWindowS: v }))),
            row('Sample rate', 'How often sensors are read (lower = smoother, more CPU)', seg([['500', '0.5 s'], ['1000', '1 s'], ['2000', '2 s'], ['5000', '5 s']] as [string, string][], String(s.intervalMs), (v) => save({ intervalMs: +v })))),
          card({ title: 'Units & data', icon: 'gauge', span: 6 },
            row('Temperature', 'Celsius or Fahrenheit everywhere', seg([['C', '°C'], ['F', '°F']], s.tempUnit, (v) => save({ tempUnit: v }))),
            row('Keep history for', 'Per-minute rollups older than this are deleted', range(1, 365, 1, s.historyDays, (v) => `${v} d`, (v) => save({ historyDays: v }))),
            row('Gaming session threshold', 'GPU load that starts a session (held 30 s)', range(20, 95, 5, s.sessionGpuUtil, (v) => `${v}%`, (v) => save({ sessionGpuUtil: v }))),
            row('Export', 'History, events or sessions as JSON or CSV', h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => api.exportData('history', 30) }, 'History'), h('button', { class: 'btn', onclick: () => api.exportData('events') }, 'Events'), h('button', { class: 'btn', onclick: () => api.exportData('sessions') }, 'Sessions'))),
            row('Data folder', state.dataDir, h('button', { class: 'btn', onclick: () => api.openData() }, icon('folder', 15), 'Open'))),
          card({ title: 'Window & startup', icon: 'display', span: 6 },
            row('Start with Windows', 'Launch at sign-in', sw(s.startWithWindows, (v) => save({ startWithWindows: v }))),
            row('Start minimised to tray', 'When launched at sign-in', sw(s.startMinimized, (v) => save({ startMinimized: v }))),
            row('Close to tray', 'The X button hides the window; quit from the tray', sw(s.closeToTray, (v) => save({ closeToTray: v }))),
            row('Always on top', 'Keep the window above others', sw(s.alwaysOnTop, (v) => save({ alwaysOnTop: v }))),
            row('Tray tooltip', 'What hovering the tray icon shows', seg([['cpu-gpu-temp', 'Load & temps'], ['power', 'Power'], ['off', 'Off']], s.trayTooltip, (v) => save({ trayTooltip: v })))),
          card({ title: 'Dashboard tiles', sub: 'Show, hide and reorder the Overview tiles', icon: 'dashboard', span: 6 }, tiles),
          card({ title: 'Alerts', icon: 'bell', span: 6 },
            row('Windows notifications', 'Critical insights pop up (at most every 10 min each)', sw(s.notifications, (v) => save({ notifications: v }))),
            row('Notification sound', 'Play the system sound with alerts', sw(s.alertSound, (v) => save({ alertSound: v }))),
            row('Test', 'Send a notification now to check name, icon and sound', h('button', { class: 'btn', onclick: () => api.testNotification() }, icon('bell', 15), 'Send test notification')),
            row('CPU temp warn / critical', '°C', h('div', { class: 'row' }, thr('cpuTempWarn'), thr('cpuTempCrit'))),
            row('GPU temp warn / critical', '°C', h('div', { class: 'row' }, thr('gpuTempWarn'), thr('gpuTempCrit'))),
            row('Board zone warn', '°C', thr('zoneTempWarn')), row('RAM warn', '% in use', thr('ramWarn')), row('VRAM warn', '% in use', thr('vramWarn')),
            row('Disk free warn', '% free', thr('diskFreeWarnPct')), row('Battery wear warn', '% wear', thr('batteryWearWarn'))),
          card({ title: 'Sensors', icon: 'shield', span: 12 }, sensors),
          card({ title: 'About', icon: 'info', span: 12 },
            h('div', { class: 'about' },
              h('div', { class: 'about-logo' }),
              h('a', { class: 'about-company', href: '#', title: DEVELOPER.url, onclick: (e: Event) => { e.preventDefault(); api.openUrl(DEVELOPER.url); } }, h('img', { src: '../../assets/quantumsparc-logo.png', alt: DEVELOPER.name })),
              h('div', null,
                h('h4', null, 'Predator Monitor ', h('span', { class: 'muted' }, `v${state.version}`)),
                h('p', { class: 'about-dev' }, 'Developed by ', h('a', { href: '#', onclick: (e: Event) => { e.preventDefault(); api.openUrl(DEVELOPER.url); } }, DEVELOPER.name), ' · ', h('a', { href: '#', onclick: (e: Event) => { e.preventDefault(); api.openUrl(DEVELOPER.url); } }, DEVELOPER.url.replace(/^https:\/\/|\/$/g, ''))),
                h('p', { class: 'muted' }, 'Built for the Acer Predator Helios 300 PH315-53 + Alienware AW3425DWM. Limits and specs come from the Master Technical Dossier and are marked as such; live values come from Windows performance counters, Intel RAPL, nvidia-smi, Acer WMI (read-only) and LibreHardwareMonitor.'))))));
      stagger(root);
    },
  };
}
