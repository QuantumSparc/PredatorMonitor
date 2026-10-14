/**
 * Machine profile — the hardware facts the insights engine compares live data against.
 * Source: "Acer Predator Helios 300 (PH315-53) & Alienware AW3425DWM — Master Technical Dossier" (8 pages)
 * plus owner-confirmed facts (◆). These are NOT measured; live readings come from the agent.
 */
/** Developer credit shown in the app, installer and exe metadata. */
export const DEVELOPER = { name: 'QuantumSparc Technologies', url: 'https://quantumsparc.com/' } as const;

export const PROFILE = {
  name: 'Predator Helios 300 · PH315-53',
  cpu: {
    model: 'Intel Core i7-10750H',
    cores: 6,
    threads: 12,
    baseGHz: 2.6,
    tdpW: 45,
    pl1W: 70,              // CPU-only sustained
    pl1SharedW: [45, 56],  // EC lowers PL1 once the GPU draws > 40 W (45 Normal, 52–56 Fast/Turbo)
    pl1SharedGpuThresholdW: 40,
    pl2W: 107,
    tauNormalS: 28,
    tauTurboS: 56,
    pl4AcW: 179,
    pl4BatteryW: [65, 85],
    iccMaxA: 140,
    tjMaxC: 100,
    prochotC: 92,
    tvbC: 65,              // Thermal Velocity Boost: 5.0 GHz only at or below this
    turboGHz: { 1: 5.0, 2: 5.0, 3: 4.6, 4: 4.5, 5: 4.4, 6: 4.3 } as Record<number, number>,
    turboNoTvbGHz: 4.8,
  },
  gpu: {
    model: 'NVIDIA GeForce RTX 2060 Mobile (TU106)',
    vramGB: 6,
    busBits: 192,
    tgp: { normal: 80, fast: [85, 90], turbo: 90, turboPeak: 93.5 },
    sustainedMHz: { normal: [1350, 1485], fast: [1500, 1590], turbo: [1575, 1680] },
    cudaCores: 1920,
  },
  memory: { maxMTs: 2933, dualChannelGBs: 46.93, singleChannelGBs: 23.46, officialMaxGB: 32 },
  power: {
    adapterW: 230,                 // ◆ owner-confirmed: 230 W Delta Electronics
    adapterModel: 'Delta ADP-230JB D',
    restOfSystemW: 25,             // screen, fans, chipset, SSDs — estimate for the budget
    batteryDesignWh: 58.75,
    batteryRatedWh: 57.48,
    batteryModel: 'AP18E7M',
    nosThresholdPct: 30,
  },
  cooling: { gpuFanMaxRpm: 6122, cpuFanMaxRpm: 5660, exhaustC: [55, 68] },
  display: {
    monitor: 'Alienware AW3425DWM',
    width: 3440, height: 1440, maxHz: 180,
    hbr3PayloadGbps: 25.92,
    hbr2PayloadGbps: 17.28,
    hdmi20PayloadGbps: 14.4,
    cvtRbv2Overhead: 951.67e6 / (3440 * 1440 * 180),   // pixel-clock overhead factor from the dossier
    dscCompressedGbps: 9.52,
    gsyncRange: [48, 180],
    laptopPanel: '15.6" BOE IPS 1080p 144 Hz',
  },
  storage: { dmiGBs: 3.93, gen3x4MBs: 3500 },
} as const;

export type Profile = typeof PROFILE;

/** PredatorSense mode inferred from the GPU power limit the VBIOS enforces. */
export function predatorSenseFromLimit(limitW: number | null | undefined): 'Normal' | 'Fast' | 'Turbo' | 'Unknown' {
  if (!limitW) return 'Unknown';
  if (limitW >= 90) return 'Turbo';
  if (limitW > 81) return 'Fast';
  return 'Normal';
}

/** Gbps a display mode needs at a given colour depth (bits per channel), CVT-RBv2 timing. */
export function linkGbps(width: number, height: number, hz: number, bpc = 8): number {
  return (width * height * hz * PROFILE.display.cvtRbv2Overhead * bpc * 3) / 1e9;
}
