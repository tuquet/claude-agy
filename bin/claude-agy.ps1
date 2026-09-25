<#
.SYNOPSIS
    Primary launcher for Claude-Agy on Windows.
#>
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$UserArgs)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir ".."))

# 0. Handle self-update
$isUpdateCommand = ($UserArgs.Length -eq 1 -and ($UserArgs[0] -eq "update" -or $UserArgs[0] -eq "upgrade" -or $UserArgs[0] -eq "--update"))
if ($isUpdateCommand) {
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host " Updating Claude-Agy & Claude Code CLI..." -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan

    $isScoop = ($AppDir -like "*\scoop\apps\*")
    if ($isScoop) {
        Write-Host ">> Updating Scoop and claude-agy package..." -ForegroundColor Cyan
        try { & scoop update } catch {}
        try { & scoop update claude-agy } catch {}
    } else {
        Write-Host ">> Updating Claude-Agy from GitHub..." -ForegroundColor Cyan
        $env:TARGET_DIR = $AppDir
        irm https://raw.githubusercontent.com/tuquet/claude-agy/main/scripts/setup.ps1 | iex
    }

    Write-Host "`n>> Updating Claude Code CLI..." -ForegroundColor Cyan
    & claude update

    Write-Host "`n>> Re-synchronizing Antigravity OAuth token..." -ForegroundColor Cyan
    & "$AppDir\scripts\sync-token.ps1" -AppDir $AppDir

    Write-Host "`n[SUCCESS] Claude-Agy update completed!" -ForegroundColor Green
    exit 0
}

$Port = 8318
$AutoBypass = $true
$DefaultModel = "claude-sonnet-4-6"
$ConfigTokenPath = $null

$settingsFile = Join-Path $AppDir "config\settings.env"
if (Test-Path $settingsFile) {
    Get-Content $settingsFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $parts = $line.Split("=", 2)
            $key = $parts[0].Trim()
            $val = $parts[1].Trim().Trim('"').Trim("'")
            if ($key -eq "PORT") { $Port = [int]$val }
            if ($key -eq "AUTO_BYPASS_PERMISSIONS") { $AutoBypass = ($val -eq "true") }
            if ($key -eq "DEFAULT_MODEL") { $DefaultModel = $val }
            if ($key -eq "ANTIGRAVITY_TOKEN_PATH" -or $key -eq "TOKEN_PATH") { $ConfigTokenPath = $val }
        }
    }
}

$EnableBypass = $AutoBypass
$ModelSpecified = $false
$CustomTokenPath = if ($env:ANTIGRAVITY_TOKEN_PATH) { $env:ANTIGRAVITY_TOKEN_PATH } elseif ($env:GEMINI_TOKEN_PATH) { $env:GEMINI_TOKEN_PATH } else { $ConfigTokenPath }
$ProcessedArgs = [System.Collections.Generic.List[string]]::new()

for ($i = 0; $i -lt $UserArgs.Length; $i++) {
    $arg = $UserArgs[$i]
    switch ($arg) {
        "--bypass" { $EnableBypass = $true }
        "-y" { $EnableBypass = $true }
        "--no-bypass" { $EnableBypass = $false }
        "--dangerously-skip-permissions" { $EnableBypass = $true }
        "--token-path" {
            if ($i + 1 -lt $UserArgs.Length) {
                $i++
                $CustomTokenPath = $UserArgs[$i]
            }
        }
        "-t" {
            if ($i + 1 -lt $UserArgs.Length) {
                $i++
                $CustomTokenPath = $UserArgs[$i]
            }
        }
        default {
            if ($arg.StartsWith("--token-path=")) {
                $CustomTokenPath = $arg.Substring(13).Trim('"').Trim("'")
            } elseif ($arg -eq "--model" -or $arg -eq "-m" -or $arg.StartsWith("--model=")) {
                $ModelSpecified = $true
                $ProcessedArgs.Add($arg)
            } else {
                $ProcessedArgs.Add($arg)
            }
        }
    }
}

# Sync Antigravity token silently
$syncArgs = @{ AppDir = $AppDir; Quiet = $true }
if ($CustomTokenPath) { $syncArgs["TokenPath"] = $CustomTokenPath }
& "$AppDir\scripts\sync-token.ps1" @syncArgs *>$null

if (-not $ModelSpecified -and $DefaultModel) {
    $ProcessedArgs.Insert(0, $DefaultModel)
    $ProcessedArgs.Insert(0, "--model")
}

if ($EnableBypass) {
    $env:IS_SANDBOX = "1"
    if (-not $ProcessedArgs.Contains("--dangerously-skip-permissions")) {
        $ProcessedArgs.Insert(0, "--dangerously-skip-permissions")
    }
}

$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:$Port"
$env:ANTHROPIC_AUTH_TOKEN = "sk-personal-claude-token"
$env:CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY = "1"

function Test-PortOpen([string]$HostName, [int]$PortNum) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect($HostName, $PortNum, $null, $null)
        if ($async.AsyncWaitHandle.WaitOne(200, $false)) {
            $client.EndConnect($async)
            return $true
        }
    } catch {
        return $false
    } finally {
        $client.Close()
    }
    return $false
}

$ProxyProcess = $null
$StartedProxy = $false

if (-not (Test-PortOpen "127.0.0.1" $Port)) {
    $proxyBin = Join-Path $AppDir "bin\cli-proxy-api.exe"
    $proxyCfg = Join-Path $AppDir "config\config.yaml"
    $proxyLog = Join-Path $AppDir "logs\proxy.log"
    $proxyErr = Join-Path $AppDir "logs\proxy.err.log"

    $ProxyProcess = Start-Process -FilePath $proxyBin `
        -ArgumentList "--config `"$proxyCfg`"" `
        -WindowStyle Hidden `
        -PassThru `
        -RedirectStandardOutput $proxyLog `
        -RedirectStandardError $proxyErr

    $StartedProxy = $true

    $retries = 0
    while (-not (Test-PortOpen "127.0.0.1" $Port)) {
        Start-Sleep -Milliseconds 200
        $retries++
        if ($retries -gt 25) {
            Write-Host ">> [ERROR] Failed to start Proxy. Check log at $proxyLog" -ForegroundColor Red
            if ($ProxyProcess -and -not $ProxyProcess.HasExited) {
                Stop-Process -Id $ProxyProcess.Id -Force -ErrorAction SilentlyContinue
            }
            exit 1
        }
    }
}

try {
    & claude @ProcessedArgs
    $claudeExitCode = $LASTEXITCODE
} finally {
    if ($StartedProxy -and $ProxyProcess -and -not $ProxyProcess.HasExited) {
        Stop-Process -Id $ProxyProcess.Id -Force -ErrorAction SilentlyContinue
    }
}

exit $claudeExitCode
