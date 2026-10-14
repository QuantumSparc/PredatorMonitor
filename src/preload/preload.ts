import { contextBridge, ipcRenderer } from 'electron';

const on = (channel: string) => (cb: (payload: any) => void) => {
  const fn = (_e: unknown, p: any) => cb(p);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};

const api = {
  init: () => ipcRenderer.invoke('init'),
  history: (fromMs: number, toMs?: number) => ipcRenderer.invoke('history', fromMs, toMs),
  setSettings: (patch: object) => ipcRenderer.invoke('settings:set', patch),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  setTitlebar: (color: string, symbol: string) => ipcRenderer.invoke('titlebar', color, symbol),
  elevate: () => ipcRenderer.invoke('sensors:elevate'),
  testNotification: () => ipcRenderer.invoke('notify:test'),
  setupLhm: () => ipcRenderer.invoke('sensors:setupLhm'),
  restartAgent: () => ipcRenderer.invoke('sensors:restartAgent'),
  openData: () => ipcRenderer.invoke('open:data'),
  openUrl: (url: string) => ipcRenderer.invoke('open:url', url),
  exportData: (kind: 'history' | 'events' | 'sessions', days?: number) => ipcRenderer.invoke('export', kind, days),
  onSnapshot: on('snapshot'), onProcs: on('procs'), onSlow: on('slow'), onStatic: on('static'), onGpuStatic: on('gpuStatic'),
  onLhmMeta: on('lhmMeta'), onEvent: on('event'), onSession: on('session'), onSettings: on('settings'), onStatus: on('status'),
  onLog: on('log'), onSetupLog: on('setup:log'),
};

contextBridge.exposeInMainWorld('api', api);
export type Api = typeof api;
