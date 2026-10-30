# Crypto Conex PC (Windows)

C# / .NET 8 WinForms. Windows 10 2004+ (x64).

## Compilar
```powershell
winget install Microsoft.DotNet.SDK.8
cd windows\CryptoConex
notepad appsettings.json        # BackendUrl = https://o-seu-dominio.pt
dotnet publish -c Release       # executável self-contained single-file
winget install JRSoftware.InnoSetup
iscc ..\installer\CryptoConex.iss  # -> installer\Output\CryptoConexSetup.exe
```
Recomenda-se assinar o executável e o instalador com um certificado de assinatura de código (evita avisos SmartScreen).

## Módulos
- `DesktopDuplicator.cs` — Desktop Duplication API (DXGI/D3D11 via Vortice) → frames BGRA.
- `WebRtcSession.cs` — SIPSorcery WebRTC, codificação VP8 (libvpx), taxa de frames adaptada às perdas reportadas (RTCP).
- `InputController.cs` — P/Invoke `user32.dll` `SendInput`/`SetCursorPos`: mover, clicar, scroll, texto Unicode, atalhos de lista branca.
- `SignalingClient.cs` — WebSocket seguro com reconexão exponencial.
- `Overlays.cs` — banner sempre visível "Assistência remota ativa" com TERMINAR; modo de privacidade (`WDA_EXCLUDEFROMCAPTURE`).
- `Program.cs` — UI mínima (CONECTAR/TERMINAR), System Tray, notificações, consentimento (só ver / ver e controlar).

Sem serviço em segundo plano, sem arranque automático, sem elevação de privilégios. Fechar a janela durante a sessão minimiza para a bandeja e mostra aviso; "Sair" termina tudo.

Link de técnico: `CryptoConex.exe --link=<token>`.
