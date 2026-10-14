// Shapes of the data flowing agent → main process → renderer.

export interface DiskTick { name: string; r: number; w: number; active: number | null; q: number; rlatMs: number; wlatMs: number; riops: number; wiops: number }
export interface NetTick { name: string; rx: number; tx: number; bw: number }

export interface AcerData {
  cpuFanMode?: string; gpuFanMode?: string; cpuFanPct?: number; gpuFanPct?: number;
  platformProfile?: string; platformProfileRaw?: number; gpuOverclock?: string; oc1?: number; oc2?: number;
  turboLed?: boolean; cpuTempC?: number; gpuTempC?: number; extTempC?: number; cpuFanRpm?: number; gpuFanRpm?: number;
  sysInfoSupportedMask?: number;
}

export interface AgentTick {
  type: 'tick'; t: number; n: number;
  cpu: { util: number; perf: number; mhz: number; priv: number; intr: number; dpc: number; coreUtil: number[]; coreMhz: number[]; ctxSwitches: number; queue: number; threads: number; processes: number };
  power: { pkgW: number | null; coresW: number | null; igpuW: number | null; dramW: number | null; meterW: number | null };
  mem: { total: number; avail: number; used: number; commit: number; commitLimit: number; cache: number; paged: number; nonpaged: number; compressed: number; pageFaults: number; pagesIn: number; pagefilePct: number };
  thermal: { zoneC: number | null; passivePct: number | null; reasons: number | null };
  disks: DiskTick[];
  net: NetTick[];
  battery: { online: boolean; charging: boolean; discharging: boolean; critical: boolean; chargeRateW: number; dischargeRateW: number; voltageV: number; remainingWh: number } | null;
  acer: AcerData | null;
  lhm: [string, number | null][] | null;
}

export interface GpuTick {
  t: number; tempC: number | null; util: number | null; memUtil: number | null; memUsedMiB: number | null; memTotalMiB: number | null;
  powerW: number | null; limitW: number | null; maxLimitW: number | null; coreMHz: number | null; smMHz: number | null; memMHz: number | null; videoMHz: number | null;
  maxCoreMHz: number | null; maxMemMHz: number | null; pstate: string | null; fanPct: number | null; throttleMask: number | null;
  pcieGen: number | null; pcieWidth: number | null; encSessions: number | null; encFps: number | null; displayActive: string | null;
}

export interface GpuStatic { name: string; driver: string; vbios: string; computeCap: string; busId: string; defaultLimitW: number | null; maxLimitW: number | null; pcieGenMax: number | null; pcieWidthMax: number | null }

export interface ProcInfo { pid: number; name: string; cpu: number; ws: number; priv: number; gpu: number; gpuEng: string | null; gpuMem: number; threads: number; handles: number; title: string | null }
export interface ProcsMsg { type: 'procs'; t: number; count: number; top: ProcInfo[] }

export interface StaticMsg {
  type: 'static'; t: number; admin: boolean; pid: number; pwsh: string;
  caps: { acerWmi: boolean; lhm: boolean; rapl: boolean; thermalZone: boolean; gpuEngine: boolean };
  system: Record<string, any>; cpu: { name: string; cores: number; threads: number; baseMHz: number; l2KB: number; l3KB: number; socket: string; coreNames: string[] };
  memory: { totalBytes: number; modules: { slot: string; bytes: number; maker: string; part: string; rated: number; running: number; volts: number; width: number }[] };
  disks: { id: number; model: string; sizeBytes: number; mediaType: number; busType: number; firmware: string; health: number }[];
  monitors: { maker: string; model: string; product: string; year: number; week: number; widthCm: number; heightCm: number }[];
}

export interface SlowMsg {
  type: 'slow'; t: number;
  volumes: { letter: string; label: string; size: number; free: number; fs: string; health: number }[];
  partitions: { letter: string; disk: number }[];
  adapters: { name: string; desc: string; up: boolean; speed: number; mac: string; index: number }[];
  ipConfig: { index: number; ip: string[]; gateway: string[]; dns: string[]; dhcp: boolean; desc: string }[];
  wifi: Record<string, string> | null;
  battery: { fullWh: number | null; designWh: number | null; cycles: number | null };
  videoControllers: { name: string; w: number; h: number; hz: number; bpp: number; driver: string; driverDate: string; vramBytes: number }[];
  powerPlan: string; bootTime: string; acerSlow: Record<string, any> | null;
}

export interface LhmSensorMeta { id: string; hw: string; hwType: string; type: string; name: string }

export type Level = 'ok' | 'info' | 'warn' | 'crit';
export interface Insight {
  id: string; level: Level; title: string; detail: string; category: string;
  value?: number; max?: number; unit?: string;   // optional gauge
  tip?: string;
}

export interface EventEntry { t: number; kind: string; level: Level; title: string; detail: string }

export interface SessionSummary {
  start: number; end: number; durationS: number; game: string | null;
  cpuPkgAvgW: number; cpuPkgMaxW: number; gpuAvgW: number; gpuMaxW: number; gpuTempAvg: number; gpuTempMax: number; zoneTempMax: number;
  cpuMhzAvg: number; gpuMhzAvg: number; gpuUtilAvg: number; throttleS: number; mode: string;
}

/** What the renderer receives every tick. */
export interface Snapshot {
  t: number;
  tick: AgentTick | null;
  gpu: GpuTick | null;
  insights: Insight[];
  derived: {
    psMode: string; pl1EffW: number; plState: string; tauEwmaW: number; tauLeftS: number | null; systemDrawW: number | null; adapterPct: number | null;
    /** how systemDrawW was obtained: measured from the battery discharge rate, or estimated (fixed or learned rest-of-system) */
    systemDrawSource: 'battery' | 'learned' | 'estimate'; restW: number;
    nosActive: boolean; optimusBypass: 'bypassed' | 'laptop-on' | 'no-external' | 'unknown'; linkPct: number | null; linkNeedsDsc: boolean;
    cpuTempC: number | null; cpuTempSource: string; healthScore: number; sessionActive: boolean; sessionS: number;
  };
}

export interface Settings {
  theme: 'mocha' | 'macchiato' | 'frappe' | 'latte' | 'midnight' | 'predator';
  accent: string;
  glass: number;            // 0–100 panel translucency
  windowMaterial: 'acrylic' | 'mica' | 'none';
  animations: 'full' | 'reduced' | 'off';
  animationSpeed: number;   // 0.5–2
  density: 'compact' | 'comfortable' | 'spacious';
  fontScale: number;        // 0.85–1.3
  tempUnit: 'C' | 'F';
  intervalMs: number;       // agent sample interval
  chartWindowS: number;     // live chart span
  historyDays: number;
  sidebarCollapsed: boolean;
  startWithWindows: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  alwaysOnTop: boolean;
  trayTooltip: 'cpu-gpu-temp' | 'power' | 'off';
  notifications: boolean;
  alertSound: boolean;
  thresholds: { cpuTempWarn: number; cpuTempCrit: number; gpuTempWarn: number; gpuTempCrit: number; zoneTempWarn: number; ramWarn: number; diskFreeWarnPct: number; batteryWearWarn: number; vramWarn: number };
  overviewTiles: string[];  // order + visibility of dashboard tiles
  hiddenInsights: string[];
  sessionGpuUtil: number;   // GPU % that starts a gaming session
  tilesVersion?: number;
  learnedRestW?: number;    // rest-of-system draw learned from battery discharge (screen, fans, chipset, SSDs, DRAM…)    // bumps when new dashboard tiles are added
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'mocha', accent: 'mauve', glass: 72, windowMaterial: 'acrylic', animations: 'full', animationSpeed: 1, density: 'comfortable', fontScale: 1,
  tempUnit: 'C', intervalMs: 1000, chartWindowS: 120, historyDays: 30, sidebarCollapsed: false,
  startWithWindows: false, startMinimized: false, closeToTray: true, alwaysOnTop: false, trayTooltip: 'cpu-gpu-temp',
  notifications: true, alertSound: false,
  thresholds: { cpuTempWarn: 85, cpuTempCrit: 92, gpuTempWarn: 80, gpuTempCrit: 87, zoneTempWarn: 85, ramWarn: 90, diskFreeWarnPct: 10, batteryWearWarn: 40, vramWarn: 90 },
  overviewTiles: ['cpu', 'gpu', 'power', 'thermal', 'fans', 'memory', 'battery', 'storage', 'network', 'display'],
  hiddenInsights: [],
  sessionGpuUtil: 55,
};
