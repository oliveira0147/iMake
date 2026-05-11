[Setup]
AppId={{D8D5B3F6-74DD-4C0B-8B2A-9B1C7C0C7A4A}
AppName=IMake Print Agent
AppVersion=0.1.0
DefaultDirName={autopf}\IMake Print Agent
DefaultGroupName=IMake Print Agent
DisableProgramGroupPage=yes
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\IMakePrintAgent.exe
OutputDir=..\release
OutputBaseFilename=IMakePrintAgentInstaller
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64

[Files]
Source: "..\release\IMakePrintAgent.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "icon.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\IMake Print Agent"; Filename: "{app}\IMakePrintAgent.exe"; IconFilename: "{app}\icon.ico"

[Run]
Filename: "{app}\IMakePrintAgent.exe"; Description: "Iniciar IMake Print Agent"; Flags: nowait postinstall skipifsilent

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "IMakePrintAgent"; ValueData: """{app}\IMakePrintAgent.exe"""; Flags: uninsdeletevalue
