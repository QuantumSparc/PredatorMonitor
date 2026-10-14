<#
  Admin diagnostic: what this machine exposes to the agent.
  Writes everything to $OutFile (default %TEMP%\predator-monitor-diag.txt). Read-only — only Get* WMI calls.
    Start-Process pwsh -Verb RunAs -ArgumentList '-NoProfile','-File','agent\diagnose.ps1'
#>
param([string]$OutFile = (Join-Path $env:TEMP 'predator-monitor-diag.txt'))
$ErrorActionPreference = 'Continue'
Start-Transcript -Path $OutFile -Force | Out-Null
"admin: $(([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))"
"PawnIO: $((Get-Service PawnIO -ErrorAction SilentlyContinue).Status)"

"`n==== Acer gaming WMI raw reads ===="
$a = Get-CimInstance -Namespace root\wmi -ClassName AcerGamingFunction | Select-Object -First 1
if (-not $a) { 'AcerGamingFunction: no instance' } else {
    function G($m, $in) { try { $r = Invoke-CimMethod -InputObject $a -MethodName $m -Arguments @{ gmInput = [uint32]$in } -ErrorAction Stop; '{0,-26} in=0x{1:X4}  out=0x{2:X16}' -f $m, $in, [uint64]$r.gmOutput } catch { '{0,-26} in=0x{1:X4}  ERROR {2}' -f $m, $in, $_.Exception.Message } }
    G 'GetGamingSysInfo' 0x0000
    foreach ($sid in 0x01, 0x02, 0x03, 0x06, 0x0A) { G 'GetGamingSysInfo' (0x0001 -bor ($sid -shl 8)) }
    G 'GetGamingFanBehavior' 0x9
    G 'GetGamingFanBehavior' 0x1
    G 'GetGamingFanBehavior' 0x8
    G 'GetGamingFanSpeed' 0x1
    G 'GetGamingFanSpeed' 0x4
    foreach ($idx in 0x05, 0x07, 0x0A, 0x0B) { G 'GetGamingMiscSetting' $idx }
    G 'GetGamingLED' 0x1
    foreach ($in in 0, 1) { G 'GetGamingProfile' $in }
    foreach ($m in 'GetGamingKBBacklight', 'GetGamingFanTable') { try { $r = Invoke-CimMethod -InputObject $a -MethodName $m -ErrorAction Stop; "$m  " + (($r.CimInstanceProperties | Where-Object Name -ne 'ReturnValue' | ForEach-Object { "$($_.Name)=$($_.Value -join ',')" }) -join '  ') } catch { "$m  ERROR $($_.Exception.Message)" } }
}

"`n==== Agent self-test ===="
& pwsh -NoProfile -File (Join-Path $PSScriptRoot 'agent.ps1') -SelfTest 2>&1 | ForEach-Object { $_ }

"`n==== Agent live output (6 s) ===="
$p = Start-Process pwsh -ArgumentList '-NoProfile', '-File', ('"{0}"' -f (Join-Path $PSScriptRoot 'agent.ps1')) -RedirectStandardOutput "$OutFile.agent.ndjson" -RedirectStandardError "$OutFile.agent.err" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 9
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
"agent stdout lines: $((Get-Content "$OutFile.agent.ndjson" -ErrorAction SilentlyContinue | Measure-Object).Count)"
"agent stderr: $(Get-Content "$OutFile.agent.err" -Raw -ErrorAction SilentlyContinue)"
Stop-Transcript | Out-Null
