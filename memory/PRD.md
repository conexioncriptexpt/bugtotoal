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
