<#
  Downloads LibreHardwareMonitorLib and its dependencies from nuget.org into agent/lhm/.
  The library is MPL-2.0 licensed. CPU sensors additionally need the PawnIO driver:
      winget install namazso.PawnIO      (admin, one-time)
#>
param([string]$Version = '0.9.6')
$ErrorActionPreference = 'Stop'
$dest = Join-Path $PSScriptRoot 'lhm'
$tmp = Join-Path ([IO.Path]::GetTempPath()) "lhm-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Force $dest, $tmp | Out-Null

# package → version: LibreHardwareMonitorLib 0.9.6 and its full Windows dependency tree (System.Management ships with pwsh)
$packages = [ordered]@{
    'LibreHardwareMonitorLib'   = $Version
    'HidSharp'                  = '2.6.4'
    'DiskInfoToolkit'           = '1.1.2'
    'RAMSPDToolkit-NDD'         = '1.4.2'
    'System.IO.Ports'           = '10.0.3'
    'System.Threading.AccessControl' = '10.0.3'
    'BlackSharp.Core'           = '1.0.7'   # dependency of DiskInfoToolkit + RAMSPDToolkit
}
$runtimeMajor = [Environment]::Version.Major   # pwsh 7.6 = .NET 10
$frameworks = @("net$runtimeMajor.0") + @('net10.0', 'net9.0', 'net8.0', 'net7.0', 'net6.0', 'netstandard2.1', 'netstandard2.0') | Select-Object -Unique

foreach ($name in $packages.Keys) {
    $ver = $packages[$name]; $id = $name.ToLower()
    $url = "https://api.nuget.org/v3-flatcontainer/$id/$ver/$id.$ver.nupkg"
    Write-Host "downloading $name $ver"
    $zip = Join-Path $tmp "$id.zip"
    Invoke-WebRequest $url -OutFile $zip -UseBasicParsing
    $ex = Join-Path $tmp $id
    Expand-Archive $zip $ex -Force
    # managed assemblies live in lib/<tfm>/ or, for RID-specific packages like LHM 0.9.6, runtimes/win-x64/lib/<tfm>/
    $libRoot = Join-Path $ex 'lib'
    $fw = $frameworks | Where-Object { Test-Path (Join-Path $libRoot $_) } | Select-Object -First 1
    if (-not $fw) {
        $libRoot = Join-Path $ex 'runtimes\win-x64\lib'
        $fw = $frameworks | Where-Object { Test-Path (Join-Path $libRoot $_) } | Select-Object -First 1
    }
    if (-not $fw) { Write-Host "  (no managed lib for $name — skipped)"; continue }
    Get-ChildItem (Join-Path $libRoot $fw) -Filter *.dll | ForEach-Object { Copy-Item $_.FullName $dest -Force; Write-Host "  + $($_.Name) [$fw]" }
    # native runtime assets (e.g. win-x64) if any
    $rt = Join-Path $ex 'runtimes\win-x64\native'
    if (Test-Path $rt) { Get-ChildItem $rt | ForEach-Object { Copy-Item $_.FullName $dest -Force; Write-Host "  + $($_.Name) [native]" } }
    $rtLib = Join-Path $ex 'runtimes\win\lib'
    if (Test-Path $rtLib) {
        $rfw = $frameworks | Where-Object { Test-Path (Join-Path $rtLib $_) } | Select-Object -First 1
        if ($rfw) { Get-ChildItem (Join-Path $rtLib $rfw) -Filter *.dll | ForEach-Object { Copy-Item $_.FullName $dest -Force; Write-Host "  + $($_.Name) [win/$rfw]" } }
    }
}
Remove-Item $tmp -Recurse -Force
Write-Host "`nLibreHardwareMonitor $Version installed to $dest"
$pawn = Get-Service -Name PawnIO -ErrorAction SilentlyContinue
if (-not $pawn) { Write-Host "PawnIO driver not found. For CPU temperatures run (as admin):  winget install namazso.PawnIO" }
else { Write-Host "PawnIO driver: $($pawn.Status)" }
