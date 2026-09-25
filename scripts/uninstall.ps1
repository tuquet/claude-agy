<#
.SYNOPSIS
    Completely uninstalls Claude-Agy from Windows.
#>
param(
    [string]$TargetDir = "$env:USERPROFILE\claude-agy"
)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " Starting Claude-Agy Uninstaller for Windows..." -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Stop proxy processes if running
Get-Process cli-proxy-api -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "[1/3] Stopped cli-proxy-api processes." -ForegroundColor Green

# 2. Remove from User PATH
$binPath = Join-Path $TargetDir "bin"
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -like "*$binPath*") {
    $paths = ($userPath -split ';') | Where-Object { $_ -and $_.Trim() -ne $binPath -and $_.Trim() -ne "" }
    [Environment]::SetEnvironmentVariable("Path", ($paths -join ';'), "User")
    Write-Host "[2/3] Removed $binPath from User PATH." -ForegroundColor Green
} else {
    Write-Host "[2/3] $binPath not found in User PATH." -ForegroundColor Yellow
}

# 3. Remove application directory
if (Test-Path $TargetDir) {
    Remove-Item -Path $TargetDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "[3/3] Removed application directory: $TargetDir" -ForegroundColor Green
} else {
    Write-Host "[3/3] Directory $TargetDir does not exist." -ForegroundColor Yellow
}

Write-Host "`n[SUCCESS] Claude-Agy has been completely removed from Windows!" -ForegroundColor Green
