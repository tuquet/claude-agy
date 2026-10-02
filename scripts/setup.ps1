<#
.SYNOPSIS
    Automated setup script for Claude-Agy on Windows.
#>
[CmdletBinding()]
param(
    [string]$TargetDir = $(if ($env:TARGET_DIR) { $env:TARGET_DIR } else { "$env:USERPROFILE\claude-agy" }),
    [string]$CpaVersion = "7.3.17"
)

$ErrorActionPreference = "Stop"
$TargetDir = [System.IO.Path]::GetFullPath($TargetDir)
$BinDir = Join-Path $TargetDir "bin"
$ConfigDir = Join-Path $TargetDir "config"
$DataDir = Join-Path $TargetDir "data"
$LogsDir = Join-Path $TargetDir "logs"
$ScriptsDir = Join-Path $TargetDir "scripts"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " [SETUP] Claude-Agy for Windows (Automated Setup)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Target directory: $TargetDir" -ForegroundColor Gray

# 1. Check Node.js runtime
Write-Host "`n[1/6] Checking Node.js runtime..." -ForegroundColor Cyan
$nodeVersion = $null
try {
    $nodeVersion = (& node -v 2>$null)
} catch {}
if (-not $nodeVersion) {
    Write-Host "  -> [ERROR] Node.js is required but not found in PATH." -ForegroundColor Red
    Write-Host "  -> Install via Scoop: scoop install nodejs-lts" -ForegroundColor Yellow
    exit 1
}
Write-Host "  -> Node.js OK: $nodeVersion" -ForegroundColor Green

# 2. Check Claude Code CLI
Write-Host "`n[2/6] Checking Anthropic Claude Code CLI..." -ForegroundColor Cyan
$claudeBin = Get-Command claude -ErrorAction SilentlyContinue
if (-not $claudeBin) {
    Write-Host "  -> Installing @anthropic-ai/claude-code via npm..." -ForegroundColor Cyan
    npm install -g @anthropic-ai/claude-code
} else {
    Write-Host "  -> Claude Code CLI already available." -ForegroundColor Green
}

# 3. Create Target Directory Tree
@($TargetDir, $BinDir, $ConfigDir, $DataDir, $LogsDir, $ScriptsDir) | ForEach-Object {
    if (-not (Test-Path $_)) { New-Item -ItemType Directory -Path $_ -Force | Out-Null }
}

# 4. Resolve and Deploy Claude-Agy Components (bin, scripts, config)
Write-Host "`n[3/6] Deploying Claude-Agy components..." -ForegroundColor Cyan
$localRoot = $null
if ($PSScriptRoot) {
    if (Test-Path (Join-Path $PSScriptRoot "..\bin\claude-agy.ps1")) {
        $localRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
    } elseif (Test-Path (Join-Path $PSScriptRoot "bin\claude-agy.ps1")) {
        $localRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
    }
}

if ($localRoot) {
    Copy-Item -Path (Join-Path $localRoot "bin\*") -Destination $BinDir -Force
    Copy-Item -Path (Join-Path $localRoot "scripts\*") -Destination $ScriptsDir -Force
    if (-not (Test-Path (Join-Path $ConfigDir "settings.env"))) {
        Copy-Item -Path (Join-Path $localRoot "config\*") -Destination $ConfigDir -Force
    }
    Write-Host "  -> Deployed components from local source ($localRoot)." -ForegroundColor Green
} else {
    Write-Host "  -> Fetching latest components from GitHub repository..." -ForegroundColor Cyan
    $zipUrl = "https://github.com/tuquet/claude-agy/archive/refs/heads/main.zip"
    $tempZip = Join-Path $env:TEMP "claude-agy-$([Guid]::NewGuid().ToString('N')).zip"
    $tempExtract = Join-Path $env:TEMP "claude-agy-extract-$([Guid]::NewGuid().ToString('N'))"
    try {
        $downloaded = $false
        try {
            curl.exe -fsSL -o $tempZip $zipUrl
            if ((Test-Path $tempZip) -and (Get-Item $tempZip).Length -gt 1000) { $downloaded = $true }
        } catch {}
        if (-not $downloaded) {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip -UseBasicParsing -UserAgent "Mozilla/5.0"
        }
        Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force
        $extractedRoot = Join-Path $tempExtract "claude-agy-main"
        Copy-Item -Path (Join-Path $extractedRoot "bin\*") -Destination $BinDir -Force
        Copy-Item -Path (Join-Path $extractedRoot "scripts\*") -Destination $ScriptsDir -Force
        if (-not (Test-Path (Join-Path $ConfigDir "settings.env"))) {
            Copy-Item -Path (Join-Path $extractedRoot "config\*") -Destination $ConfigDir -Force
        }
        Write-Host "  -> Successfully fetched and extracted components." -ForegroundColor Green
    } finally {
        if (Test-Path $tempZip) { Remove-Item -Force $tempZip -ErrorAction SilentlyContinue }
        if (Test-Path $tempExtract) { Remove-Item -Recurse -Force $tempExtract -ErrorAction SilentlyContinue }
    }
}
Copy-Item -Path (Join-Path $ScriptsDir "uninstall.ps1") -Destination $TargetDir -Force

# 5. Check or Download CLIProxyAPI Windows binary
Write-Host "`n[4/6] Checking CLIProxyAPI Windows binary..." -ForegroundColor Cyan
$proxyBin = Join-Path $BinDir "cli-proxy-api.exe"
if (-not (Test-Path $proxyBin)) {
    $rootBin = Join-Path $TargetDir "cli-proxy-api.exe"
    if (Test-Path $rootBin) {
        Move-Item -Path $rootBin -Destination $proxyBin -Force
        Write-Host "  -> Moved cli-proxy-api.exe to bin directory." -ForegroundColor Green
    } else {
        Write-Host "  -> Downloading CLIProxyAPI v$CpaVersion from GitHub..." -ForegroundColor Cyan
        $cpaUrl = "https://github.com/router-for-me/CLIProxyAPI/releases/download/v$CpaVersion/CLIProxyAPI_${CpaVersion}_windows_amd64.zip"
        $tempZip = Join-Path $env:TEMP "cpa-$CpaVersion.zip"
        $tempExtract = Join-Path $env:TEMP "cpa-extract-$CpaVersion"
        try {
            $downloaded = $false
            try {
                curl.exe -fsSL -o $tempZip $cpaUrl
                if ((Test-Path $tempZip) -and (Get-Item $tempZip).Length -gt 1000) { $downloaded = $true }
            } catch {}
            if (-not $downloaded) {
                [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
                Invoke-WebRequest -Uri $cpaUrl -OutFile $tempZip -UseBasicParsing -UserAgent "Mozilla/5.0"
            }
            Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force
            $foundExe = Get-ChildItem -Path $tempExtract -Filter "cli-proxy-api.exe" -Recurse | Select-Object -First 1
            if ($foundExe) {
                Copy-Item -Path $foundExe.FullName -Destination $proxyBin -Force
                Write-Host "  -> Installed binary: $proxyBin" -ForegroundColor Green
            } else {
                throw "Binary cli-proxy-api.exe not found in archive."
            }
        } finally {
            if (Test-Path $tempZip) { Remove-Item -Force $tempZip -ErrorAction SilentlyContinue }
            if (Test-Path $tempExtract) { Remove-Item -Recurse -Force $tempExtract -ErrorAction SilentlyContinue }
        }
    }
} else {
    Write-Host "  -> Binary cli-proxy-api.exe already available." -ForegroundColor Green
}

# Fix auth-dir in config.yaml
$configYamlFile = Join-Path $ConfigDir "config.yaml"
if (Test-Path $configYamlFile) {
    $formattedDataDir = $DataDir.Replace('\', '/')
    $content = Get-Content $configYamlFile -Raw
    $content = $content.Replace('auth-dir: ""', "auth-dir: `"$formattedDataDir`"")
    Set-Content -Path $configYamlFile -Value $content -Encoding ASCII
}

# 6. Configure User PATH (Skip if Scoop)
$isScoop = ($env:SCOOP_DIR -or ($TargetDir -like "*\scoop\apps\*"))
if (-not $isScoop) {
    Write-Host "`n[5/6] Configuring User PATH..." -ForegroundColor Cyan
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if (-not ($userPath -split ';' -contains $BinDir)) {
        $newUserPath = if ($userPath) { "$userPath;$BinDir" } else { $BinDir }
        [Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")
        $env:Path = "$env:Path;$BinDir"
        Write-Host "  -> Added $BinDir to User PATH." -ForegroundColor Green
    } else {
        Write-Host "  -> $BinDir already in PATH." -ForegroundColor Green
    }
} else {
    Write-Host "`n[5/6] Scoop environment: Scoop shims will manage the command." -ForegroundColor Green
}

# 7. Initial token synchronization
Write-Host "`n[6/6] Synchronizing Antigravity OAuth token..." -ForegroundColor Cyan
$syncScript = Join-Path $ScriptsDir "sync-token.ps1"
if (Test-Path $syncScript) {
    $initSyncArgs = @{ AppDir = $TargetDir }
    if ($env:ANTIGRAVITY_TOKEN_PATH) { $initSyncArgs["TokenPath"] = $env:ANTIGRAVITY_TOKEN_PATH }
    & $syncScript @initSyncArgs
}

Write-Host @"

============================================================
 [SUCCESS] Claude-Agy Setup Completed on Windows!
============================================================
 Command:   claude-agy
 Update:    claude-agy update
 Model:     Inside Claude chat, type /model
 Uninstall: & '$TargetDir\uninstall.ps1'

 * Tip: Open a new Terminal/PowerShell window if PATH was updated.
"@ -ForegroundColor Green
