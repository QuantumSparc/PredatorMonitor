# Changelog

All notable changes to Predator Monitor are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-10-14

First public release.

### Added

**Machine-aware insights**
- Insights engine that judges every reading against this laptop's own limits: PL1 / PL2 / Tau power-limit model with
  an estimate of remaining boost time, PROCHOT (92 °C) headroom, Thermal Velocity Boost availability, PredatorSense
  mode (Normal / Fast / Turbo) from the GPU power limit, 230 W adapter budget, NOS battery-assist detection,
  Optimus-bypass check and DisplayPort HBR3 link budget.
- Health score that summarises every check, with severity filters on the Insights page.
- Spike-proof thermal judgement: 5-second median, hysteresis on every threshold and debounced throttling events
  (3 s to start, 15 s to end, with duration and peak temperature).

**Pages**
- **Overview** — machine health plus CPU, GPU, system power, cooling, memory, temperatures, battery, storage, network
  and display tiles. CPU, GPU and power tiles show 60 s min / avg / max and the session peak for load, clock,
  temperature and power. Every tile opens its detail page.
- **Processor** — per-thread load and effective clock, package power against PL1 / PL2, power-limit model.
- **Graphics** — full nvidia-smi telemetry: load, power vs enforced limit, clocks, temperature, P-state, throttle
  reasons, PCIe link, encoder, PredatorSense VBIOS tiers.
- **Memory**, **Storage** and **Network** — usage breakdown, per-drive throughput / IOPS / latency, per-adapter
  throughput and Wi-Fi link.
- **Power & Battery** — "where the power goes" split (CPU cores, uncore, iGPU, DRAM, RTX 2060, rest of system,
  charging) and a tile per component with live watts, share, limit, 60 s range, session peak and energy used; RAPL
  rails; GPU power limits; session energy; battery state and wear trend; every voltage, current and power sensor.
- **Thermals & Fans** — PredatorSense-style animated fans that spin at the real RPM from Acer's embedded controller,
  fan modes, temperature and fan-speed history, and a searchable browser for all LibreHardwareMonitor sensors.
- **Displays** — DisplayPort 1.4 link maths, outputs, Optimus path, monitor and panel details.
- **System** — machine, firmware, Windows, processor, graphics and app status.
- **Processes** — top processes by CPU, GPU and memory, with per-app GPU usage and GPU memory.
- **Gaming sessions** — detected automatically from sustained GPU load, with power, temperatures, clocks and seconds
  throttled per session, tagged with the game.
- **History** — per-minute rollups (average or peak) for 1 h to 30 days, drag to zoom.
- **Events** — day-grouped timeline with filters and grouping of repeats.

**Sensors**
- PowerShell 7 sensor agent: Windows performance counters (including Intel RAPL power without admin), CIM/WMI,
  per-process GPU engines, streaming nvidia-smi.
- With admin: read-only Acer gaming WMI (fan RPM, fan modes, EC temperatures, GPU overclock tier, Turbo LED) and
  LibreHardwareMonitor (144 sensors on the PH315-53, including per-core temperatures and voltages).
- System power is measured from the battery discharge rate when running on battery; the draw of parts software can't
  meter (screen, fans, chipset, SSDs) is learned from it and used for the estimate on AC.

**Customisation**
- 6 themes × 14 accent colours, window material (acrylic / mica / solid), translucency, density, text size,
  collapsible sidebar, animation level and speed, chart span, sample rate, °C / °F.
- Show, hide and reorder the Overview tiles.
- Every alert threshold, Windows notifications and sound, tray tooltip content, start with Windows, start minimised,
  close to tray, always on top.
- Command palette (Ctrl + K) and keyboard shortcuts (Ctrl + 1–9, Ctrl + B).
- Export history, events and sessions to JSON or CSV.

**Windows integration**
- Installer (per-user, no admin needed) and portable exe.
- Notifications and the tray show the app's own name and icon.
- One-click "Install PowerShell 7" when it is missing; sensors start automatically once it is installed.

**Reliability**
- Crash-safe settings (temp file, backup, atomic rename) with automatic fallback to the last good copy.
- The sensor agent exits on its own when the app closes — nothing is left running in the background.
- Missing NVIDIA driver or Acer WMI is handled quietly.

[0.1.0]: https://github.com/QuantumSparc/PredatorMonitor/releases/tag/v0.1.0
