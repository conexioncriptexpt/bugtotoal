; Inno Setup script — builds SuporteTecnicoSetup.exe
; 1) dotnet publish windows/CryptoConex -c Release
; 2) iscc windows/installer/CryptoConex.iss
#define AppVersion "1.0.0"

[Setup]
AppId={{8C1E7E1B-6E4B-4E0C-9A57-0C0C0E0C0E01}
AppName=Suporte Técnico Avançado
AppVersion={#AppVersion}
AppPublisher=Suporte Técnico Avançado
DefaultDirName={autopf}\Suporte Tecnico Avancado
DefaultGroupName=Suporte Técnico Avançado
OutputBaseFilename=SuporteTecnicoSetup
SetupIconFile=..\CryptoConex\Assets\app.ico
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
WizardStyle=modern
UninstallDisplayIcon={app}\CryptoConex.exe

[Languages]
Name: "pt"; MessagesFile: "compiler:Languages\Portuguese.isl"

[Files]
Source: "..\CryptoConex\bin\Release\net8.0-windows10.0.19041.0\win-x64\publish\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{group}\Suporte Técnico Avançado"; Filename: "{app}\CryptoConex.exe"
Name: "{autodesktop}\Suporte Técnico Avançado"; Filename: "{app}\CryptoConex.exe"

[Run]
Filename: "{app}\CryptoConex.exe"; Description: "Abrir o Suporte Técnico Avançado"; Flags: nowait postinstall skipifsilent
