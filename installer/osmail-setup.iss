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
  TBVersion: String;

function GetMSIName(Param: String): String;
begin
  Result := 'Thunderbird Setup ' + TBVersion + '.msi';
end;

function InitializeSetup(): Boolean;
begin
  TBVersion := '';
  Result := True;
end;

function ReadFileAsString(FileName: String): String;
var
  Lines: TArrayOfString;
  I: Integer;
begin
  Result := '';
  if LoadStringsFromFile(FileName, Lines) then
    for I := 0 to GetArrayLength(Lines) - 1 do
    begin
      if I > 0 then
        Result := Result + #13#10;
      Result := Result + Lines[I];
    end;
end;

procedure WriteStringToFile(FileName: String; Content: String);
var
  Lines: TArrayOfString;
begin
  SetArrayLength(Lines, 1);
  Lines[0] := Content;
  SaveStringsToFile(FileName, Lines, False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  PoliciesFile: String;
  PoliciesContent: String;
  ExtDir: String;
  ThemeXPI: String;
  OnboardingXPI: String;
  ThemeURI: String;
  OnboardingURI: String;
begin
  if CurStep = ssPostInstall then
  begin
    { Read version }
    TBVersion := Trim(ReadFileAsString(ExpandConstant('{tmp}\.thunderbird-version')));

    { Rewrite policies.json with file:/// URLs }
    PoliciesFile := ExpandConstant('{app}\distribution\policies.json');
    if FileExists(PoliciesFile) then
    begin
      PoliciesContent := ReadFileAsString(PoliciesFile);
      ExtDir := ExpandConstant('{app}\distribution\extensions');

      ThemeXPI := ExtDir + '\osmail-theme@osmail.ca.xpi';
      OnboardingXPI := ExtDir + '\osmail-onboarding@osmail.ca.xpi';

      if FileExists(ThemeXPI) then
      begin
        ThemeURI := 'file:///' + ThemeXPI;
        StringChange(ThemeURI, '\', '/');
        StringChange(PoliciesContent,
          'https://github.com/easier-digital/osmail-thunderbird/releases/latest/download/osmail-theme.xpi',
          ThemeURI);
      end;

      if FileExists(OnboardingXPI) then
      begin
        OnboardingURI := 'file:///' + OnboardingXPI;
        StringChange(OnboardingURI, '\', '/');
        StringChange(PoliciesContent,
          'https://github.com/easier-digital/osmail-thunderbird/releases/latest/download/osmail-onboarding.xpi',
          OnboardingURI);
      end;

      WriteStringToFile(PoliciesFile, PoliciesContent);
    end;
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpReady then
  begin
    if TBVersion = '' then
    begin
      ExtractTemporaryFile('.thunderbird-version');
      TBVersion := Trim(ReadFileAsString(ExpandConstant('{tmp}\.thunderbird-version')));
    end;
  end;
end;

[Icons]
Name: "{autodesktop}\OSMail"; Filename: "{app}\thunderbird.exe"; Comment: "OSMail Thunderbird"
