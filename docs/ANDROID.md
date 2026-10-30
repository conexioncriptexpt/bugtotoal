# Crypto Conex Mobile (Android)

Kotlin nativo, minSdk 26, targetSdk 34.

## Compilar
1. Android Studio Koala+ (JDK 17). Abrir a pasta `android/`.
2. `./gradlew assembleDebug -PCC_BACKEND_URL=https://o-seu-dominio.pt` (ou definir em `gradle.properties`).
3. Release: criar keystore (fora do Git), configurar `signingConfigs` e `./gradlew assembleRelease`.
   (Se o wrapper não existir: `gradle wrapper --gradle-version 8.7`.)

## Fluxo
1. CONECTAR → diálogo do sistema MediaProjection (o utilizador escolhe partilhar).
2. Arranca `ScreenShareService` (Foreground Service tipo `mediaProjection`, notificação permanente com TERMINAR; WakeLock/WifiLock adquiridos e libertados no fim).
3. `POST /api/public/connect` (ID de instalação gerado pela app, sem fingerprinting) → token temporário; `GET /api/ice-servers`.
4. WebSocket de sinalização com reconexão exponencial.
5. Técnico aceita → diálogo de consentimento: "Só ver" ou "Ver e ajudar a tocar".
6. `technician:joined` → oferta WebRTC (codificador H.264 por hardware via MediaCodec quando disponível; resolução ≤1280 px e degradação BALANCED para se adaptar à rede).
7. Comandos remotos → `AssistAccessibilityService` (gestos `dispatchGesture`, ações globais, leitura da árvore de nós). Campos de palavra-passe / PIN / IBAN / cartão bloqueiam a escrita e são sinalizados ao servidor.

## Permissões (justificação)
| Permissão | Porquê |
|---|---|
| INTERNET, ACCESS_NETWORK_STATE, ACCESS_WIFI_STATE | ligação ao servidor e WebRTC |
| FOREGROUND_SERVICE, FOREGROUND_SERVICE_MEDIA_PROJECTION | manter a partilha ativa com notificação visível |
| POST_NOTIFICATIONS | mostrar a notificação de sessão ativa |
| WAKE_LOCK | evitar que a sessão caia com o ecrã bloqueado (só durante a sessão) |
| BIND_ACCESSIBILITY_SERVICE (do serviço) | ajuda por toque e leitura de ecrã, ativada pelo utilizador |

## Testes em equipamento físico
- Conceder/recusar MediaProjection; recusar → nada é enviado.
- Ativar/desativar o serviço de acessibilidade; sem ele os comandos não têm efeito.
- Terminar pela notificação, pela app e pelo CRM.
- Mudar de Wi-Fi para dados móveis durante a sessão (reconexão).
