; Inno Setup script — builds CryptoConexSetup.exe
; 1) dotnet publish windows/CryptoConex -c Release
; 2) iscc windows/installer/CryptoConex.iss
#define AppVersion "1.0.0"

[Setup]
AppId={{8C1E7E1B-6E4B-4E0C-9A57-0C0C0E0C0E01}
AppName=Crypto Conex PC
AppVersion={#AppVersion}
AppPublisher=Crypto Conex
DefaultDirName={autopf}\Crypto Conex
DefaultGroupName=Crypto Conex
OutputBaseFilename=CryptoConexSetup
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
Name: "{group}\Crypto Conex"; Filename: "{app}\CryptoConex.exe"
Name: "{autodesktop}\Crypto Conex"; Filename: "{app}\CryptoConex.exe"

[Run]
Filename: "{app}\CryptoConex.exe"; Description: "Abrir o Crypto Conex"; Flags: nowait postinstall skipifsilent
