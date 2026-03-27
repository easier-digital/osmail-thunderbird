# OSMail Thunderbird silent installer wrapper
# Installs bundled Thunderbird MSI and deploys enterprise configuration

param(
    [string]$TBVersion
)

$ErrorActionPreference = 'Stop'

# --- Logging ---
$logFile = Join-Path $env:TEMP 'osmail-thunderbird-install.log'
function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $entry = "[$timestamp] $Message"
    Add-Content -Path $logFile -Value $entry
    Write-Host $entry
}

# --- Admin check ---
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Log 'ERROR: This script must be run as Administrator.'
    exit 1
}

Write-Log 'OSMail Thunderbird installer started.'

# --- Determine version ---
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

if (-not $TBVersion) {
    $versionFile = Join-Path $scriptDir '.thunderbird-version'
    if (Test-Path $versionFile) {
        $TBVersion = (Get-Content $versionFile -Raw).Trim()
        Write-Log "Read version from .thunderbird-version: $TBVersion"
    } else {
        Write-Log 'ERROR: No -TBVersion supplied and .thunderbird-version not found.'
        exit 1
    }
}

# --- Validate MSI ---
$msiName = "Thunderbird Setup $TBVersion.msi"
$msiPath = Join-Path $scriptDir $msiName
if (-not (Test-Path $msiPath)) {
    Write-Log "ERROR: MSI not found at $msiPath"
    exit 1
}

# --- Install MSI silently ---
Write-Log "Installing $msiName silently..."
$msiArgs = @(
    '/i'
    "`"$msiPath`""
    '/qn'
    'INSTALL_MAINTENANCE_SERVICE=false'
    'DESKTOP_SHORTCUT=false'
    'TASKBAR_SHORTCUT=false'
    'REMOVE_DISTRIBUTION_DIR=false'
    '/L*v'
    "`"$env:TEMP\thunderbird-msi-install.log`""
)
$process = Start-Process -FilePath 'msiexec.exe' -ArgumentList $msiArgs -Wait -PassThru
if ($process.ExitCode -ne 0) {
    Write-Log "ERROR: msiexec exited with code $($process.ExitCode)"
    exit 1
}
Write-Log 'MSI installation completed successfully.'

# --- Deploy distribution directory ---
$tbInstallDir = Join-Path $env:ProgramFiles 'Mozilla Thunderbird'
$tbDistDir = Join-Path $tbInstallDir 'distribution'
$srcDistDir = Join-Path $scriptDir 'distribution'

if (Test-Path $srcDistDir) {
    Write-Log "Copying distribution files to $tbDistDir..."
    if (-not (Test-Path $tbDistDir)) {
        New-Item -ItemType Directory -Path $tbDistDir -Force | Out-Null
    }
    Copy-Item -Path (Join-Path $srcDistDir '*') -Destination $tbDistDir -Recurse -Force
    Write-Log 'Distribution files deployed.'

    # --- Rewrite policies.json with local file:/// URLs for extensions ---
    $policiesPath = Join-Path $tbDistDir 'policies.json'
    if (Test-Path $policiesPath) {
        $extDir = Join-Path $tbDistDir 'extensions'
        $policiesJson = Get-Content $policiesPath -Raw
        $extensions = @{
            'osmail-theme@osmail.ca.xpi' = 'https://github.com/easier-digital/osmail-thunderbird/releases/latest/download/osmail-theme.xpi'
            'osmail-onboarding@osmail.ca.xpi' = 'https://github.com/easier-digital/osmail-thunderbird/releases/latest/download/osmail-onboarding.xpi'
        }
        foreach ($xpiFile in $extensions.Keys) {
            $xpiPath = Join-Path $extDir $xpiFile
            if (Test-Path $xpiPath) {
                $fileUri = 'file:///' + $xpiPath.Replace('\', '/')
                $policiesJson = $policiesJson.Replace($extensions[$xpiFile], $fileUri)
                Write-Log "Extension $xpiFile install_url set to: $fileUri"
            }
        }
        Set-Content -Path $policiesPath -Value $policiesJson -NoNewline
        Write-Log 'policies.json updated with local file:/// URLs.'
    }
} else {
    Write-Log 'WARNING: No distribution directory found in staging.'
}

Write-Log 'OSMail Thunderbird installation completed successfully.'
exit 0
