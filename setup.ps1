<#
.SYNOPSIS
    Root entrypoint for Claude-Agy setup script on Windows.
#>
[CmdletBinding()]
param(
    [string]$TargetDir = $(if ($env:TARGET_DIR) { $env:TARGET_DIR } else { "$env:USERPROFILE\claude-agy" }),
    [string]$CpaVersion = "7.3.17"
)

$localScript = Join-Path $PSScriptRoot "scripts\setup.ps1"
if (Test-Path $localScript) {
    & $localScript -TargetDir $TargetDir -CpaVersion $CpaVersion
} else {
    $env:TARGET_DIR = $TargetDir
    irm https://raw.githubusercontent.com/tuquet/claude-agy/main/scripts/setup.ps1 | iex
}
