<div align="center">

<img src="assets/icon.png" width="96" alt="Predator Monitor" />

# Predator Monitor

**A hardware monitor that knows your laptop.**
Built for the Acer Predator Helios 300 (PH315-53) and an Alienware AW3425DWM ultrawide, it judges every live reading
against this exact machine's limits — and tells you what it means.

![Windows 10/11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D6?logo=windows&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)
![PowerShell 7](https://img.shields.io/badge/PowerShell-7-5391FE?logo=powershell&logoColor=white)
[![Release](https://img.shields.io/github/v/release/QuantumSparc/PredatorMonitor?color=cba6f7)](https://github.com/QuantumSparc/PredatorMonitor/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/QuantumSparc/PredatorMonitor/total?color=a6e3a1)](https://github.com/QuantumSparc/PredatorMonitor/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-89b4fa)](LICENSE)

<a href="https://quantumsparc.com/"><img src="assets/quantumsparc-mark.png" width="22" align="center" alt="" /></a>
Developed by **[QuantumSparc Technologies](https://quantumsparc.com/)**

**[⬇ Download the latest release](https://github.com/QuantumSparc/PredatorMonitor/releases/latest)**

</div>

![Overview](docs/screenshots/overview.png)

---

## Contents

- [Why another monitor?](#why-another-monitor)
- [Screenshots](#screenshots)
- [Features](#features)
- [Install](#install)
- [Full sensors (admin)](#full-sensors-admin)
- [Customisation](#customisation)
- [Build from source](#build-from-source)
- [How it works](#how-it-works)
- [Privacy & safety](#privacy--safety)
- [Troubleshooting](#troubleshooting)
- [Changelog](CHANGELOG.md)
- [Credits & licences](#credits--licences)

---

## Why another monitor?

Most monitors show numbers. Predator Monitor knows what the numbers *mean on this laptop*:

| Insight | How it works |
|---|---|
| **PL1 / PL2 / Tau power-limit model** | Live CPU package power from Intel RAPL (no admin), an EWMA with Intel's Tau to estimate how much PL2 boost is left, and detection of the EC lowering PL1 to 45–56 W when the GPU draws > 40 W |
| **PredatorSense mode detection** | Normal / Fast / Turbo inferred from the GPU power limit the VBIOS enforces; with admin also fan modes, overclock tier and the Turbo LED (read-only Acer WMI) |
| **PROCHOT & TVB headroom** | Distance to the 92 °C throttle point and whether 5.0 GHz Thermal Velocity Boost (≤ 65 °C) is possible right now |
| **Spike-proof thermal judgement** | 5-second median, hysteresis and debounced events — a CPU hovering at a threshold produces one event, not a toast every few seconds |
| **Where the power goes** | System draw split into CPU cores, uncore, iGPU, DRAM, RTX 2060, rest of system and charging. On battery the total is *measured* from the discharge rate, and the "rest of system" figure is learned from it |
| **Adapter budget & NOS detection** | System draw against the 230 W Delta adapter; flags when the battery has to help on AC |
| **Optimus-bypass check** | Warns when the laptop panel is on next to the ultrawide (costs 8–15 % in 1 % lows) |
| **DisplayPort link budget** | How much of HBR3 the current mode uses and whether 10-bit needs DSC |
| **Battery wear trend** | Full-charge capacity logged daily, with a projected date for 50 % |
| **Health score** | One number summarising every check |

Values that come from the machine's technical dossier (limits, specs) are labelled as such in the app — they are never
presented as measurements.

---

## Screenshots

| | |
|:---:|:---:|
| ![Overview tiles](docs/screenshots/overview-tiles.png) **Overview** — live tiles with 60 s min / avg / max and session peak | ![Insights](docs/screenshots/insights.png) **Insights** — every check, judged against this machine |
| ![Thermals & fans](docs/screenshots/thermals-fans.png) **Thermals & Fans** — PredatorSense-style fans spinning at the real EC RPM | ![Power](docs/screenshots/power.png) **Power & Battery** — where every watt goes |
| ![Power components](docs/screenshots/power-components.png) **Components** — watts, share, limit, range, peak and energy per part | ![Processor](docs/screenshots/processor.png) **Processor** — per-thread load and clocks, PL1/PL2 model |
| ![Graphics](docs/screenshots/graphics.png) **Graphics** — full nvidia-smi telemetry and VBIOS tiers | ![Sensors](docs/screenshots/sensors.png) **All hardware sensors** — 144 LibreHardwareMonitor sensors, searchable |
| ![Displays](docs/screenshots/displays.png) **Displays** — DP link budget, Optimus path, EDID | ![History](docs/screenshots/history.png) **History** — per-minute rollups, 1 h to 30 days |
| ![Events](docs/screenshots/events.png) **Events** — grouped timeline with filters | ![Settings](docs/screenshots/settings.png) **Settings** — themes, accents, layout, alerts |

<details>
<summary><b>Themes and the command palette</b></summary>

| | |
|:---:|:---:|
| ![Latte](docs/screenshots/theme-latte.png) Catppuccin Latte | ![Predator](docs/screenshots/theme-predator.png) Predator |
| ![Midnight](docs/screenshots/theme-midnight.png) Midnight | ![Command palette](docs/screenshots/palette.png) Command palette (Ctrl + K) |

</details>

---

## Features

**Monitor**
- **Overview** — machine health, CPU / GPU / system power tiles with 60 s min · avg · max and session peak (load, clock,
  temperature, power), animated fans, memory, temperatures, battery, storage, network and displays. Every tile opens its
  detail page.
- **Insights** — every live check with severity filters (critical, warnings, info, good).
- **Processes** — top processes by CPU, GPU and memory, with per-app GPU % / engine / GPU memory from Windows GPU-engine
  counters. Sortable and filterable.

**Hardware**
- **Processor** — per-thread load and effective clock, package power against PL1/PL2, power-limit model, TVB state.
- **Graphics** — load, power vs enforced limit, clocks, temperature, P-state, throttle reasons, PCIe link, encoder.
- **Memory** — usage breakdown (committed, cache, pools, page file), history, paging, module details.
- **Storage** — per-drive active time, throughput, IOPS, latency and queue, volumes, slot topology.
- **Network** — per-adapter throughput, IP / gateway / DNS, Wi-Fi link details.

**Machine**
- **Power & Battery** — live gauges, *where the power goes* bar, a tile per component (live W, share of system, limit,
  60 s range, session peak, energy used), RAPL rails, system draw vs adapter, GPU power limits, session energy, battery
  state and wear, every voltage / current / power sensor.
- **Thermals & Fans** — fan view with Auto / Max / Custom state, temperature and fan-speed history, PredatorSense data,
  thermal zone, and a searchable browser for all LibreHardwareMonitor sensors.
- **Displays** — DisplayPort 1.4 link maths, outputs, Optimus path, monitor and panel details.
- **System** — machine, firmware, Windows, processor, graphics and app status.

**Analyse**
- **Gaming sessions** — detected automatically from sustained GPU load; average / max power, temperatures, clocks and
  seconds spent throttling, tagged with the game.
- **History** — per-minute rollups (average or peak) for 1 h, 6 h, 24 h, 7 d or 30 d; drag to zoom.
- **Events** — day-grouped timeline of mode changes, throttling, power source changes and sessions, with filters and
  grouping of repeats.

**Everywhere** — Windows notifications for critical insights, tray icon with live tooltip, export to JSON or CSV,
command palette, keyboard shortcuts, °C / °F.

---

## Install

**Quick start**

1. Go to the **[latest release](https://github.com/QuantumSparc/PredatorMonitor/releases/latest)** and download
   `Predator-Monitor-Setup-0.1.0.exe` (or the portable exe).
2. Run it. If Windows shows *"Windows protected your PC"*, click **More info → Run anyway** (see below).
3. Open **Predator Monitor**. If PowerShell 7 isn't installed yet, click **Install PowerShell 7** on the Overview —
   sensors start by themselves when it finishes.
4. Optional: **Settings → Sensors → Restart with full sensors** for fan speeds and per-core temperatures.

Or build it yourself with `npm run dist` (see [Build from source](#build-from-source)).

| File | Use it when |
|---|---|
| `Predator-Monitor-Setup-<version>.exe` | You want a normal install. Per-user (no admin needed to install), lets you choose the folder, adds Start Menu and desktop shortcuts and an uninstaller. Your data is kept on uninstall. |
| `Predator-Monitor-<version>-portable.exe` | You want a single file and no install. It unpacks to a temp folder on each start, so it opens a little slower. |

**Requirements:** Windows 10 or 11 (x64) and [PowerShell 7](https://aka.ms/powershell) — the app offers to install
it for you. GPU data needs the NVIDIA driver (`nvidia-smi`); without an NVIDIA GPU the rest still works.

> **Made for the Acer Predator Helios 300 (PH315-53).** It runs on other Windows PCs too, but the limits, insights and
> PredatorSense data are tuned for that laptop, so some advice will not apply elsewhere.

> **"Windows protected your PC"** — the builds are not code-signed yet, so SmartScreen warns on first run.
> Click **More info → Run anyway**.

---

## Full sensors (admin)

Without admin the app already shows CPU load, clocks and RAPL power, the board thermal zone, the GPU, memory, disks,
network, battery and per-app GPU. Running as administrator adds:

- **Acer gaming WMI** — CPU and GPU fan RPM, fan modes, EC temperatures, GPU overclock tier and Turbo LED. Read-only:
  the app only calls `Get*` methods and never changes a setting.
- **LibreHardwareMonitor** — per-core temperatures and voltages, GPU hot spot, DRAM SPD timings, battery details and more
  (144 sensors on the PH315-53). CPU sensors need the signed **PawnIO** driver, installed once:

  ```powershell
  winget install namazso.PawnIO
  ```

Turn it on from **Settings → Sensors → Restart with full sensors** (one UAC prompt). The installer already contains
LibreHardwareMonitor; a source checkout downloads it with `npm run setup-sensors`.

To see what any machine exposes, run the read-only diagnostic as admin — it writes `%TEMP%\predator-monitor-diag.txt`:

```powershell
Start-Process pwsh -Verb RunAs -ArgumentList '-NoProfile','-File','agent\diagnose.ps1'
```

---

## Customisation

Everything in **Settings** applies instantly:

- **Look** — 6 themes (Catppuccin Mocha / Macchiato / Frappé / Latte, Midnight, Predator) × 14 accent colours, window
  material (acrylic / mica / solid), panel translucency, density, text size, collapsible sidebar
- **Motion** — animations full / reduced / off, animation speed, live-chart span, sensor sample rate (0.5–5 s)
- **Dashboard** — show, hide and reorder the Overview tiles
- **Units & data** — °C / °F, history retention, gaming-session threshold, export
- **Window** — start with Windows, start minimised, close to tray, always on top, tray tooltip content
- **Alerts** — Windows notifications, sound, and every threshold (CPU, GPU, board zone, RAM, VRAM, disk space, battery wear)

| Shortcut | Action |
|---|---|
| `Ctrl` + `K` | Command palette — every page, theme and action |
| `Ctrl` + `1` … `9` | Jump to a page |
| `Ctrl` + `B` | Collapse / expand the sidebar |
| `Esc` | Close the palette |

---

## Build from source

```powershell
git clone https://github.com/QuantumSparc/PredatorMonitor.git
cd PredatorMonitor
npm install
npm start                 # build and open the app
```

Or double-click **`start.cmd`** (`start.cmd admin` starts with full sensors).

| Script | What it does |
|---|---|
| `npm start` | Build and run |
| `npm run dev` | Rebuild on change (esbuild watch) |
| `npm run typecheck` | TypeScript check |
| `npm run setup-sensors` | Download LibreHardwareMonitor into `agent/lhm/` |
| `npm run pack` | Packaged app folder in `release/win-unpacked/` for a quick test |
| `npm run dist` | Installer and portable exe in `release/` |

Dev tools: start the app with `--remote-debugging-port=<port>`, then `node scripts/tour.mjs <dir>` screenshots every
page and reports errors, and `node scripts/readme-shots.mjs` regenerates the screenshots in this README.

---

## How it works

```mermaid
flowchart LR
  subgraph Sensors
    A["agent.ps1<br/>PowerShell 7"]
    N["nvidia-smi<br/>(streaming)"]
  end
  A -- "NDJSON: tick 1 s · procs 3 s · slow 15 s" --> M
  N --> M
  subgraph Main["Electron main process"]
    M["sensors.ts"] --> I["insights.ts<br/>rules engine"]
    I --> S["store.ts<br/>history · events · sessions"]
    I --> T["alerts · tray"]
  end
  I -- "snapshot (IPC)" --> R["Renderer<br/>views · 60 fps charts"]
```

| Part | Role |
|---|---|
| `agent/agent.ps1` | Sensor agent. Windows performance counters (CPU, Intel RAPL, memory, disks, network, thermal zone, GPU engines), CIM/WMI (battery, volumes, adapters, displays, EDID), Acer gaming WMI and LibreHardwareMonitor. Exits by itself if the app closes. Self-test: `pwsh -File agent/agent.ps1 -SelfTest` |
| `src/main/` | `sensors.ts` runs the agent and nvidia-smi · `insights.ts` turns readings into insights and derived values · `store.ts` keeps history, events, sessions and settings · `main.ts` window, tray, alerts, IPC |
| `src/shared/` | `profile.ts` — this machine's limits from the technical dossier · `types.ts` — every message and setting |
| `src/preload/` | The only bridge between the UI and the system |
| `src/renderer/` | Shell, router and palette (`app.ts`), components and the canvas chart engine (`ui.ts`), one file per page group |

Data lives in `%APPDATA%\Predator Monitor\data` — per-day history, events, sessions, battery log and settings.
Settings are written crash-safely (temp file, backup, atomic rename).

---

## Privacy & safety

- **Everything stays on your PC.** No telemetry, no accounts, no cloud. The only network access is downloading
  LibreHardwareMonitor from nuget.org when you choose *Set up / Reinstall*, and opening links you click.
- **Read-only hardware access.** Acer WMI is queried with `Get*` methods only; the app does not change fan, power or
  overclock settings.
- **No background leftovers.** The sensor agent exits when the app does.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| No CPU core temperatures or fan RPM | Run with full sensors (**Settings → Sensors**). CPU sensors also need PawnIO (`winget install namazso.PawnIO`). |
| "PowerShell 7 needed" | Click **Install PowerShell 7** on the Overview, or install it from [aka.ms/powershell](https://aka.ms/powershell). |
| "Sensor agent: stopped" | **Settings → Sensors → Restart agent**. If it keeps stopping, run the diagnostic below. |
| No GPU data | The NVIDIA driver provides `nvidia-smi`; check that `nvidia-smi` runs in a terminal. |
| SmartScreen blocks the installer | **More info → Run anyway** (the build is not code-signed). |
| Something else | Run `agent\diagnose.ps1` as admin and look at `%TEMP%\predator-monitor-diag.txt`. |

---

## Credits & licences

<a href="https://quantumsparc.com/"><img src="assets/quantumsparc-logo.png" width="120" alt="QuantumSparc Technologies" /></a>

Designed and developed by **[QuantumSparc Technologies](https://quantumsparc.com/)** · © 2026 QuantumSparc Technologies.
Released under the [MIT License](LICENSE). See the [changelog](CHANGELOG.md) for what's new.

Built with [Electron](https://www.electronjs.org/), [uPlot](https://github.com/leeoniya/uPlot) and
[LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor). Bundled third-party components and
their licences are listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Acer, Predator, PredatorSense, Alienware, NVIDIA, GeForce and Intel are trademarks of their respective owners. This
project is not affiliated with or endorsed by them.
