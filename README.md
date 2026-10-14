# Predator Monitor

A machine-aware hardware monitor for the **Acer Predator Helios 300 (PH315-53)** with an **Alienware AW3425DWM** ultrawide.
Instead of just showing numbers, it compares every live reading with this exact machine's limits — PL1/PL2/Tau, the 92 °C
PROCHOT point, PredatorSense TGP tiers, the 230 W adapter budget, the DisplayPort HBR3 link — and tells you what it means.

Electron + TypeScript desktop app · PowerShell 7 sensor agent · Catppuccin-themed glass UI.

**Developed by [QuantumSparc Technologies](https://quantumsparc.com/).**

---

## What makes it different

| Feature | How |
|---|---|
| **PL1 / PL2 / Tau power-limit model** | Live CPU package power from Intel RAPL (no admin), an EWMA with Intel's Tau to estimate how much PL2 boost is left, and detection of the EC lowering PL1 to 45–56 W when the GPU draws > 40 W |
| **PredatorSense mode detection** | Normal / Fast / Turbo inferred from the GPU power limit the VBIOS enforces; with admin also the Acer thermal profile, fan modes, overclock tier and Turbo LED (read-only Acer WMI) |
| **PROCHOT & TVB meter** | Headroom to 92 °C and whether 5.0 GHz Thermal Velocity Boost (≤ 65 °C) is currently possible |
| **Optimus-bypass check** | Warns when the laptop panel is on next to the ultrawide (costs 8–15 % 1 % lows) |
| **DisplayPort link budget** | % of HBR3 your current mode uses and whether 10-bit needs DSC |
| **Adapter budget & NOS detection** | Estimated system draw vs the 230 W Delta brick; flags when the battery is assisting on AC |
| **Battery wear trend** | Full-charge capacity logged daily, with a projected date for 50 % |
| **Per-app GPU** | GPU % (and engine) and GPU memory per process, from Windows GPU-engine counters |
| **Gaming sessions** | Auto-detected from sustained GPU load; avg/max power, temps, clocks and seconds throttled per session, tagged with the game |
| **PredatorSense fan view** | Animated CPU/GPU fans that spin with the real RPM from Acer's EC (same readings PredatorSense shows), fan-mode chips (Auto / Max / Custom), % of max |
| **Spike-proof thermal judgement** | Levels use a 5-second median plus 3 °C hysteresis; PROCHOT is only claimed from a real CPU sensor or actual firmware throttling |
| **Per-component power** | Live split of system draw into CPU cores, uncore, iGPU, DRAM, RTX 2060, rest (estimate) and charging — each with share, limit, 60 s min/avg/max, session peak and energy used; plus every LHM voltage, current and power sensor |
| **Health score** | One number summarising all checks |
| **Min / avg / max / peak** | Overview CPU, GPU and power tiles show the last 60 s range plus the session peak for load, clock, temperature and power |

Plus everything a monitor should have: per-thread load and clocks, RAPL rails (package, cores, iGPU, DRAM), full nvidia-smi
telemetry, memory breakdown, per-disk throughput / IOPS / latency / active time, per-adapter network throughput, Wi-Fi link,
battery rate/voltage/time-left, every LibreHardwareMonitor sensor, displays with EDID, firmware & security state, processes,
history (1 h – 30 d), events timeline, Windows notifications and a tray icon.

---

## Customisation

Everything in **Settings** applies instantly:

- 6 themes (Catppuccin Mocha / Macchiato / Frappé / Latte, Midnight, Predator) × 14 accent colours
- Window material (acrylic / mica / solid), panel translucency, density, text size, collapsible sidebar
- Animations (full / reduced / off) and animation speed, live-chart span, sensor sample rate
- °C / °F, history retention, gaming-session threshold, dashboard tiles
- Start with Windows, start minimised, close to tray, always on top, tray tooltip content
- Notifications, sound, and every alert threshold (CPU, GPU, board zone, RAM, VRAM, disk space, battery wear)
- Export history / events / sessions to JSON or CSV

**Ctrl + K** opens a command palette for every view, theme and action. **Ctrl + 1–9** jumps to views, **Ctrl + B** collapses the sidebar.

---

## Run

Requirements: Windows 10/11, Node.js 20+, PowerShell 7 (`pwsh`), NVIDIA driver (for `nvidia-smi`).

```powershell
npm install
npm start            # builds and opens the app
```

Or double-click **`start.cmd`** (`start.cmd admin` starts with full sensors).

### Full sensors (optional)

Without admin the app already shows CPU load/clocks/RAPL power, the board thermal zone, the GPU, memory, disks, network,
battery and per-app GPU. With admin it also reads:

- **Acer gaming WMI** — PredatorSense profile, fan modes and speeds, overclock tier, Turbo LED (read-only `Get*` calls)
- **LibreHardwareMonitor** — CPU core temperatures, voltages, clocks, and more. Set it up from **Settings → Sensors → Set up**
  (downloads LibreHardwareMonitorLib 0.9.6, MPL-2.0, from nuget.org into `agent/lhm/`). CPU sensors also need the signed
  **PawnIO** driver, installed once as admin: `winget install namazso.PawnIO`.

Then use **Settings → Sensors → Restart with full sensors** (or `start.cmd admin`).

Verified on the PH315-53: Acer's EC reports CPU / GPU / board temperatures and **CPU + GPU fan RPM** (sensor mask 0x0227),
fan modes and the GPU overclock tier; the thermal-profile setting is not reported by this model. LibreHardwareMonitor adds
144 sensors (per-core temperatures and voltages, GPU hot spot, DRAM SPD, battery). To see what any machine exposes, run
`Start-Process pwsh -Verb RunAs -ArgumentList '-NoProfile','-File','agent\diagnose.ps1'` — it writes a report to
`%TEMP%\predator-monitor-diag.txt` using read-only calls.

### Notifications

On first start the app creates a Start Menu shortcut ("Predator Monitor") carrying its AppUserModelID and registers that ID (name + icon) under `HKCU\Software\Classes\AppUserModelId` — Windows needs both to
label toasts with the app's name and icon instead of "Electron". **Settings → Alerts → Send test notification** checks it.

---

## Install (packaged build)

`npm run dist` builds two files into `release/`:

| File | What it is |
|---|---|
| `Predator-Monitor-Setup-<version>.exe` | Installer — per-user (no admin needed to install), lets you pick the folder, adds Start Menu + desktop shortcuts and an uninstaller. Your data in `%APPDATA%\Predator Monitor` is kept on uninstall. |
| `Predator-Monitor-<version>-portable.exe` | Single file, no install. Unpacks to a temp folder on each run (slower start). |

The exe is named **Predator Monitor** (company QuantumSparc Technologies), so UAC, Task Manager and notifications all show
that name. The sensor agent, LibreHardwareMonitor DLLs and icons ship as plain files in `resources/` next to `app.asar`.
`npm run pack` builds only the unpacked folder (`release/win-unpacked/`) for a quick test.

The builds are **not code-signed**, so Windows SmartScreen shows "Windows protected your PC" on first run →
*More info* → *Run anyway*. Still required on the machine: PowerShell 7, the NVIDIA driver, and (for CPU sensors) PawnIO.
Third-party licences: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

---

## Architecture

```
agent/agent.ps1      PowerShell 7 sensor agent — streams NDJSON: static · tick (1 s) · procs (3 s) · slow (15 s) · lhmMeta
                     sources: performance counters (CPU, RAPL, memory, disks, network, thermal zone, GPU engines),
                     CIM/WMI (battery, volumes, adapters, displays, EDID), Acer gaming WMI, LibreHardwareMonitor
                     self-test:  pwsh -File agent/agent.ps1 -SelfTest
agent/setup-lhm.ps1  downloads LibreHardwareMonitorLib + dependencies
src/shared/          profile.ts (machine limits from the dossier) · types.ts (all message shapes + settings)
src/main/            sensors.ts (agent + streaming nvidia-smi) · insights.ts (rules engine) · store.ts (history, events,
                     sessions, settings) · main.ts (window, tray, alerts, IPC)
src/preload/         the only bridge between UI and system
src/renderer/        app.ts (shell, router, palette) · ui.ts (gauges, 60 fps charts, tables) · views-*.ts · styles.css
scripts/             make-icons.py · shot.mjs (dev screenshots over DevTools)
```

Data lives in `%APPDATA%\predator-monitor\data` (history per day, events, sessions, battery log, settings).

## Develop

```powershell
npm run dev          # esbuild watch
npm run typecheck
npx electron . --remote-debugging-port=9333 ; node scripts/shot.mjs shot.png '#cpu'
```

Machine limits and specs come from the *Master Technical Dossier* PDF and are labelled as such in the UI; they are not measured.
