import { DEVELOPER } from '../shared/profile';
// Collect runtime errors so dev tooling (scripts/shot.mjs) can report them.
(window as any).__errors = [] as string[];
addEventListener('error', (e) => (window as any).__errors.push(String(e.message)));
addEventListener('unhandledrejection', (e) => (window as any).__errors.push(String((e as PromiseRejectionEvent).reason)));

import type { EventEntry, Settings, Snapshot } from '../shared/types';
import * as F from './format';
import { api, ingest, series, state, type View } from './state';
import { clearColorCache, drawAllCharts, h, icon, pill, setMotion, spinAllFans, toast } from './ui';
import { cpuView, gpuView, memoryView, networkView, overviewView, storageView } from './views-hw';
import { displayView, powerView, thermalView } from './views-power';
import { eventsView, historyView, insightsView, processesView, sessionsView, settingsView, systemView } from './views-data';

// ── settings → document ─────────────────────────────────────────
function applySettings(s: Settings, first = false) {
  const prevTheme = document.documentElement.dataset.theme;
  const d = document.documentElement.dataset;
  d.theme = s.theme; d.accent = s.accent; d.density = s.density; d.material = s.windowMaterial;
  document.documentElement.style.setProperty('--glass', String(s.glass));
  document.documentElement.style.setProperty('--font-scale', String(s.fontScale));
  setMotion(s.animations, s.animationSpeed);
  F.setTempUnit(s.tempUnit);
  series.windowMs = s.chartWindowS * 1000;
  document.querySelector('.app')?.classList.toggle('collapsed', s.sidebarCollapsed);
  clearColorCache();
  requestAnimationFrame(() => {
    const cs = getComputedStyle(document.documentElement);
    api.setTitlebar('#00000000', cs.getPropertyValue('--text').trim());
  });
  if (!first && (prevTheme !== s.theme)) remount();
}

// ── views & navigation ──────────────────────────────────────────
const views: View[] = [];
let current: View | null = null;
let viewEl: HTMLElement | null = null;
let main: HTMLElement; let nav: HTMLElement; let indicator: HTMLElement;
const navItems = new Map<string, HTMLElement>();

function buildViews() {
  views.push(overviewView(), insightsView(), processesView(),
    cpuView(), gpuView(), memoryView(), storageView(), networkView(),
    powerView(), thermalView(), displayView(), systemView(),
    sessionsView(), historyView(), eventsView(),
    settingsView((s) => applySettings(s)));
}

function show(id: string) {
  const v = views.find((x) => x.id === id) ?? views[0];
  if (current === v && viewEl) return;
  const old = viewEl; const oldView = current;
  current = v;
  const el = h('div', { class: 'view view-enter' });
  try { v.mount(el); } catch (e) { console.error(e); el.append(h('div', { class: 'empty' }, `Could not render ${v.title}: ${(e as Error).message}`)); }
  main.appendChild(el);
  viewEl = el;
  if (state.last) try { v.update?.(state.last); } catch (e) { console.error(e); }
  if (old) {
    old.classList.remove('view-enter'); old.classList.add('view-leave');
    oldView?.unmount?.();
    setTimeout(() => old.remove(), 260 / state.settings.animationSpeed);
  }
  moveIndicator(v.id);
  if (location.hash.slice(1) !== v.id) history.replaceState(null, '', `#${v.id}`);
}
function remount() { if (!current) return; const id = current.id; current = null; viewEl?.remove(); viewEl = null; show(id); }
function moveIndicator(id: string) {
  navItems.forEach((el, k) => el.classList.toggle('active', k === id));
  const item = navItems.get(id); if (!item) return;
  indicator.style.transform = `translateY(${item.offsetTop}px)`;
}

// ── command palette ─────────────────────────────────────────────
function palette() {
  const open = document.querySelector('.palette-back'); if (open) { open.remove(); return; } // Ctrl+K toggles
  type Cmd = { label: string; icon: string; hint?: string; run: () => void };
  const cmds: Cmd[] = [
    ...views.map((v) => ({ label: `Go to ${v.title}`, icon: v.icon, hint: v.group, run: () => show(v.id) })),
    ...(['mocha', 'macchiato', 'frappe', 'latte', 'midnight', 'predator'] as const).map((t) => ({ label: `Theme: ${t[0].toUpperCase() + t.slice(1)}`, icon: 'palette', hint: 'Appearance', run: () => save({ theme: t }) })),
    { label: 'Toggle sidebar', icon: 'chevron', hint: 'Ctrl+B', run: () => save({ sidebarCollapsed: !state.settings.sidebarCollapsed }) },
    { label: 'Temperature in °C', icon: 'thermal', hint: 'Units', run: () => save({ tempUnit: 'C' }) },
    { label: 'Temperature in °F', icon: 'thermal', hint: 'Units', run: () => save({ tempUnit: 'F' }) },
    { label: 'Animations: full', icon: 'activity', hint: 'Motion', run: () => save({ animations: 'full' }) },
    { label: 'Animations: reduced', icon: 'activity', hint: 'Motion', run: () => save({ animations: 'reduced' }) },
    { label: 'Animations: off', icon: 'activity', hint: 'Motion', run: () => save({ animations: 'off' }) },
    { label: 'Compact density', icon: 'layers', hint: 'Layout', run: () => save({ density: 'compact' }) },
    { label: 'Comfortable density', icon: 'layers', hint: 'Layout', run: () => save({ density: 'comfortable' }) },
    { label: 'Spacious density', icon: 'layers', hint: 'Layout', run: () => save({ density: 'spacious' }) },
    ...([['acrylic', 'Acrylic'], ['mica', 'Mica'], ['none', 'Solid']] as const).map(([m, l]) => ({ label: `Window material: ${l}`, icon: 'display', hint: 'Window', run: () => save({ windowMaterial: m }) })),
    { label: 'Always on top', icon: 'display', hint: 'Window', run: () => save({ alwaysOnTop: !state.settings.alwaysOnTop }) },
    { label: 'Restart with full sensors (admin)', icon: 'shield', hint: 'Sensors', run: () => api.elevate() },
    { label: 'Restart sensor agent', icon: 'activity', hint: 'Sensors', run: () => api.restartAgent() },
    { label: 'Export history (7 days)', icon: 'download', hint: 'Data', run: () => api.exportData('history', 7) },
    { label: 'Export events', icon: 'download', hint: 'Data', run: () => api.exportData('events') },
    { label: 'Export gaming sessions', icon: 'download', hint: 'Data', run: () => api.exportData('sessions') },
    { label: 'Send test notification', icon: 'bell', hint: 'Alerts', run: () => api.testNotification() },
    { label: 'Open data folder', icon: 'folder', hint: 'Data', run: () => api.openData() },
  ];
  let sel = 0; let list: Cmd[] = cmds;
  const ul = h('ul');
  const input = h('input', { placeholder: 'Type a view, theme or action…' });
  const close = () => back.remove();
  const render = () => {
    ul.replaceChildren(...list.map((c, i) => h('li', { class: i === sel ? 'sel' : '', onclick: () => { close(); c.run(); }, onmousemove: () => { if (sel !== i) { sel = i; render(); } } }, icon(c.icon, 16), c.label, c.hint ? h('span', { class: 'hint' }, c.hint) : null)));
    ul.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  };
  input.addEventListener('input', () => { const q = input.value.toLowerCase().split(/\s+/).filter(Boolean); list = cmds.filter((c) => q.every((w) => c.label.toLowerCase().includes(w) || (c.hint ?? '').toLowerCase().includes(w))); sel = 0; render(); });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'ArrowDown') { sel = Math.min(list.length - 1, sel + 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
    else if (e.key === 'Enter') { const c = list[sel]; close(); c?.run(); }
    else if (e.key === 'Escape') close();
  });
  const back = h('div', { class: 'palette-back', onclick: (e: Event) => { if (e.target === back) close(); } }, h('div', { class: 'palette' }, input, ul));
  document.body.appendChild(back); render(); input.focus();
}
async function save(patch: Partial<Settings>) { state.settings = await api.setSettings(patch); applySettings(state.settings); }

// ── shell ───────────────────────────────────────────────────────
const chips = { agent: h('span'), mode: h('span'), health: h('span') };
function buildShell() {
  const root = document.getElementById('root')!;
  indicator = h('div', { class: 'nav-indicator' });
  nav = h('nav', { class: 'sidebar' }, indicator);
  let group = '';
  views.forEach((v, i) => {
    if (v.group !== group) { group = v.group; nav.append(h('div', { class: 'nav-group' }, group)); }
    const badge = h('span', { class: 'nav-badge', style: { display: 'none' } });
    const item = h('div', { class: 'nav-item', title: `${v.title}${i < 9 ? `  (Ctrl+${i + 1})` : ''}`, onclick: () => show(v.id) }, icon(v.icon, 18), h('span', { class: 'nav-label' }, v.title), badge);
    (item as any)._badge = badge; (item as any)._view = v;
    navItems.set(v.id, item); nav.append(item);
  });
  const credit = h('a', { class: 'dev-credit', href: DEVELOPER.url, title: `Developed by ${DEVELOPER.name} — ${DEVELOPER.url}`, onclick: (e: Event) => { e.preventDefault(); api.openUrl(DEVELOPER.url); } },
    h('img', { class: 'dev-mark', src: '../../assets/quantumsparc-mark.png', alt: 'QuantumSparc' }), h('span', { class: 'nav-label' }, h('small', null, 'Developed by'), DEVELOPER.name));
  nav.append(h('div', { class: 'side-foot' }, credit, h('button', { class: 'collapse-btn', onclick: () => save({ sidebarCollapsed: !state.settings.sidebarCollapsed }) }, icon('chevron', 16), h('span', { class: 'nav-label' }, 'Collapse'))));
  main = h('main', { class: 'main' });
  const title = h('header', { class: 'titlebar' },
    h('div', { class: 'brand' }, h('div', { class: 'brand-logo' }), 'Predator Monitor', h('small', null, 'PH315-53')),
    h('div', { class: 'tb-chips' }, chips.agent, chips.mode, chips.health),
    h('div', { class: 'tb-spacer' }),
    h('div', { class: 'tb-search', onclick: palette }, icon('search', 15), 'Search views & actions', h('kbd', null, 'Ctrl K')));
  root.append(h('div', { class: `app ${state.settings.sidebarCollapsed ? 'collapsed' : ''}` }, title, nav, main));
  new ResizeObserver(() => current && moveIndicator(current.id)).observe(nav);
}
function updateChips(s?: Snapshot) {
  chips.agent.replaceChildren(pill(state.agent === 'running' ? (state.admin ? 'Full sensors' : 'Live') : state.agent, state.agent === 'running' ? 'ok' : 'warn'));
  (chips.agent.firstChild as HTMLElement)?.prepend(h('span', { class: 'dot' }));
  if (s) {
    chips.mode.replaceChildren(pill(s.derived.psMode, 'info'));
    chips.health.replaceChildren(pill(`Health ${s.derived.healthScore}`, s.derived.healthScore >= 85 ? 'ok' : s.derived.healthScore >= 60 ? 'warn' : 'crit'));
  }
}
function updateBadges() {
  navItems.forEach((item) => { const v = (item as any)._view as View; const b = (item as any)._badge as HTMLElement; const r = v.badge?.(); if (r) { b.style.display = ''; b.textContent = r.text; b.className = `nav-badge ${r.level}`; } else b.style.display = 'none'; });
}

// ── animation loop ──────────────────────────────────────────────
let lastFrame = 0;
function frame(now: number) {
  if (!document.hidden) spinAllFans(now);
  if (!document.hidden && now - lastFrame > (state.settings.animations === 'off' ? 500 : state.settings.animations === 'reduced' ? 66 : 15)) { lastFrame = now; drawAllCharts(Date.now()); }
  requestAnimationFrame(frame);
}

// ── boot ────────────────────────────────────────────────────────
async function boot() {
  const init = await api.init();
  Object.assign(state, { static: init.static, slow: init.slow, procs: init.procs, gpuStatic: init.gpuStatic, lhmMeta: init.lhmMeta, settings: init.settings, events: init.events, sessions: init.sessions,
    batteryLog: init.batteryLog, profile: init.profile, admin: init.admin, version: init.version, dataDir: init.dataDir, lhmInstalled: init.lhmInstalled, agent: init.static ? 'running' : 'starting' });
  applySettings(state.settings, true);
  buildViews(); buildShell(); updateChips(init.last ?? undefined);
  if (init.last) ingest(init.last);
  show(location.hash.slice(1) || 'overview');
  requestAnimationFrame(frame);
  setTimeout(() => document.getElementById('loading')?.classList.add('done'), 250);

  api.onSnapshot((s: Snapshot) => {
    ingest(s);
    try { current?.update?.(s); } catch (e) { console.error(e); }
    updateChips(s); updateBadges();
  });
  api.onProcs((m: any) => { state.procs = m; current?.onProcs?.(); });
  api.onSlow((m: any) => { state.slow = m; current?.onSlow?.(); });
  api.onStatic((m: any) => { const first = !state.static; state.static = m; state.agent = 'running'; updateChips(); if (first) remount(); });
  api.onGpuStatic((m: any) => { state.gpuStatic = m; });
  api.onLhmMeta((m: any) => { state.lhmMeta = m; if (current?.id === 'thermal') remount(); });
  api.onSettings((s: Settings) => { state.settings = s; });
  api.onStatus((m: any) => { if (m.agent) { state.agent = m.agent; if (m.admin != null) state.admin = m.admin; updateChips(); } });
  api.onEvent((e: EventEntry) => { state.events.push(e); current?.onEvent?.(); toast(e.title, e.detail, e.level); });
  api.onSession((s: any) => { state.sessions.push(s); current?.onEvent?.(); });

  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'k') { e.preventDefault(); palette(); }
    else if (e.ctrlKey && e.key.toLowerCase() === 'b') { e.preventDefault(); save({ sidebarCollapsed: !state.settings.sidebarCollapsed }); }
    else if (e.ctrlKey && /^[1-9]$/.test(e.key)) { const v = views[+e.key - 1]; if (v) show(v.id); }
    else if (e.key === 'Escape') document.querySelector('.palette-back')?.remove();
  });
}
boot();
