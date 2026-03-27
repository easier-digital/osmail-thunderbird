# OSMail Thunderbird Distribution

Pre-configured Thunderbird installer for enterprise deployment via Atera RMM.

## What It Does

Produces a Windows wrapper installer (PowerShell + official Thunderbird MSI) that installs Thunderbird with:

- Enterprise `policies.json` locking settings
- OSMail branded WebExtension theme
- [thunderbird-custom-idp](https://github.com/raa-org/thunderbird-custom-idp) add-on for Authentik OIDC (IMAP/SMTP OAuth2)
- OAuth patch pointing at `https://auth.osmail.ca`
- Update control via GitHub Releases

## Infrastructure

| Service | Hostname |
|---------|----------|
| Mail (IMAP/SMTP) | mx.osmail.ca |
| Authentik (OIDC) | auth.osmail.ca |
| Nextcloud (CalDAV/CardDAV) | hub.osmail.ca |
| Autoconfig | autoconfig.osmail.ca |

## Setup

1. Create the `thunderbird` OAuth2/OIDC application in Authentik at `https://auth.osmail.ca` with redirect URI `https://localhost`.
2. Set the `OAUTH_CLIENT_SECRET` GitHub Actions secret with the client secret from step 1.
3. Place a 64x64 PNG logo at `theme/icons/logo.png`.
4. Host `autoconfig/config-v1.1.xml` at `https://autoconfig.osmail.ca/mail/config-v1.1.xml`.
5. Trigger the first build: `gh workflow run build.yml`
6. After the first release, update `__THEME_XPI_URL__` in `policies.json` with the theme XPI asset URL.

## Deployment via Atera RMM

```powershell
$release = Invoke-RestMethod "https://api.github.com/repos/easier-digital/osmail-thunderbird/releases/latest"
$asset = $release.assets | Where-Object { $_.name -like "*.zip" } | Select-Object -First 1
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile "$env:TEMP\tb-osmail.zip"
Expand-Archive -Path "$env:TEMP\tb-osmail.zip" -DestinationPath "$env:TEMP\tb-osmail" -Force
& "$env:TEMP\tb-osmail\install.ps1"
```

## Pipelines

- **check-upstream.yml** — Weekly (Monday 08:00 UTC) check for new Thunderbird releases (>= 140.0). Auto-bumps `.thunderbird-version` and triggers build.
- **build.yml** — Builds theme XPI, downloads Thunderbird MSI, assembles installer package, and creates a GitHub Release on `main`.
