# Crypto Conex — Plataforma de Assistência Digital Remota

Assistência técnica remota **transparente e autorizada** para pessoas com baixa literacia digital ou limitações motoras.
Toda a captura de ecrã e controlo assistido exige consentimento explícito do proprietário do dispositivo, mostra sempre
um indicador visível e termina de imediato quando o cliente carrega em **TERMINAR**.

## Componentes

| Pasta | Componente | Estado |
|---|---|---|
| `backend/` | API + sinalização em tempo real (FastAPI, WebSocket com salas, MongoDB) | Operacional |
| `frontend/` | **CRM** (`/crm`) + **Página pública Connect** (`/` e `/assistir/<token>`) — React + Tailwind | Operacional |
| `android/` | Crypto Conex Mobile — Kotlin nativo (MediaProjection, WebRTC H.264/MediaCodec, AccessibilityService, Foreground Service) | Código-fonte para compilar no Android Studio |
| `windows/` | Crypto Conex PC — C#/.NET 8 (Desktop Duplication API, WebRTC, user32 SendInput, System Tray) + instalador Inno Setup | Código-fonte para compilar no Windows |
| `docs/` | API, protocolo de eventos, produção, segurança | — |

> Nota de arquitetura: o backend foi implementado em **Python/FastAPI** (em vez de Node.js/Express) porque é o motor
> suportado no ambiente de alojamento. A lógica é a mesma pedida: salas `admin:global`, `technician:{id}`,
> `device:{id}`, `session:{id}`, os mesmos nomes de eventos e sinalização WebRTC. O CRM e a página pública vivem na mesma
> aplicação React (`frontend/`), em rotas separadas.

## Execução local

```bash
# Backend
cd backend && pip install -r requirements.txt
cp ../.env.example .env   # preencher valores
uvicorn server:app --host 0.0.0.0 --port 8001

# Frontend (CRM + Connect)
cd frontend && yarn install
echo "REACT_APP_BACKEND_URL=http://localhost:8001" > .env
yarn start
```

## Primeiro acesso
1. Defina `ADMIN_EMAIL` no backend (emails separados por vírgula).
2. Abra `/sign-up`, registe-se com esse email e defina a sua palavra-passe → torna-se **Super Admin**.
3. Em **Configurações → Técnicos** crie os perfis dos técnicos. Cada técnico regista-se em `/sign-up` com o email criado.
   Emails sem perfil não têm acesso ao CRM.

## Android
```bash
cd android
gradle assembleRelease -PCC_BACKEND_URL=https://o-seu-dominio.pt
```
Ver `docs/ANDROID.md`.

## Windows
```powershell
cd windows\CryptoConex
# editar appsettings.json -> BackendUrl
dotnet publish -c Release
iscc ..\installer\CryptoConex.iss   # gera CryptoConexSetup.exe
```
Ver `docs/WINDOWS.md`.

## Publicar as apps no GitHub (um clique para o cliente)
1. Envie este projeto para `https://github.com/conexioncriptexpt/Atualizarapp2` (botão "Save to GitHub" da Emergent).
2. O workflow **native-release** corre sozinho (ou em Actions → native-release → Run workflow) e cria uma Release com
   `CryptoConex.apk` e `CryptoConexSetup.exe`.
3. O botão **DESCARREGAR APLICAÇÃO** do site já aponta para
   `https://github.com/conexioncriptexpt/Atualizarapp2/releases/latest/download/CryptoConex.apk` (Android) e
   `.../CryptoConexSetup.exe` (Windows), escolhidos automaticamente pelo sistema do visitante.
4. Depois de publicar o site num domínio próprio, defina em GitHub → Settings → Secrets and variables → Actions →
   Variables: `CC_BACKEND_URL=https://o-seu-dominio.pt` e volte a correr o workflow (as apps usam o URL de pré-visualização por omissão).
5. Opcional (assinatura própria do APK): secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
   Sem eles o APK é assinado com chave de desenvolvimento (instala normalmente; o Android pede para permitir "fontes desconhecidas").

## Downloads na página pública
Configure `ANDROID_DOWNLOAD_URL` e `WINDOWS_DOWNLOAD_URL` no backend (ex.: assets de uma GitHub Release).
O workflow `.github/workflows/native-release.yml` compila o APK e o instalador e anexa-os à release (tag `v*`).

Documentação: `docs/API.md`, `docs/PRODUCAO.md`, `docs/ANDROID.md`, `docs/WINDOWS.md`.

Criado por Victor Silva (Rafael Amorim)
