<#
  Predator Monitor — sensor agent.

  A long-running PowerShell 7 process that streams one JSON object per line on stdout:
    {"type":"static", ...}   once at start: machine identity, capabilities
    {"type":"tick",   ...}   every -IntervalMs: fast-changing sensors
    {"type":"procs",  ...}   every 3 s: top processes with CPU / RAM / GPU per app
    {"type":"slow",   ...}   every 15 s: volumes, adapters, battery capacity, displays
    {"type":"lhmMeta",...}   when LibreHardwareMonitor sensors are (re)discovered
    {"type":"log",    ...}   diagnostics

  Without admin: Windows performance counters (incl. Intel RAPL power), CIM/WMI.
  With admin:    + Acer gaming WMI (PredatorSense data, read-only Get* calls only)
                 + LibreHardwareMonitor (CPU core temps, voltages, fans) if agent/lhm/ is set up.

  GPU (NVIDIA) is read by the app itself through `nvidia-smi -lms`, not here.
#>
param(
    [int]$IntervalMs = 1000,
    [int]$ParentPid = 0,   # exit when this process (the app) is gone, so a force-closed app leaves no orphan agent
    [string]$LhmDir = (Join-Path $PSScriptRoot 'lhm'),
    [switch]$SelfTest   # run every collector once with strict errors and report, then exit
)

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$out = [Console]::Out

function Emit($obj) {
    $out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 8))
    $out.Flush()
}
function Log($level, $msg) { Emit @{ type = 'log'; level = $level; msg = "$msg" } }
function NowMs { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
function Rnd($v, $d = 1) { if ($null -eq $v) { return $null }; [Math]::Round([double]$v, $d) }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# ════════════════════════════════════════════════════════════════
#  Performance counters (created once; reading them is cheap)
# ════════════════════════════════════════════════════════════════
function PC($cat, $counter, $inst) {
    try { $c = [Diagnostics.PerformanceCounter]::new($cat, $counter, $inst, $true); [void]$c.NextValue(); $c } catch { $null }
}
function Val($c) { if ($c) { try { $c.NextValue() } catch { $null } } }

$cores = @([Diagnostics.PerformanceCounterCategory]::new('Processor Information').GetInstanceNames() | Where-Object { $_ -match '^\d+,\d+$' } | Sort-Object { [int]($_ -split ',')[1] })
$pc = @{
    cpuUtil  = PC 'Processor Information' '% Processor Utility' '_Total'
    cpuPerf  = PC 'Processor Information' '% Processor Performance' '_Total'
    cpuPriv  = PC 'Processor Information' '% Privileged Time' '_Total'
    cpuIntr  = PC 'Processor Information' '% Interrupt Time' '_Total'
    cpuDpc   = PC 'Processor Information' '% DPC Time' '_Total'
    ctxSw    = PC 'System' 'Context Switches/sec' ''
    procQ    = PC 'System' 'Processor Queue Length' ''
    threads  = PC 'System' 'Threads' ''
    procsN   = PC 'System' 'Processes' ''
    memAvail = PC 'Memory' 'Available Bytes' ''
    memCommit = PC 'Memory' 'Committed Bytes' ''
    memCommitLimit = PC 'Memory' 'Commit Limit' ''
    memCache = PC 'Memory' 'Cache Bytes' ''
    memPagedPool = PC 'Memory' 'Pool Paged Bytes' ''
    memNonPaged = PC 'Memory' 'Pool Nonpaged Bytes' ''
    pageFaults = PC 'Memory' 'Page Faults/sec' ''
    pagesIn  = PC 'Memory' 'Pages Input/sec' ''
    compressed = PC 'Memory' 'Compressed Bytes' ''
    pagefile = PC 'Paging File' '% Usage' '_Total'
    tzTemp   = PC 'Thermal Zone Information' 'Temperature' '\_TZ.TZ00'
    tzPassive = PC 'Thermal Zone Information' '% Passive Limit' '\_TZ.TZ00'
    tzReasons = PC 'Thermal Zone Information' 'Throttle Reasons' '\_TZ.TZ00'
    raplPkg  = PC 'Energy Meter' 'Power' 'RAPL_Package0_PKG'
    raplCore = PC 'Energy Meter' 'Power' 'RAPL_Package0_PP0'
    raplGfx  = PC 'Energy Meter' 'Power' 'RAPL_Package0_PP1'
    raplDram = PC 'Energy Meter' 'Power' 'RAPL_Package0_DRAM'
    powerMeter = PC 'Power Meter' 'Power' 'Power Meter (0)'
}
$coreUtil = @($cores | ForEach-Object { PC 'Processor Information' '% Processor Utility' $_ })
$corePerf = @($cores | ForEach-Object { PC 'Processor Information' '% Processor Performance' $_ })

$diskNames = @([Diagnostics.PerformanceCounterCategory]::new('PhysicalDisk').GetInstanceNames() | Where-Object { $_ -ne '_Total' } | Sort-Object)
$disks = @($diskNames | ForEach-Object {
    [pscustomobject]@{ name = $_; read = (PC 'PhysicalDisk' 'Disk Read Bytes/sec' $_); write = (PC 'PhysicalDisk' 'Disk Write Bytes/sec' $_)
        idle = (PC 'PhysicalDisk' '% Idle Time' $_); queue = (PC 'PhysicalDisk' 'Current Disk Queue Length' $_)
        rlat = (PC 'PhysicalDisk' 'Avg. Disk sec/Read' $_); wlat = (PC 'PhysicalDisk' 'Avg. Disk sec/Write' $_)
        riops = (PC 'PhysicalDisk' 'Disk Reads/sec' $_); wiops = (PC 'PhysicalDisk' 'Disk Writes/sec' $_) }
})
$nicNames = @([Diagnostics.PerformanceCounterCategory]::new('Network Interface').GetInstanceNames())
$nics = @($nicNames | ForEach-Object {
    [pscustomobject]@{ name = $_; rx = (PC 'Network Interface' 'Bytes Received/sec' $_); tx = (PC 'Network Interface' 'Bytes Sent/sec' $_)
        bw = (PC 'Network Interface' 'Current Bandwidth' $_); errs = (PC 'Network Interface' 'Packets Received Errors' $_) }
})

# ════════════════════════════════════════════════════════════════
#  Static facts (once)
# ════════════════════════════════════════════════════════════════
$cs = Get-CimInstance Win32_ComputerSystem
$os = Get-CimInstance Win32_OperatingSystem
$bios = Get-CimInstance Win32_BIOS
$board = Get-CimInstance Win32_BaseBoard
$cpu = Get-CimInstance Win32_Processor
$cv = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
$mods = @(Get-CimInstance Win32_PhysicalMemory)
$baseMHz = [double]$cpu.MaxClockSpeed
$totalMem = [double]$cs.TotalPhysicalMemory

$monitors = @(Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID | ForEach-Object {
    $sz = Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorBasicDisplayParams | Where-Object InstanceName -eq $_.InstanceName
    [ordered]@{
        maker = (($_.ManufacturerName | Where-Object { $_ }) | ForEach-Object { [char]$_ }) -join ''
        model = (($_.UserFriendlyName | Where-Object { $_ }) | ForEach-Object { [char]$_ }) -join ''
        product = (($_.ProductCodeID | Where-Object { $_ }) | ForEach-Object { [char]$_ }) -join ''
        year = $_.YearOfManufacture; week = $_.WeekOfManufacture
        widthCm = $sz.MaxHorizontalImageSize; heightCm = $sz.MaxVerticalImageSize; instance = $_.InstanceName
    }
})
$storageNs = 'root\Microsoft\Windows\Storage'
$physDisks = @(Get-CimInstance -Namespace $storageNs -ClassName MSFT_PhysicalDisk | ForEach-Object {
    [ordered]@{ id = [int]$_.DeviceId; model = $_.FriendlyName; sizeBytes = [double]$_.Size; mediaType = [int]$_.MediaType; busType = [int]$_.BusType; firmware = $_.FirmwareVersion; health = [int]$_.HealthStatus; serialHash = ("$($_.SerialNumber)".GetHashCode()) }
})
$sb = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\State').UEFISecureBootEnabled
$dg = Get-CimInstance -Namespace root\Microsoft\Windows\DeviceGuard -ClassName Win32_DeviceGuard

# ════════════════════════════════════════════════════════════════
#  Acer gaming WMI — what PredatorSense reads (admin, Get* only)
#  Layout from the Linux acer-wmi driver; PH315-53 = turbo + CPU/GPU fan quirk.
# ════════════════════════════════════════════════════════════════
$acer = $null
if ($isAdmin) {
    $acer = Get-CimInstance -Namespace root\wmi -ClassName AcerGamingFunction | Select-Object -First 1
    if (-not $acer) { Log 'info' 'Acer gaming WMI not available' }
}
function AcerGet($method, [uint32]$arg) {
    if (-not $acer) { return $null }
    try {
        $r = Invoke-CimMethod -InputObject $acer -MethodName $method -Arguments @{ gmInput = $arg } -ErrorAction Stop
        [uint64]$r.gmOutput
    } catch { $null }
}
function AcerGetNoInput($method) {
    if (-not $acer) { return $null }
    try { Invoke-CimMethod -InputObject $acer -MethodName $method -ErrorAction Stop } catch { $null }
}
$fanModeNames = @{ 0 = 'Unknown'; 1 = 'Auto'; 2 = 'Max (CoolBoost)'; 3 = 'Custom' }
$profileNames = @{ 0 = 'Quiet'; 1 = 'Balanced'; 4 = 'Performance'; 5 = 'Turbo'; 6 = 'Eco' }
$sysInfoSupported = $null
function ReadAcer {
    if (-not $acer) { return $null }
    $o = [ordered]@{}
    # Fan behaviour: bitmap CPU(bit0)|GPU(bit3); CPU mode bits 9:8, GPU mode bits 15:14
    $fb = AcerGet 'GetGamingFanBehavior' 0x9
    if ($null -ne $fb -and ($fb -band 0xFF) -eq 0) {
        $o.cpuFanMode = $fanModeNames[[int](($fb -shr 8) -band 0x3)]
        $o.gpuFanMode = $fanModeNames[[int](($fb -shr 14) -band 0x3)]
    }
    # Fan speed setting (%): fan id CPU=1, GPU=4; value bits 15:8
    foreach ($f in @(@('cpuFanPct', 1), @('gpuFanPct', 4))) {
        $r = AcerGet 'GetGamingFanSpeed' $f[1]
        if ($null -ne $r -and ($r -band 0xFF) -eq 0) { $o[$f[0]] = [int](($r -shr 8) -band 0xFF) }
    }
    # Misc settings: index in bits 7:0 → value bits 15:8
    foreach ($m in @(@('oc1', 0x05), @('oc2', 0x07), @('platformProfileRaw', 0x0B))) {
        $r = AcerGet 'GetGamingMiscSetting' $m[1]
        if ($null -ne $r -and ($r -band 0xFF) -eq 0) { $o[$m[0]] = [int](($r -shr 8) -band 0xFF) }
    }
    if ($null -ne $o.platformProfileRaw) { $o.platformProfile = $profileNames[$o.platformProfileRaw] }
    if ($null -ne $o.oc1) { $o.gpuOverclock = if ($o.oc1 -eq 2 -or $o.oc2 -eq 2) { 'Turbo' } else { 'Normal' } }
    # Turbo LED state (input 0x1)
    $led = AcerGet 'GetGamingLED' 0x1
    if ($null -ne $led) { $o.turboLedRaw = $led; $o.turboLed = (($led -shr 16) -band 0x1) -eq 1 }
    # Predator v4 sensor readings (CPU temp 0x01, CPU fan RPM 0x02, ext temp 0x03, GPU fan RPM 0x06, GPU temp 0x0A)
    if ($null -eq $script:sysInfoSupported) {
        $sup = AcerGet 'GetGamingSysInfo' 0x0000
        $script:sysInfoSupported = if ($null -ne $sup -and ($sup -band 0xFF) -eq 0) { [int](($sup -shr 24) -band 0xFFFF) } else { 0 }
    }
    if ($script:sysInfoSupported) {
        foreach ($s in @(@('cpuTempC', 0x01, 'temp'), @('cpuFanRpm', 0x02, 'fan'), @('extTempC', 0x03, 'temp'), @('gpuFanRpm', 0x06, 'fan'), @('gpuTempC', 0x0A, 'temp'))) {
            if (-not ($script:sysInfoSupported -band (1 -shl ($s[1] - 1)))) { continue }
            $r = AcerGet 'GetGamingSysInfo' ([uint32](0x0001 -bor ($s[1] -shl 8)))
            if ($null -ne $r -and ($r -band 0xFF) -eq 0) { $o[$s[0]] = [int](($r -shr 8) -band 0xFFFF) }
        }
    }
    $o.sysInfoSupportedMask = $script:sysInfoSupported
    $o
}
function ReadAcerSlow {
    if (-not $acer) { return $null }
    $o = [ordered]@{}
    $kb = AcerGetNoInput 'GetGamingKBBacklight'
    if ($kb) { $o.kbBacklightBytes = @($kb.gmOutput); $o.kbReturn = $kb.gmReturn }
    $ft = AcerGetNoInput 'GetGamingFanTable'
    if ($ft) { $o.fanTableRaw = "$($ft.gmOutput)" }
    $o
}

# ════════════════════════════════════════════════════════════════
#  LibreHardwareMonitor (admin + agent/lhm/*.dll + PawnIO driver)
# ════════════════════════════════════════════════════════════════
$lhm = $null
$lhmSensors = @()
if ($isAdmin -and (Test-Path (Join-Path $LhmDir 'LibreHardwareMonitorLib.dll'))) {
    try {
        # Preload every DLL up front. (No AssemblyResolve script block: LHM resolves assemblies on its own
        # background threads, where a PowerShell script block has no runspace and crashes the process.)
        $order = 'BlackSharp.Core', 'HidSharp', 'System.IO.Ports', 'System.Threading.AccessControl', 'DiskInfoToolkit', 'RAMSPDToolkit-NDD', 'LibreHardwareMonitorLib'
        foreach ($n in $order) { $f = Join-Path $LhmDir "$n.dll"; if (Test-Path $f) { [void][Reflection.Assembly]::LoadFrom($f) } }
        $lhm = [LibreHardwareMonitor.Hardware.Computer]::new()
        $lhm.IsCpuEnabled = $true; $lhm.IsMotherboardEnabled = $true; $lhm.IsControllerEnabled = $true
        $lhm.IsMemoryEnabled = $true; $lhm.IsStorageEnabled = $true; $lhm.IsBatteryEnabled = $true
        $lhm.IsGpuEnabled = $true; $lhm.IsNetworkEnabled = $false; $lhm.IsPsuEnabled = $false
        $lhm.Open()
        Log 'info' 'LibreHardwareMonitor opened'
    } catch { Log 'warn' "LibreHardwareMonitor failed: $($_.Exception.Message)"; $lhm = $null }
}
function LhmHardware {
    if (-not $lhm) { return @() }
    $list = [System.Collections.Generic.List[object]]::new()
    foreach ($h in $lhm.Hardware) { $list.Add($h); foreach ($s in $h.SubHardware) { $list.Add($s) } }
    $list
}
function LhmMeta {
    $script:lhmSensors = @(foreach ($h in LhmHardware) { $h.Update(); foreach ($s in $h.Sensors) { $s } })
    Emit @{ type = 'lhmMeta'; sensors = @($script:lhmSensors | ForEach-Object {
        @{ id = "$($_.Identifier)"; hw = $_.Hardware.Name; hwType = "$($_.Hardware.HardwareType)"; type = "$($_.SensorType)"; name = $_.Name }
    }) }
}
function LhmValues {
    if (-not $lhm) { return $null }
    foreach ($h in LhmHardware) { try { $h.Update() } catch {} }
    @($script:lhmSensors | ForEach-Object { , @("$($_.Identifier)", (Rnd $_.Value 2)) })
}

# ════════════════════════════════════════════════════════════════
#  Per-process GPU (GPU Engine counters, raw samples → utilisation)
# ════════════════════════════════════════════════════════════════
$gpuEngCat = [Diagnostics.PerformanceCounterCategory]::new('GPU Engine')
$gpuMemCat = [Diagnostics.PerformanceCounterCategory]::new('GPU Process Memory')
$prevGpuSamples = @{}
function GpuPerProcess {
    $res = @{}
    try {
        $data = $gpuEngCat.ReadCategory()['Utilization Percentage']
        $now = @{}
        foreach ($k in $data.Keys) {
            $smp = $data[$k].Sample; $now[$k] = $smp
            $prev = $script:prevGpuSamples[$k]
            if (-not $prev) { continue }
            $v = [Diagnostics.CounterSample]::Calculate($prev, $smp)
            if ($v -le 0) { continue }
            if ($k -match '^pid_(\d+)_.*engtype_(.+)$') {
                $procId = [int]$Matches[1]; $eng = $Matches[2]
                if (-not $res[$procId]) { $res[$procId] = @{} }
                $res[$procId][$eng] = ($res[$procId][$eng] ?? 0) + $v
            }
        }
        $script:prevGpuSamples = $now
    } catch {}
    $mem = @{}
    try {
        $d = $gpuMemCat.ReadCategory()['Dedicated Usage']
        foreach ($k in $d.Keys) { if ($k -match '^pid_(\d+)_') { $mem[[int]$Matches[1]] = ($mem[[int]$Matches[1]] ?? 0) + $d[$k].RawValue } }
    } catch {}
    @{ util = $res; mem = $mem }
}

# ════════════════════════════════════════════════════════════════
#  Processes (CPU% from TotalProcessorTime deltas)
# ════════════════════════════════════════════════════════════════
$prevCpu = @{}; $prevProcAt = $null
$logical = [Environment]::ProcessorCount
function Procs {
    $nowT = [DateTime]::UtcNow
    $gpu = GpuPerProcess
    $list = [System.Collections.Generic.List[object]]::new()
    $newPrev = @{}
    foreach ($p in [Diagnostics.Process]::GetProcesses()) {
        $t = $null; try { $t = $p.TotalProcessorTime.TotalMilliseconds } catch {}
        $cpuPct = 0
        if ($null -ne $t) {
            $newPrev[$p.Id] = $t
            if ($script:prevProcAt -and $script:prevCpu.ContainsKey($p.Id)) {
                $dt = ($nowT - $script:prevProcAt).TotalMilliseconds
                if ($dt -gt 0) { $cpuPct = 100 * ($t - $script:prevCpu[$p.Id]) / ($dt * $logical) }
            }
        }
        $g = $gpu.util[$p.Id]
        $gpuPct = if ($g) { ($g.Values | Measure-Object -Maximum).Maximum } else { 0 }
        $list.Add([ordered]@{
            pid = $p.Id; name = $p.ProcessName; cpu = (Rnd $cpuPct 1); ws = [double]$p.WorkingSet64; priv = [double]$p.PrivateMemorySize64
            gpu = (Rnd $gpuPct 1); gpuEng = $(if ($g) { ($g.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 1).Key }); gpuMem = [double]($gpu.mem[$p.Id] ?? 0)
            threads = $p.Threads.Count; handles = $p.HandleCount; title = $(if ($p.MainWindowTitle) { $p.MainWindowTitle })
        })
    }
    $script:prevCpu = $newPrev; $script:prevProcAt = $nowT
    $top = @($list | Sort-Object { $_.cpu + $_.gpu + ($_.ws / 1GB) } -Descending | Select-Object -First 40)
    @{ type = 'procs'; t = (NowMs); count = $list.Count; top = $top }
}

# ════════════════════════════════════════════════════════════════
#  Slow facts (every 15 s)
# ════════════════════════════════════════════════════════════════
function Slow {
    $vols = @(Get-CimInstance -Namespace $storageNs -ClassName MSFT_Volume | Where-Object { $_.DriveLetter -and [int]$_.DriveLetter -and $_.Size } | ForEach-Object {
        [ordered]@{ letter = "$($_.DriveLetter)"; label = $_.FileSystemLabel; size = [double]$_.Size; free = [double]$_.SizeRemaining; fs = $_.FileSystem; health = [int]$_.HealthStatus }
    })
    $parts = @(Get-CimInstance -Namespace $storageNs -ClassName MSFT_Partition | Where-Object { $_.DriveLetter -and [int]$_.DriveLetter } | ForEach-Object { @{ letter = "$($_.DriveLetter)"; disk = [int]$_.DiskNumber } })
    $adapters = @(Get-CimInstance -Namespace root\StandardCimv2 -ClassName MSFT_NetAdapter -Filter 'ConnectorPresent=TRUE' | ForEach-Object {
        [ordered]@{ name = $_.Name; desc = $_.InterfaceDescription; up = ($_.MediaConnectState -eq 1); speed = [double]$_.Speed; mac = $_.PermanentAddress; index = $_.InterfaceIndex }
    })
    $ipc = @(Get-CimInstance Win32_NetworkAdapterConfiguration -Filter 'IPEnabled=TRUE' | ForEach-Object {
        [ordered]@{ index = $_.InterfaceIndex; ip = @($_.IPAddress); gateway = @($_.DefaultIPGateway); dns = @($_.DNSServerSearchOrder); dhcp = [bool]$_.DHCPEnabled; desc = $_.Description }
    })
    $wifi = $null
    try {
        $w = netsh wlan show interfaces 2>$null
        if ($w -match 'State\s+:\s+connected') {
            $get = { param($k) (($w | Select-String "^\s*$k\s+:\s+(.+)$") | Select-Object -First 1).Matches.Groups[1].Value.Trim() }
            $wifi = [ordered]@{ ssid = (& $get 'SSID'); radio = (& $get 'Radio type'); band = (& $get 'Band'); channel = (& $get 'Channel'); rx = (& $get 'Receive rate \(Mbps\)'); tx = (& $get 'Transmit rate \(Mbps\)'); signal = (& $get 'Signal'); auth = (& $get 'Authentication') }
        }
    } catch {}
    $full = (Get-CimInstance -Namespace root\wmi -ClassName BatteryFullChargedCapacity).FullChargedCapacity
    $design = try { (Get-CimInstance -Namespace root\wmi -ClassName BatteryStaticData -ErrorAction Stop).DesignedCapacity } catch { $null }
    $cycles = try { (Get-CimInstance -Namespace root\wmi -ClassName BatteryCycleCount -ErrorAction Stop).CycleCount } catch { $null }
    $vcs = @(Get-CimInstance Win32_VideoController | ForEach-Object {
        [ordered]@{ name = $_.Name; w = $_.CurrentHorizontalResolution; h = $_.CurrentVerticalResolution; hz = $_.CurrentRefreshRate; bpp = $_.CurrentBitsPerPixel; driver = $_.DriverVersion; driverDate = "$($_.DriverDate)"; vramBytes = [double]$_.AdapterRAM }
    })
    $plan = ((powercfg /getactivescheme) -replace '.*\((.*)\).*', '$1').Trim()
    $osNow = Get-CimInstance Win32_OperatingSystem
    $e = [ordered]@{
        type = 'slow'; t = (NowMs); volumes = $vols; partitions = $parts; adapters = $adapters; ipConfig = $ipc; wifi = $wifi
        battery = [ordered]@{ fullWh = $(if ($full) { $full / 1000 }); designWh = $(if ($design) { $design / 1000 }); cycles = $cycles }
        videoControllers = $vcs; powerPlan = $plan; bootTime = $osNow.LastBootUpTime.ToString('o')
        acerSlow = (ReadAcerSlow)
    }
    $e
}

# ════════════════════════════════════════════════════════════════
#  Main loop
# ════════════════════════════════════════════════════════════════
Emit ([ordered]@{
    type = 'static'; t = (NowMs); admin = $isAdmin; pid = $PID; pwsh = "$($PSVersionTable.PSVersion)"
    caps = [ordered]@{ acerWmi = [bool]$acer; lhm = [bool]$lhm; rapl = [bool]$pc.raplPkg; thermalZone = [bool]$pc.tzTemp; gpuEngine = $true }
    system = [ordered]@{ maker = $cs.Manufacturer; model = $cs.Model; family = $cs.SystemFamily; sku = $cs.SystemSKUNumber; board = "$($board.Manufacturer) $($board.Product)"; boardRev = $board.Version
        bios = "$($bios.Manufacturer) $($bios.SMBIOSBIOSVersion)"; biosDate = $bios.ReleaseDate.ToString('yyyy-MM-dd'); ec = "$($bios.EmbeddedControllerMajorVersion).$($bios.EmbeddedControllerMinorVersion)"; smbios = "$($bios.SMBIOSMajorVersion).$($bios.SMBIOSMinorVersion)"
        os = ($os.Caption -replace 'Microsoft ', ''); osVersion = $cv.DisplayVersion; build = "$($os.Version).$($cv.UBR)"; installDate = $os.InstallDate.ToString('yyyy-MM-dd'); arch = $os.OSArchitecture
        secureBoot = ($sb -eq 1); vbs = [int]$dg.VirtualizationBasedSecurityStatus; hypervisor = [bool]$cs.HypervisorPresent; computerName = $env:COMPUTERNAME }
    cpu = [ordered]@{ name = $cpu.Name.Trim(); cores = $cpu.NumberOfCores; threads = $cpu.NumberOfLogicalProcessors; baseMHz = $baseMHz; l2KB = $cpu.L2CacheSize; l3KB = $cpu.L3CacheSize; socket = $cpu.SocketDesignation; coreNames = $cores }
    memory = [ordered]@{ totalBytes = $totalMem; modules = @($mods | ForEach-Object { [ordered]@{ slot = $_.DeviceLocator; bytes = [double]$_.Capacity; maker = $_.Manufacturer.Trim(); part = $_.PartNumber.Trim(); rated = $_.Speed; running = $_.ConfiguredClockSpeed; volts = $_.ConfiguredVoltage / 1000; width = $_.DataWidth } }) }
    disks = $physDisks; monitors = $monitors; diskCounters = $diskNames; nicCounters = $nicNames
})
if ($lhm) { LhmMeta }
Emit (Slow)

if ($SelfTest) {
    $ErrorActionPreference = 'Stop'
    foreach ($name in 'ReadAcer', 'ReadAcerSlow', 'LhmValues', 'Procs', 'Procs', 'Slow') {
        $sw0 = [Diagnostics.Stopwatch]::StartNew()
        try { $r = & $name; Log 'info' ("selftest {0}: ok in {1} ms, {2} chars" -f $name, $sw0.ElapsedMilliseconds, (($r | ConvertTo-Json -Compress -Depth 6) ?? '').Length) }
        catch { Log 'error' ("selftest {0}: {1} @ line {2}: {3}" -f $name, $_.Exception.Message, $_.InvocationInfo.ScriptLineNumber, $_.InvocationInfo.Line.Trim()) }
    }
    return
}

$tick = 0
$sw = [Diagnostics.Stopwatch]::StartNew()
$parent = if ($ParentPid -gt 0) { try { [Diagnostics.Process]::GetProcessById($ParentPid) } catch { $null } } else { $null }
while ($true) {
    $t0 = $sw.ElapsedMilliseconds
    if ($parent -and ($tick % 5) -eq 0) { $parent.Refresh(); if ($parent.HasExited) { exit 0 } }
    $bs = Get-CimInstance -Namespace root\wmi -ClassName BatteryStatus
    $memAvail = Val $pc.memAvail
    $tzK = Val $pc.tzTemp
    $e = [ordered]@{
        type = 'tick'; t = (NowMs); n = $tick
        cpu = [ordered]@{
            util = (Rnd ([Math]::Min(100, (Val $pc.cpuUtil)))); perf = (Rnd (Val $pc.cpuPerf)); mhz = (Rnd ($baseMHz * (Val $pc.cpuPerf) / 100) 0)
            priv = (Rnd (Val $pc.cpuPriv)); intr = (Rnd (Val $pc.cpuIntr) 2); dpc = (Rnd (Val $pc.cpuDpc) 2)
            coreUtil = @($coreUtil | ForEach-Object { Rnd ([Math]::Min(100, (Val $_))) }); coreMhz = @($corePerf | ForEach-Object { Rnd ($baseMHz * (Val $_) / 100) 0 })
            ctxSwitches = (Rnd (Val $pc.ctxSw) 0); queue = (Val $pc.procQ); threads = (Val $pc.threads); processes = (Val $pc.procsN)
        }
        power = [ordered]@{ pkgW = (Rnd ((Val $pc.raplPkg) / 1000) 2); coresW = (Rnd ((Val $pc.raplCore) / 1000) 2); igpuW = (Rnd ((Val $pc.raplGfx) / 1000) 2); dramW = (Rnd ((Val $pc.raplDram) / 1000) 2); meterW = (Rnd ((Val $pc.powerMeter) / 1000) 2) }
        mem = [ordered]@{ total = $totalMem; avail = $memAvail; used = $(if ($memAvail) { $totalMem - $memAvail }); commit = (Val $pc.memCommit); commitLimit = (Val $pc.memCommitLimit); cache = (Val $pc.memCache)
            paged = (Val $pc.memPagedPool); nonpaged = (Val $pc.memNonPaged); compressed = (Val $pc.compressed); pageFaults = (Rnd (Val $pc.pageFaults) 0); pagesIn = (Rnd (Val $pc.pagesIn) 0); pagefilePct = (Rnd (Val $pc.pagefile)) }
        thermal = [ordered]@{ zoneC = $(if ($tzK) { Rnd ($tzK - 273.15) }); passivePct = (Val $pc.tzPassive); reasons = (Val $pc.tzReasons) }
        disks = @($disks | ForEach-Object { [ordered]@{ name = $_.name; r = (Rnd (Val $_.read) 0); w = (Rnd (Val $_.write) 0); active = $(if ($_.idle) { Rnd (100 - [Math]::Min(100, (Val $_.idle))) }); q = (Val $_.queue); rlatMs = (Rnd ((Val $_.rlat) * 1000) 2); wlatMs = (Rnd ((Val $_.wlat) * 1000) 2); riops = (Rnd (Val $_.riops) 0); wiops = (Rnd (Val $_.wiops) 0) } })
        net = @($nics | ForEach-Object { [ordered]@{ name = $_.name; rx = (Rnd (Val $_.rx) 0); tx = (Rnd (Val $_.tx) 0); bw = (Val $_.bw) } })
        battery = $(if ($bs) { [ordered]@{ online = [bool]$bs.PowerOnline; charging = [bool]$bs.Charging; discharging = [bool]$bs.Discharging; critical = [bool]$bs.Critical
            chargeRateW = (Rnd ($bs.ChargeRate / 1000) 2); dischargeRateW = (Rnd ($bs.DischargeRate / 1000) 2); voltageV = (Rnd ($bs.Voltage / 1000) 3); remainingWh = (Rnd ($bs.RemainingCapacity / 1000) 2) } })
        acer = $(if ($acer -and ($tick % 2 -eq 0)) { ReadAcer })
        lhm = (LhmValues)
    }
    Emit $e
    if ($tick % 3 -eq 0) { Emit (Procs) }
    if ($tick -gt 0 -and $tick % 15 -eq 0) { Emit (Slow) }
    if ($lhm -and $tick -gt 0 -and $tick % 300 -eq 0) { LhmMeta }   # rediscover sensors every 5 min
    $tick++
    $spent = $sw.ElapsedMilliseconds - $t0
    $wait = $IntervalMs - $spent
    if ($wait -gt 10) { Start-Sleep -Milliseconds $wait }
}
