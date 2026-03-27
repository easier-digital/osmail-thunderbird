; OSMail Thunderbird Installer — Inno Setup Script
; Produces a single OSMail-Setup.exe that installs Thunderbird + enterprise config

#define MyAppName "OSMail Thunderbird"
#define MyAppPublisher "Easier Digital"
#define MyAppURL "https://osmail.ca"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\Mozilla Thunderbird
DisableDirPage=yes
DisableProgramGroupPage=yes
OutputBaseFilename=OSMail-Setup
SetupIconFile=
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName={#MyAppName}
; Don't create uninstaller — Thunderbird has its own
CreateUninstallRegKey=no
UpdateUninstallLogAppName=no

[Messages]
WelcomeLabel1=Welcome to OSMail
WelcomeLabel2=This will install Thunderbird pre-configured for your OSMail account.%n%nEmail, calendar, and contacts will be set up automatically on first launch.
FinishedHeadingLabel=Setup Complete
FinishedLabel=Thunderbird has been installed with OSMail configuration.%n%nLaunch Thunderbird to complete your account setup.

[Files]
; Thunderbird MSI — extracted to temp, run silently
Source: "..\staging\*.msi"; DestDir: "{tmp}"; Flags: deleteafterinstall
; Distribution files — policies + extensions
Source: "..\staging\distribution\*"; DestDir: "{app}\distribution"; Flags: ignoreversion recursesubdirs createallsubdirs
; Version file
Source: "..\staging\.thunderbird-version"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Run]
; Install Thunderbird MSI silently
Filename: "msiexec.exe"; Parameters: "/i ""{tmp}\{code:GetMSIName}"" /qn INSTALL_MAINTENANCE_SERVICE=false DESKTOP_SHORTCUT=true TASKBAR_SHORTCUT=false REMOVE_DISTRIBUTION_DIR=false /L*v ""{tmp}\thunderbird-msi-install.log"""; StatusMsg: "Installing Thunderbird..."; Flags: runhidden waituntilterminated

[Code]
var
  TBVersion: AnsiString;

function GetMSIName(Param: String): String;
begin
  Result := 'Thunderbird Setup ' + TBVersion + '.msi';
end;

function InitializeSetup(): Boolean;
begin
  TBVersion := '';
  Result := True;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  VersionFile: String;
  PoliciesFile: String;
  PoliciesContent: AnsiString;
  ExtDir: AnsiString;
  ThemeXPI: AnsiString;
  OnboardingXPI: AnsiString;
  ThemeURI: AnsiString;
  OnboardingURI: AnsiString;
  GHTheme: AnsiString;
  GHOnboarding: AnsiString;
begin
  if CurStep = ssPostInstall then
  begin
    { Read version }
    VersionFile := ExpandConstant('{tmp}\.thunderbird-version');
    if FileExists(VersionFile) then
      LoadStringFromFile(VersionFile, TBVersion);
    TBVersion := Trim(TBVersion);

    { Rewrite policies.json with file:/// URLs }
    PoliciesFile := ExpandConstant('{app}\distribution\policies.json');
    if FileExists(PoliciesFile) then
    begin
      LoadStringFromFile(PoliciesFile, PoliciesContent);
      ExtDir := ExpandConstant('{app}\distribution\extensions');

      ThemeXPI := ExtDir + '\osmail-theme@osmail.ca.xpi';
      OnboardingXPI := ExtDir + '\osmail-onboarding@osmail.ca.xpi';

      if FileExists(ThemeXPI) then
      begin
        ThemeURI := 'file:///' + ThemeXPI;
        StringChangeEx(ThemeURI, '\', '/', True);
        GHTheme := 'https://github.com/easier-digital/osmail-thunderbird/releases/latest/download/osmail-theme.xpi';
        StringChangeEx(PoliciesContent, GHTheme, ThemeURI, True);
      end;

      if FileExists(OnboardingXPI) then
      begin
        OnboardingURI := 'file:///' + OnboardingXPI;
        StringChangeEx(OnboardingURI, '\', '/', True);
        GHOnboarding := 'https://github.com/easier-digital/osmail-thunderbird/releases/latest/download/osmail-onboarding.xpi';
        StringChangeEx(PoliciesContent, GHOnboarding, OnboardingURI, True);
      end;

      SaveStringToFile(PoliciesFile, PoliciesContent, False);
    end;
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  { Read version early for MSI filename }
  if CurPageID = wpReady then
  begin
    if TBVersion = '' then
    begin
      ExtractTemporaryFile('.thunderbird-version');
      LoadStringFromFile(ExpandConstant('{tmp}\.thunderbird-version'), TBVersion);
      TBVersion := Trim(TBVersion);
    end;
  end;
end;

[Icons]
Name: "{autodesktop}\OSMail"; Filename: "{app}\thunderbird.exe"; Comment: "OSMail Thunderbird"
