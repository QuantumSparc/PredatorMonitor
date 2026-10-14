# Third-party notices

Predator Monitor — developed by QuantumSparc Technologies (https://quantumsparc.com/).

The installer ships these unmodified third-party components in `resources/agent/lhm/`. Each remains under
its own licence. Source code for the MPL-2.0 components is available from the project URLs below.

| Component | Version | Licence | Project |
|---|---|---|---|
| LibreHardwareMonitorLib | 0.9.6 | MPL-2.0 | https://github.com/LibreHardwareMonitor/LibreHardwareMonitor |
| DiskInfoToolkit | 1.1.2 | MPL-2.0 | https://github.com/Blacktempel/DiskInfoToolkit |
| RAMSPDToolkit-NDD | 1.4.2 | MPL-2.0 | https://github.com/Blacktempel/RAMSPDToolkit |
| BlackSharp.Core | 1.0.7 | MPL-2.0 | https://github.com/Blacktempel/BlackSharp |
| HidSharp | 2.6.4 | Apache-2.0 (LICENSE.txt in the NuGet package) | https://software.seekye.com/hidsharp |
| System.IO.Ports | 10.0.3 | MIT | https://dot.net/ |
| System.Threading.AccessControl | 10.0.3 | MIT | https://dot.net/ |

Bundled into the app itself:

| Component | Licence | Project |
|---|---|---|
| Electron (Chromium, Node.js) | MIT (+ Chromium licences, see `LICENSES.chromium.html` next to the exe) | https://www.electronjs.org/ |
| uPlot | MIT | https://github.com/leeoniya/uPlot |

Not bundled, used if present on the system: PowerShell 7 (`pwsh`), NVIDIA `nvidia-smi`, the PawnIO driver
(required by LibreHardwareMonitor for CPU sensors; install it separately with `winget install namazso.PawnIO`).

MPL-2.0 text: https://www.mozilla.org/MPL/2.0/ · Apache-2.0 text: https://www.apache.org/licenses/LICENSE-2.0 ·
MIT text: https://opensource.org/license/mit
