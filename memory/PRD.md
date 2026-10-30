# Crypto Conex — PRD

## Original problem statement
CRYPTO CONEX — PLATAFORMA COMPLETA DE ASSISTÊNCIA DIGITAL REMOTA. Plataforma legítima e transparente de assistência remota para pessoas com baixa literacia digital / limitações motoras. Quatro componentes integrados: (1) CRM web de gestão (auth obrigatória, Super Admin / Técnico, dashboard, fila em tempo real, atribuição/transferência, CONFIGURAÇÕES com gestão de técnicos, links individuais aleatórios com validade/revogação, DISPOSITIVOS com renomear/eliminar/pesquisa/filtro/histórico, visualizador WebRTC com zoom e painel lateral, "ATIVAR MODO DE PRIVACIDADE" → cliente vê "Ajuste Técnico — Aguarde..."); (2) Página pública Connect (logo, "Bem-vindo ao Crypto Conex", "Vamos ajudar-te a resolver o teu problema", botão CONECTAR → getDisplayMedia + WebRTC, botão DESCARREGAR APLICAÇÃO por SO, nota de privacidade); (3) App Android nativa (MediaProjection, MediaCodec H.264, WebRTC, AccessibilityService, Foreground Service, WakeLock/WifiLock); (4) App Windows C#/.NET (Desktop Duplication, user32.dll, System Tray, instalador). pt-PT, DD/MM/AAAA, 24h, Europe/Lisbon, relógio de Lisboa em tempo real. Paleta cinzento-escuro + verde-limão + branco, logótipo fornecido. Rodapé CRM: "Criado por Victor Silva (Rafael Amorim)". Salas admin:global, technician:{id}, device:{id}, session:{id}; eventos device:*, support:*, session:*, webrtc:*, remote:command, accessibility:tree, privacy:*. Coleções users, devices, sessions, supportRequests, technicianLinks, auditLogs, systemSettings. STUN/TURN metered.ca via env apenas. Repositório organizado para GitHub com docs. Sem funcionalidades ocultas, sem contorno de permissões.
User choices: tudo web funcional aqui + apps nativas como código-fonte; backend em FastAPI (equivalente); Super Admin garciafinancas0073040@proton.me; clientes sem conta (só CONECTAR).

## Architecture
- backend/ FastAPI: server.py (REST), realtime.py (WebSocket hub com salas + validação de eventos), core.py (DB, auth Clerk→users, device JWT, ICE), clerk_auth.py
- Auth: Emergent-managed Clerk (email+password, rotação de tokens, reset). Acesso só para ADMIN_EMAIL ou perfis criados pelo Super Admin.
- frontend/ React: `/` e `/assistir/:token` (Connect), `/sign-in`, `/sign-up`, `/crm/*` (Dashboard, Fila, Atendimentos, Viewer, Dispositivos, Links, Configurações)
- android/ Kotlin; windows/ C# .NET 8 + Inno Setup; docs/; .github/workflows/native-release.yml

## User personas
Super Admin (gestão global), Técnico (atende sessões atribuídas), Cliente assistido (sem conta, botão único).

## Implemented (2026-10-30)
- Backend completo: dispositivos, pedidos, sessões (consentimento, operações, privacidade), atribuição/transferência/aceitar/rejeitar/terminar, técnicos CRUD + palavra-passe via Clerk + atividade, links, settings, auditoria, retenção, rate limiting, ICE via env, expiração de pedidos de dispositivos offline (5 min)
- WebRTC navegador → técnico verificado E2E (TURN), chat bidirecional, modo de privacidade, reconexão
- Isolamento de técnicos testado (404/403)
- Apps nativas Android/Windows (código-fonte, não compiladas aqui)
- Testing iteration_1: backend 25/26 → bug de rename corrigido; frontend join-loop WebRTC corrigido

## Backlog
- P0: compilar e testar APK e instalador em equipamentos físicos; publicar GitHub Release e definir ANDROID_DOWNLOAD_URL/WINDOWS_DOWNLOAD_URL
- P1: credenciais TURN temporárias (METERED_API_KEY); audit actor por email; pub/sub Redis para múltiplos processos
- P2: UI Automation IsPassword no Windows; dividir server.py em routers

## Next tasks
- Owner regista-se em /sign-up com o email admin; criar técnicos reais

## Update 2026-10-30 (iteração 5)
- Removido botão "TERMINAR ASSISTÊNCIA" do ecrã de privacidade Android (fim continua possível pela notificação e pelo botão da app)
- Corrigida imagem congelada: todos os fotogramas enviados como I420 com relógio monotónico único; MAINTAIN_FRAMERATE, 300 kbps–2,5 Mbps, 15 fps

## Update 2026-10-30 (iteração 4)
- Corrigido ecrã preto (0 fps) no Android: MediaProjection só emite fotogramas quando o ecrã muda; ScreenShareService agora guarda cópia I420 do último fotograma e reenvia a cada 250 ms
- Visualizador: ontrack com fallback de MediaStream + play() explícito

## Update 2026-10-30 (iteração 3)
- Consola ao Vivo em /crm (3 colunas: aparelhos ligados com pré-visualização JPEG a cada 3 s + renomear inline, visualizador ao vivo com ecrã inteiro/zoom, painel Comandos/Acessib./Logs com grelha de navegação, coordenadas X,Y, texto e mensagem guiada); contadores no cabeçalho; sem fila de espera (um clique = POST /requests/{id}/start)
- Modo de privacidade controlado só pelo técnico (ativar/desativar); cliente mantém só TERMINAR
- Windows: removido o banner sobre o ecrã; DPI PerMonitorV2 (coordenadas corretas); pré-visualização; overlay sem botão de desligar
- Android: coordenadas com tamanho real do ecrã, swipe horizontal, duplo toque, pré-visualização via VideoSink; limitação: o overlay de privacidade é capturado pelo MediaProjection (sem API pública para o excluir)
- Clique no vídeo mapeado ao conteúdo real (letterbox/zoom)
- Corrigida condição de corrida (pedido reclamado de forma atómica → 409)
- Testing iteration_2: backend 32/33 → corrigido; frontend 100%

## Update 2026-10-30 (iteração 2)
- Apps nativas compiladas com sucesso neste ambiente: Android `assembleRelease` (APK 48 MB) e Windows `dotnet publish` (exe self-contained); corrigido erro de tipos em DesktopDuplicator.cs
- Workflow GitHub `native-release.yml`: em cada push (android/, windows/) ou manual → APK + instalador Inno Setup → GitHub Release "latest" com CryptoConex.apk / CryptoConexSetup.exe
- Repositório: https://github.com/conexioncriptexpt/Atualizarapp2 ; botão DESCARREGAR aponta para releases/latest/download/... (Android/Windows por SO)
- APK assinado com keystore próprio se os secrets existirem, senão com chave de desenvolvimento; URL do backend por omissão = pré-visualização, sobreponível com a variável CC_BACKEND_URL
- Gerador local de palavra-passe forte aleatória (24 caracteres, crypto.getRandomValues) na página /sign-up
