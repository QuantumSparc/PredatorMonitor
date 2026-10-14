import { PROFILE, linkGbps, predatorSenseFromLimit } from '../shared/profile';
import type { AgentTick, GpuTick, Insight, LhmSensorMeta, Settings, SlowMsg, Snapshot, StaticMsg } from '../shared/types';
import { gpuThrottleReasons } from './sensors';

/** State the engine keeps between ticks (EWMA of package power for the PL2/Tau model). */
export class InsightEngine {
  private ewmaW = 0;
  /** rest-of-system watts learned while on battery (discharge − CPU package − GPU); null until learned */
  restLearnedW: number | null = null;
  private lastT = 0;
  private zoneHist: number[] = [];
  private cpuHist: number[] = [];
  private latches = new Map<string, boolean>();
  /** Thermostat-style hysteresis: turns on at `on`, only turns off below `on - gap`. Stops warnings flapping at a threshold. */
  private hyst(id: string, v: number | null | undefined, on: number, gap = 3): boolean {
    if (v == null) return false;
    const was = this.latches.get(id) ?? false;
    const now = was ? v >= on - gap : v >= on;
    this.latches.set(id, now);
    return now;
  }
  private median(a: number[]) { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; }

  compute(tick: AgentTick | null, gpu: GpuTick | null, slow: SlowMsg | null, stat: StaticMsg | null, lhmMeta: LhmSensorMeta[], s: Settings, session: { active: boolean; seconds: number }): Pick<Snapshot, 'insights' | 'derived'> {
    const out: Insight[] = [];
    const add = (i: Insight) => { if (!s.hiddenInsights.includes(i.id)) out.push(i); };
    const T = s.thresholds;
    const fmtT = (c: number) => (s.tempUnit === 'F' ? `${Math.round(c * 9 / 5 + 32)} °F` : `${Math.round(c)} °C`);

    // ── CPU temperature: best source available ─────────────────
    let cpuTempC: number | null = null; let cpuTempSource = 'none';
    if (tick?.lhm && lhmMeta.length) {
      const pkg = lhmMeta.find((m) => m.type === 'Temperature' && /cpu/i.test(m.hwType) && /package/i.test(m.name));
      const v = pkg && tick.lhm.find(([id]) => id === pkg.id)?.[1];
      if (v != null) { cpuTempC = v; cpuTempSource = 'CPU package (LibreHardwareMonitor)'; }
    }
    if (cpuTempC == null && tick?.acer?.cpuTempC != null) { cpuTempC = tick.acer.cpuTempC; cpuTempSource = 'CPU (Acer EC)'; }
    if (cpuTempC == null && tick?.thermal.zoneC != null) { cpuTempC = tick.thermal.zoneC; cpuTempSource = 'Board thermal zone (ACPI)'; }
    const realCpuSensor = cpuTempSource.startsWith('CPU');
    // Spikes of a second or two should not flip levels: judge on the median of the last 5 readings
    if (tick?.thermal.zoneC != null) { this.zoneHist.push(tick.thermal.zoneC); if (this.zoneHist.length > 5) this.zoneHist.shift(); }
    if (cpuTempC != null) { this.cpuHist.push(cpuTempC); if (this.cpuHist.length > 5) this.cpuHist.shift(); }
    const zoneStable = this.zoneHist.length ? this.median(this.zoneHist) : null;
    const cpuStable = this.cpuHist.length ? this.median(this.cpuHist) : null;
    const fwThrottling = tick?.thermal.passivePct != null && tick.thermal.passivePct < 100;

    // ── PredatorSense mode, PL1 sharing, PL2 / Tau model ───────
    const psMode = tick?.acer?.platformProfile ? `${tick.acer.platformProfile} · ${predatorSenseFromLimit(gpu?.limitW)}` : predatorSenseFromLimit(gpu?.limitW);
    const gpuW = gpu?.powerW ?? 0;
    const pl1EffW = gpuW > PROFILE.cpu.pl1SharedGpuThresholdW
      ? (predatorSenseFromLimit(gpu?.limitW) === 'Normal' ? PROFILE.cpu.pl1SharedW[0] : PROFILE.cpu.pl1SharedW[1])
      : PROFILE.cpu.pl1W;
    const tau = predatorSenseFromLimit(gpu?.limitW) === 'Turbo' ? PROFILE.cpu.tauTurboS : PROFILE.cpu.tauNormalS;
    const pkgW = tick?.power.pkgW ?? null;
    const now = tick?.t ?? Date.now();
    if (pkgW != null) {
      const dt = this.lastT ? Math.max(0.05, (now - this.lastT) / 1000) : 1;
      this.ewmaW = this.lastT ? this.ewmaW + (pkgW - this.ewmaW) * (1 - Math.exp(-dt / tau)) : pkgW;
      this.lastT = now;
    }
    let plState = 'Unknown'; let tauLeftS: number | null = null;
    if (pkgW != null) {
      if (realCpuSensor && this.hyst('prochot', cpuStable, PROFILE.cpu.prochotC - 1, 3)) plState = 'Thermal limit (PROCHOT)'; // on ≥ 91 °C, off < 88 °C
      else if (fwThrottling) plState = 'Firmware thermal throttling';
      else if (pkgW > pl1EffW + 2 && this.ewmaW < pl1EffW) {
        plState = 'PL2 boost';
        if (pkgW > pl1EffW) tauLeftS = Math.max(0, -tau * Math.log((pkgW - pl1EffW) / Math.max(0.01, pkgW - this.ewmaW)));
      } else if (pkgW >= pl1EffW * 0.93) plState = 'PL1 limited';
      else plState = 'Below limits';
    }

    // ── Adapter / system power budget ──────────────────────────
    const bat = tick?.battery;
    const chargeW = bat?.charging ? bat.chargeRateW : 0;
    // On battery the discharge rate IS the whole-laptop draw — use it, and learn what the parts we
    // can't meter (screen, fans, chipset, SSDs, DRAM, Wi-Fi) add up to. On AC use the learned value.
    let systemDrawW: number | null = null; let systemDrawSource: 'battery' | 'learned' | 'estimate' = 'estimate';
    if (bat && !bat.online && bat.discharging && bat.dischargeRateW > 3) {
      systemDrawW = bat.dischargeRateW; systemDrawSource = 'battery';
      if (pkgW != null) {
        const sample = Math.min(60, Math.max(3, bat.dischargeRateW - pkgW - gpuW));
        this.restLearnedW = this.restLearnedW == null ? sample : this.restLearnedW + (sample - this.restLearnedW) * 0.02; // ~50 s EWMA
      }
    }
    const restW = this.restLearnedW ?? PROFILE.power.restOfSystemW;
    if (systemDrawW == null && pkgW != null) { systemDrawW = pkgW + gpuW + restW + chargeW; systemDrawSource = this.restLearnedW != null ? 'learned' : 'estimate'; }
    const adapterPct = systemDrawW != null && bat?.online ? (systemDrawW / PROFILE.power.adapterW) * 100 : null;
    const nosActive = !!(bat?.online && bat.discharging && bat.dischargeRateW > 1);

    // ── Displays: Optimus bypass + DisplayPort link budget ─────
    const vcs = slow?.videoControllers ?? [];
    const intel = vcs.find((v) => /intel/i.test(v.name) && v.w > 0);
    const nv = vcs.find((v) => /nvidia/i.test(v.name) && v.w > 0);
    const optimusBypass: Snapshot['derived']['optimusBypass'] = nv ? (intel ? 'laptop-on' : 'bypassed') : (vcs.length ? 'no-external' : 'unknown');
    let linkPct: number | null = null; let linkNeedsDsc = false;
    if (nv) {
      const need8 = linkGbps(nv.w, nv.h, nv.hz, 8);
      linkPct = (need8 / PROFILE.display.hbr3PayloadGbps) * 100;
      linkNeedsDsc = linkGbps(nv.w, nv.h, nv.hz, 10) > PROFILE.display.hbr3PayloadGbps;
    }

    // ══ Insights ═══════════════════════════════════════════════
    if (cpuTempC != null && realCpuSensor) {
      const lvl = this.hyst('cpu-crit', cpuStable, T.cpuTempCrit, 2) ? 'crit' : this.hyst('cpu-warn', cpuStable, T.cpuTempWarn) ? 'warn' : 'ok';
      add({ id: 'cpu-temp', category: 'Thermal', level: lvl, title: `CPU ${fmtT(cpuTempC)} — ${Math.max(0, Math.round(PROFILE.cpu.prochotC - cpuTempC))} °C to PROCHOT`,
        detail: `Source: ${cpuTempSource}. Acer throttles at ${PROFILE.cpu.prochotC} °C (Tj max ${PROFILE.cpu.tjMaxC} °C).`, value: cpuTempC, max: PROFILE.cpu.tjMaxC, unit: '°C' });
      {
        add({ id: 'tvb', category: 'Thermal', level: cpuTempC <= PROFILE.cpu.tvbC ? 'ok' : 'info',
          title: cpuTempC <= PROFILE.cpu.tvbC ? '5.0 GHz Thermal Velocity Boost available' : `TVB off — single-core max ${PROFILE.cpu.turboNoTvbGHz} GHz`,
          detail: `TVB needs the package at or below ${PROFILE.cpu.tvbC} °C; above that the top bin is ${PROFILE.cpu.turboNoTvbGHz} GHz.` });
      }
    }
    if (zoneStable != null && (this.hyst('zone-warn', zoneStable, T.zoneTempWarn) || fwThrottling)) {
      add({ id: 'zone-hot', category: 'Thermal', level: fwThrottling ? 'crit' : 'warn', title: `Board thermal zone ${fmtT(zoneStable)}${fwThrottling ? ' — firmware throttling' : ''}`,
        detail: `Median of the last 5 s. Firmware passive limit ${tick?.thermal.passivePct ?? 100}% — ${fwThrottling ? 'the firmware is throttling' : 'no firmware throttling yet'}. This zone is a board sensor, not the CPU die${realCpuSensor ? '' : ' — enable full sensors for the real CPU temperature'}.`, tip: 'Raise the rear, clear the vents, or use CoolBoost.' });
    }
    if (pkgW != null) {
      add({ id: 'pl-state', category: 'Power', level: /Thermal|thermal/.test(plState) ? 'crit' : plState === 'PL1 limited' ? 'info' : 'ok',
        title: `${plState} — package ${pkgW.toFixed(1)} W`,
        detail: `Effective PL1 ${pl1EffW} W${pl1EffW < PROFILE.cpu.pl1W ? ` (EC lowered it from ${PROFILE.cpu.pl1W} W because the GPU draws ${gpuW.toFixed(0)} W)` : ''}, PL2 ${PROFILE.cpu.pl2W} W, Tau ${tau} s. EWMA ${this.ewmaW.toFixed(1)} W${tauLeftS != null ? ` · ~${tauLeftS.toFixed(0)} s of boost left` : ''}.`,
        value: pkgW, max: PROFILE.cpu.pl2W, unit: 'W' });
    }
    if (gpu) {
      add({ id: 'ps-mode', category: 'Power', level: 'info', title: `PredatorSense: ${psMode}`,
        detail: `GPU power limit ${gpu.limitW ?? '?'} W (Normal 80 W · Fast 85–90 W · Turbo 90 W).${tick?.acer?.cpuFanMode ? ` Fans: CPU ${tick.acer.cpuFanMode}, GPU ${tick.acer.gpuFanMode}.` : ''}` });
      const reasons = gpuThrottleReasons(gpu.throttleMask).filter((r) => r !== 'Idle' && r !== 'App clock setting');
      if (reasons.length) add({ id: 'gpu-throttle', category: 'GPU', level: reasons.some((r) => /thermal|brake|slowdown/i.test(r)) ? 'warn' : 'info', title: `GPU limited: ${reasons.join(', ')}`, detail: `Core ${gpu.coreMHz} MHz at ${gpu.powerW?.toFixed(0)} W / ${gpu.limitW} W, ${gpu.tempC} °C.` });
      if (this.hyst('gpu-warn', gpu.tempC, T.gpuTempWarn)) add({ id: 'gpu-temp', category: 'GPU', level: this.hyst('gpu-crit', gpu.tempC, T.gpuTempCrit, 2) ? 'crit' : 'warn', title: `GPU ${fmtT(gpu.tempC!)}`, detail: 'RTX 2060 Mobile slows down around 87 °C.', value: gpu.tempC!, max: 95, unit: '°C' });
      if (gpu.memUsedMiB != null && gpu.memTotalMiB) {
        const p = (gpu.memUsedMiB / gpu.memTotalMiB) * 100;
        if (p >= T.vramWarn) add({ id: 'vram', category: 'GPU', level: 'warn', title: `VRAM ${p.toFixed(0)}% full`, detail: `${(gpu.memUsedMiB / 1024).toFixed(1)} of 6 GB. At 3440×1440 games need 1.1–1.6 GB more than at 1080p.`, tip: 'Drop textures to High or use DLSS Quality/Balanced (saves ~500 MB).' });
      }
    }
    if (adapterPct != null) {
      add({ id: 'adapter', category: 'Power', level: adapterPct > 95 ? 'warn' : 'ok', title: `Adapter budget ${adapterPct.toFixed(0)}% of ${PROFILE.power.adapterW} W`,
        detail: `≈ ${systemDrawW!.toFixed(0)} W: CPU ${pkgW!.toFixed(0)} + GPU ${gpuW.toFixed(0)} + rest ~${restW.toFixed(0)}${chargeW ? ` + charging ${chargeW.toFixed(0)}` : ''} W${systemDrawSource === 'learned' ? ' (rest learned on battery)' : ''}.`, value: systemDrawW!, max: PROFILE.power.adapterW, unit: 'W' });
    }
    if (nosActive) add({ id: 'nos', category: 'Power', level: 'warn', title: `NOS battery boost active (−${bat!.dischargeRateW.toFixed(0)} W)`, detail: `On AC but drawing from the battery; PL1 drops to 45 W at ${PROFILE.power.nosThresholdPct}% charge.` });
    if (bat && !bat.online) add({ id: 'on-battery', category: 'Power', level: 'info', title: `On battery — ${bat.dischargeRateW.toFixed(1)} W draw`, detail: `PL4 is capped at 65–85 W on battery; GPU limited.` });

    if (optimusBypass === 'laptop-on') add({ id: 'optimus', category: 'Display', level: 'warn', title: 'Laptop screen is on next to the ultrawide', detail: 'Windows keeps polling the Intel iGPU (Optimus). Turning it off gives +8–15% 1% lows and 1.5–3 ms lower latency.', tip: 'Win + P → "Second screen only" before gaming.' });
    else if (optimusBypass === 'bypassed') add({ id: 'optimus', category: 'Display', level: 'ok', title: 'Optimus bypassed — direct RTX 2060 path', detail: 'Only the AW3425DWM is active, wired straight to the GPU.' });
    if (nv && linkPct != null) {
      add({ id: 'link', category: 'Display', level: 'ok', title: `DP link ${linkPct.toFixed(0)}% of HBR3 (8-bit)`, detail: `${nv.w}×${nv.h} @ ${nv.hz} Hz needs ${linkGbps(nv.w, nv.h, nv.hz, 8).toFixed(2)} Gbps of 25.92 Gbps. 10-bit HDR ${linkNeedsDsc ? 'uses DSC 1.2a (→ 9.52 Gbps)' : 'fits uncompressed'}.`, value: linkPct, max: 100, unit: '%' });
      if (nv.w === PROFILE.display.width && nv.hz < PROFILE.display.maxHz - 1) add({ id: 'refresh', category: 'Display', level: 'warn', title: `Ultrawide at ${nv.hz} Hz (max 180)`, detail: 'Use the Mini-DP port and set 180 Hz in NVIDIA Control Panel.' });
    }

    if (tick) {
      const memPct = (tick.mem.used / tick.mem.total) * 100;
      add({ id: 'ram', category: 'Memory', level: memPct >= T.ramWarn ? 'warn' : 'ok', title: `RAM ${memPct.toFixed(0)}% in use`, detail: `${(tick.mem.used / 2 ** 30).toFixed(1)} of ${(tick.mem.total / 2 ** 30).toFixed(1)} GB · committed ${(tick.mem.commit / 2 ** 30).toFixed(1)} GB.`, value: memPct, max: 100, unit: '%' });
    }
    if (stat && stat.memory.modules.length < 2) add({ id: 'single-channel', category: 'Memory', level: 'warn', title: 'Single-channel RAM', detail: 'Costs 15–28% in 1% lows. Add a matching SO-DIMM.' });
    for (const v of slow?.volumes ?? []) {
      const freePct = (v.free / v.size) * 100;
      if (freePct < T.diskFreeWarnPct * 2) add({ id: `vol-${v.letter}`, category: 'Storage', level: freePct < T.diskFreeWarnPct ? 'warn' : 'info', title: `${v.letter}: ${freePct.toFixed(0)}% free`, detail: `${(v.free / 2 ** 30).toFixed(1)} GB left of ${(v.size / 2 ** 30).toFixed(0)} GB${v.label ? ` (${v.label})` : ''}.` });
    }
    if (slow?.battery.fullWh) {
      const health = (slow.battery.fullWh / PROFILE.power.batteryDesignWh) * 100;
      add({ id: 'battery-health', category: 'Battery', level: 100 - health >= T.batteryWearWarn ? 'warn' : 'ok', title: `Battery health ${health.toFixed(0)}%`, detail: `Holds ${slow.battery.fullWh.toFixed(1)} Wh of ${PROFILE.power.batteryDesignWh} Wh new.`, value: health, max: 100, unit: '%' });
    }
    if (stat && !stat.admin) add({ id: 'admin', category: 'App', level: 'info', title: 'Limited sensor mode', detail: 'CPU core temperatures, fan modes and PredatorSense data need admin.', tip: 'Settings → Sensors → "Restart with full sensors".' });
    else if (stat && !stat.caps.lhm) add({ id: 'lhm', category: 'App', level: 'info', title: 'LibreHardwareMonitor not set up', detail: 'Per-core temperatures, voltages and fan RPM need it.', tip: 'Settings → Sensors → "Set up LibreHardwareMonitor".' });

    // Health score: start at 100, subtract for warnings
    const healthScore = Math.max(0, 100 - out.reduce((acc, i) => acc + (i.level === 'crit' ? 20 : i.level === 'warn' ? 7 : 0), 0));

    return {
      insights: out,
      derived: { psMode, pl1EffW, plState, tauEwmaW: this.ewmaW, tauLeftS, systemDrawW, systemDrawSource, restW, adapterPct, nosActive, optimusBypass, linkPct, linkNeedsDsc, cpuTempC, cpuTempSource, healthScore, sessionActive: session.active, sessionS: session.seconds },
    };
  }
}
