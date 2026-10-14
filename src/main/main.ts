import { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, shell, Tray, dialog } from 'electron';
import { execFile, spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PROFILE } from '../shared/profile';
import type { EventEntry, Insight, Level, Settings, Snapshot } from '../shared/types';
import { InsightEngine } from './insights';
import { SensorHub } from './sensors';
import { SessionTracker, Store } from './store';

const ROOT = app.getAppPath();
// Packaged builds keep the PowerShell agent (+ LibreHardwareMonitor DLLs) and icons as real files in
// resources/ (outside app.asar) so pwsh and Windows can open them.
const RES = app.isPackaged ? process.resourcesPath : ROOT;
// The portable build unpacks to a temp folder on every run; relaunch / start-with-Windows must point at the
// .exe the user actually has, which the portable stub passes in PORTABLE_EXECUTABLE_FILE.
const EXE = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
const AGENT_DIR = path.join(RES, 'agent');
const ASSETS = path.join(RES, 'assets');

if (!app.requestSingleInstanceLock()) app.quit();

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
const store = new Store(app.getPath('userData'));
const hub = new SensorHub(AGENT_DIR, store.settings.intervalMs);
const engine = new InsightEngine();
engine.restLearnedW = store.settings.learnedRestW ?? null;
let lastRestSave = 0;
const sessions = new SessionTracker();
let last: Snapshot | null = null;
const isAdmin = spawnSync('net', ['session'], { windowsHide: true }).status === 0;

// ── window ──────────────────────────────────────────────────────
function createWindow() {
  const s = store.settings;
  win = new BrowserWindow({
    width: 1480, height: 940, minWidth: 1080, minHeight: 680,
    show: false,
    title: 'Predator Monitor',
    icon: path.join(ASSETS, 'icon.png'),
    backgroundColor: s.windowMaterial === 'none' ? '#11111b' : '#00000000',
    backgroundMaterial: s.windowMaterial === 'none' ? 'none' : s.windowMaterial,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#cdd6f4', height: 44 },
    alwaysOnTop: s.alwaysOnTop,
    webPreferences: { preload: path.join(ROOT, 'dist', 'preload', 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  win.removeMenu();
  win.loadFile(path.join(ROOT, 'dist', 'renderer', 'index.html'));
  win.once('ready-to-show', () => { if (!(s.startMinimized && process.argv.includes('--hidden'))) win?.show(); });
  win.on('close', (e) => {
    if (!quitting && store.settings.closeToTray) { e.preventDefault(); win?.hide(); }
  });
  win.on('closed', () => { win = null; });
}

function send(channel: string, payload: unknown) {
  if (win && !win.isDestroyed() && win.webContents) win.webContents.send(channel, payload);
}

// ── tray ────────────────────────────────────────────────────────
function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(ASSETS, 'tray.png')));
  tray.setToolTip('Predator Monitor');
  tray.on('click', () => { if (!win) createWindow(); else { win.show(); win.focus(); } });
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Predator Monitor', click: () => { if (!win) createWindow(); else { win.show(); win.focus(); } } },
    { type: 'separator' },
    { label: 'Restart with full sensors (admin)', enabled: !isAdmin, click: relaunchElevated },
    { label: 'Open data folder', click: () => shell.openPath(store.dir) },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
}
function updateTray(s: Snapshot) {
  if (!tray || store.settings.trayTooltip === 'off') return;
  const u = store.settings.tempUnit;
  const t = (c: number | null | undefined) => (c == null ? '–' : u === 'F' ? `${Math.round(c * 9 / 5 + 32)}°F` : `${Math.round(c)}°C`);
  const tip = store.settings.trayTooltip === 'power'
    ? `CPU ${s.tick?.power.pkgW?.toFixed(0) ?? '–'} W · GPU ${s.gpu?.powerW?.toFixed(0) ?? '–'} W · ${s.derived.psMode}`
    : `CPU ${s.tick?.cpu.util?.toFixed(0) ?? '–'}% ${t(s.derived.cpuTempC)} · GPU ${s.gpu?.util ?? '–'}% ${t(s.gpu?.tempC)}`;
  tray.setToolTip(`Predator Monitor\n${tip}`);
}

// ── elevation & sensor setup ────────────────────────────────────
function relaunchElevated() {
  const args = app.isPackaged ? [] : [`"${ROOT}"`];
  const ps = `Start-Process -FilePath '${EXE}' ${args.length ? `-ArgumentList '${args.join(' ')}'` : ''} -Verb RunAs`;
  spawn('powershell.exe', ['-NoProfile', '-Command', ps], { detached: true, windowsHide: true }).unref();
  quitting = true;
  setTimeout(() => app.quit(), 400);
}
function runScript(file: string, args: string[] = []): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn('pwsh.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file, ...args], { windowsHide: true });
    const fwd = (d: Buffer) => send('setup:log', String(d));
    p.stdout.on('data', fwd); p.stderr.on('data', fwd);
    p.on('exit', (code) => resolve(code ?? 1));
  });
}

// ── alerts & events ─────────────────────────────────────────────
const alertCooldown = new Map<string, number>();
function alert(i: Insight) {
  if (!store.settings.notifications || !Notification.isSupported()) return;
  const now = Date.now();
  if ((alertCooldown.get(i.id) ?? 0) > now) return;
  alertCooldown.set(i.id, now + 10 * 60 * 1000);
  new Notification({ title: i.title, body: i.detail + (i.tip ? `\n${i.tip}` : ''), silent: !store.settings.alertSound, icon: path.join(ASSETS, 'icon.png') }).show();
}
function logEvent(kind: string, level: Level, title: string, detail: string) {
  const e: EventEntry = store.event({ kind, level, title, detail });
  send('event', e);
}
let prevMode = ''; let prevOnline: boolean | null = null; let prevNos = false;
const thr = { raw: false, on: false, since: 0, start: 0, peakC: 0, why: '' };
function detectEvents(s: Snapshot) {
  if (s.derived.psMode !== 'Unknown' && prevMode && s.derived.psMode !== prevMode) logEvent('mode', 'info', `PredatorSense → ${s.derived.psMode}`, `was ${prevMode}`);
  if (s.derived.psMode !== 'Unknown') prevMode = s.derived.psMode;
  // Throttling is debounced: it must hold for 3 s to start and be clear for 15 s to end, so a CPU
  // hovering at the PROCHOT point produces one start/end pair instead of a toast every few seconds.
  const throttling = s.derived.plState.startsWith('Thermal') || s.insights.some((i) => i.id === 'gpu-throttle' && i.level === 'warn');
  const now = s.t;
  if (throttling !== thr.raw) { thr.raw = throttling; thr.since = now; }
  if (thr.on) thr.peakC = Math.max(thr.peakC, s.derived.cpuTempC ?? 0);
  if (!thr.on && throttling && now - thr.since >= 3000) {
    thr.on = true; thr.start = now - 3000; thr.peakC = s.derived.cpuTempC ?? 0;
    thr.why = s.insights.find((i) => i.id === 'gpu-throttle')?.title ?? s.derived.plState;
    logEvent('throttle', 'warn', 'Throttling started', thr.why);
  } else if (thr.on && !throttling && now - thr.since >= 15000) {
    thr.on = false;
    const dur = Math.round((thr.since - thr.start) / 1000);
    logEvent('throttle', 'ok', 'Throttling ended', `${thr.why} · lasted ${dur >= 60 ? `${Math.floor(dur / 60)} min ${dur % 60} s` : `${dur} s`} · peak ${Math.round(thr.peakC)} °C`);
    thr.why = '';
  }
  const online = s.tick?.battery?.online ?? null;
  if (online != null && prevOnline != null && online !== prevOnline) logEvent('power', 'info', online ? 'AC adapter connected' : 'Running on battery', `${s.tick?.battery?.remainingWh?.toFixed(1)} Wh left`);
  prevOnline = online;
  if (s.derived.nosActive && !prevNos) logEvent('nos', 'warn', 'NOS battery boost kicked in', 'The adapter could not cover the load on its own.');
  prevNos = s.derived.nosActive;
  for (const i of s.insights) if (i.level === 'crit') alert(i);
}

// ── main data loop ──────────────────────────────────────────────
function topGpuProcess(): string | null {
  const top = hub.lastProcs?.top?.filter((p) => p.gpu > 5).sort((a, b) => b.gpu - a.gpu)[0];
  return top ? top.name : null;
}
hub.on('tick', () => {
  const now = Date.now();
  const partial = engine.compute(hub.lastTick, hub.lastGpu, hub.lastSlow, hub.static, hub.lhmMeta, store.settings, { active: sessions.active, seconds: sessions.seconds(now) });
  const snap: Snapshot = { t: now, tick: hub.lastTick, gpu: hub.lastGpu, ...partial };
  const ended = sessions.update(snap, store.settings.sessionGpuUtil, topGpuProcess());
  if (ended) {
    store.session(ended);
    send('session', ended);
    logEvent('session', 'info', `Gaming session ended${ended.game ? ` — ${ended.game}` : ''}`, `${Math.round(ended.durationS / 60)} min · GPU avg ${ended.gpuAvgW} W, max ${ended.gpuTempMax} °C · throttled ${ended.throttleS} s`);
  }
  last = snap;
  // keep the learned rest-of-system draw across restarts (saved at most once a minute)
  const learned = engine.restLearnedW;
  if (learned != null && now - lastRestSave > 60000 && Math.abs(learned - (store.settings.learnedRestW ?? 0)) > 0.5) { lastRestSave = now; store.saveSettings({ learnedRestW: Math.round(learned * 10) / 10 }); }
  store.add(snap);
  detectEvents(snap);
  updateTray(snap);
  send('snapshot', snap);
});
hub.on('procs', (m) => send('procs', m));
hub.on('slow', (m) => { send('slow', m); if (m.battery?.fullWh) store.logBattery(m.battery.fullWh); });
hub.on('static', (m) => send('static', m));
hub.on('gpuStatic', (m) => send('gpuStatic', m));
hub.on('lhmMeta', (m) => send('lhmMeta', m));
hub.on('status', (m) => send('status', m));
hub.on('log', (m) => { send('log', m); if (m.level === 'error') console.error('[agent]', m.msg); });

// ── IPC ─────────────────────────────────────────────────────────
ipcMain.handle('init', () => ({
  static: hub.static, slow: hub.lastSlow, procs: hub.lastProcs, gpuStatic: hub.gpuStatic, lhmMeta: hub.lhmMeta, last,
  settings: store.settings, events: store.events.slice(-300), sessions: store.sessions.slice(-200), batteryLog: store.batteryLog(),
  profile: PROFILE, admin: isAdmin, version: app.getVersion(), dataDir: store.dir,
  lhmInstalled: fs.existsSync(path.join(AGENT_DIR, 'lhm', 'LibreHardwareMonitorLib.dll')),
}));
ipcMain.handle('history', (_e, fromMs: number, toMs?: number) => { store.flush(); return store.history(fromMs, toMs); });
ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
  const before = store.settings;
  const s = store.saveSettings(patch);
  if (patch.intervalMs && patch.intervalMs !== before.intervalMs) hub.setInterval(patch.intervalMs);
  if (patch.alwaysOnTop !== undefined) win?.setAlwaysOnTop(s.alwaysOnTop);
  if (patch.windowMaterial !== undefined && win) { win.setBackgroundMaterial(s.windowMaterial === 'none' ? 'none' : s.windowMaterial); win.setBackgroundColor(s.windowMaterial === 'none' ? '#11111b' : '#00000000'); }
  if (patch.startWithWindows !== undefined || patch.startMinimized !== undefined) app.setLoginItemSettings({ openAtLogin: s.startWithWindows, path: EXE, args: s.startMinimized ? ['--hidden'] : [] });
  if (patch.historyDays !== undefined) store.prune();
  send('settings', s);
  return s;
});
ipcMain.handle('settings:reset', () => { const s = store.resetSettings(); send('settings', s); return s; });
ipcMain.handle('titlebar', (_e, color: string, symbol: string) => { try { win?.setTitleBarOverlay({ color, symbolColor: symbol, height: 44 }); } catch { /* not supported */ } });
ipcMain.handle('notify:test', () => {
  if (!Notification.isSupported()) return false;
  new Notification({ title: 'Predator Monitor', body: `Notifications work. CPU ${last?.derived.cpuTempC ?? '–'} °C · GPU ${last?.gpu?.tempC ?? '–'} °C · ${last?.derived.psMode ?? ''}`, silent: !store.settings.alertSound, icon: path.join(ASSETS, 'icon.png') }).show();
  return true;
});
ipcMain.handle('sensors:elevate', () => relaunchElevated());
ipcMain.handle('sensors:setupLhm', async () => runScript(path.join(AGENT_DIR, 'setup-lhm.ps1')));
ipcMain.handle('sensors:restartAgent', () => { hub.stop(); hub.start(); });
ipcMain.handle('open:data', () => shell.openPath(store.dir));
ipcMain.handle('open:url', (_e, url: string) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });
ipcMain.handle('export', async (_e, kind: 'history' | 'events' | 'sessions', days = 7) => {
  const res = await dialog.showSaveDialog(win!, { defaultPath: `predator-monitor-${kind}-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'JSON', extensions: ['json'] }, { name: 'CSV', extensions: ['csv'] }] });
  if (res.canceled || !res.filePath) return false;
  const data: any[] = kind === 'history' ? store.history(Date.now() - days * 86400000) : kind === 'events' ? store.events : store.sessions;
  if (res.filePath.endsWith('.csv')) {
    const rows = kind === 'history' ? data.map((r) => ({ time: new Date(r.t).toISOString(), ...Object.fromEntries(Object.entries(r.avg).map(([k, v]) => [k, v])) })) : data;
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    fs.writeFileSync(res.filePath, [cols.join(','), ...rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? '')).join(','))].join('\n'));
  } else fs.writeFileSync(res.filePath, JSON.stringify(data, null, 2));
  return true;
});

// ── Start Menu shortcut ─────────────────────────────────────────
// Toast headers: if a Start Menu shortcut carries the AppUserModelID, Windows names the toast after
// the shortcut's target exe — electron.exe, whose description is "Electron" when running from source.
// So the shortcut is only a launcher (no AUMID) and the AUMID is registered under HKCU with our
// name + icon (registerAppUserModelId). IDs that ever toasted unregistered stay cached as "Electron", hence a fresh ID.
const APP_ID = 'PredatorMonitor.Desktop';
const OLD_APP_IDS = ['com.predator.monitor', 'PredatorMonitor.App'];
function ensureStartMenuShortcut() {
  // The installer creates the real shortcut for packaged builds; from source we add a "(dev)" launcher.
  if (process.platform !== 'win32' || app.isPackaged) return;
  const dir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  const legacy = path.join(dir, 'Predator Monitor.lnk'); // older dev builds used the installer's name
  try { if (fs.existsSync(legacy) && /electron\.exe$/i.test(shell.readShortcutLink(legacy).target)) fs.rmSync(legacy, { force: true }); } catch { /* ignore */ }
  const lnk = path.join(dir, 'Predator Monitor (dev).lnk');
  const opts = {
    target: process.execPath,
    args: app.isPackaged ? '' : `"${ROOT}"`,
    cwd: ROOT,
    description: 'Predator Monitor (from source) — machine-aware hardware monitor',
    icon: path.join(ASSETS, 'icon.ico'), iconIndex: 0,
  };
  try {
    const current = fs.existsSync(lnk) ? shell.readShortcutLink(lnk) : null;
    if (!current || current.appUserModelId || current.target !== opts.target || current.args !== opts.args) {
      if (current) fs.rmSync(lnk, { force: true }); // 'replace' keeps the old AUMID property
      shell.writeShortcutLink(lnk, 'create', opts);
    }
  } catch (e) { console.error('shortcut', e); }
}

// The toast header comes from the AUMID's registration (DisplayName + IconUri under HKCU, per-user).
// Windows caches an ID's identity on its FIRST toast, so this runs synchronously before any notification.
function registerAppUserModelId() {
  if (process.platform !== 'win32') return;
  const base = 'HKCU\\Software\\Classes\\AppUserModelId\\';
  const reg = (...args: string[]) => spawnSync('reg.exe', args, { windowsHide: true });
  const set = (name: string, type: string, data: string) => reg('add', base + APP_ID, '/v', name, '/t', type, '/d', data, '/f');
  set('DisplayName', 'REG_EXPAND_SZ', 'Predator Monitor');
  set('IconUri', 'REG_EXPAND_SZ', path.join(ASSETS, 'icon.png'));
  set('IconBackgroundColor', 'REG_SZ', 'FF1E1E2E');
  set('ShowInSettings', 'REG_DWORD', '1');
  for (const old of OLD_APP_IDS) reg('delete', base + old, '/f');
}

// ── lifecycle ───────────────────────────────────────────────────
app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
app.whenReady().then(() => {
  registerAppUserModelId();
  app.setAppUserModelId(APP_ID);
  ensureStartMenuShortcut();
  createTray();
  createWindow();
  hub.start();
  setInterval(() => store.flush(), 60000);
});
app.on('before-quit', () => { quitting = true; store.flush(); hub.stop(); });
app.on('window-all-closed', () => { /* stay in tray */ });
