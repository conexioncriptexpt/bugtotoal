# Guia de produção e segurança

## Checklist
- HTTPS/WSS obrigatório (o ingress/proxy termina TLS; as apps nativas usam `https://` e `wss://`; `usesCleartextTraffic=false` no Android).
- Segredos apenas em variáveis de ambiente (`.env.example` lista todas). Nunca no Git, no frontend ou nos binários.
- `CORS_ORIGINS` restrito ao seu domínio.
- `DEVICE_JWT_SECRET` aleatório e longo; rodar periodicamente (invalida tokens de dispositivo, que se renovam ao carregar CONECTAR).
- TURN: preferir credenciais temporárias (`METERED_DOMAIN` + `METERED_API_KEY`). As credenciais estáticas, se usadas, só são entregues a dispositivos/técnicos autenticados via `/api/ice-servers`.
- Retenção: definida em Configurações → Sistema (por omissão 365 dias). Aplicada no arranque do backend (registos de auditoria e operações de sessões antigas).
- Consentimento registado em `sessions.consent` + `audit_logs` (`consentimento.atualizado`).
- Autenticação do CRM: palavras-passe com hashing, tokens de curta duração com rotação, limitação de tentativas e recuperação de palavra-passe — fornecidos pelo serviço de autenticação gerido. O acesso só é concedido a emails com perfil criado pelo Super Admin (ou listados em `ADMIN_EMAIL`).
- Isolamento: técnicos só veem sessões/pedidos/dispositivos associados; tentativas a sessões alheias devolvem 404 (REST) ou `error` (WebSocket).

## Escalabilidade
O hub de salas é em memória (1 processo). Para vários processos/servidores, substituir `realtime.Hub.emit` por um
adaptador pub/sub (Redis) — a interface `join/leave/emit` mantém-se.

## Limitações conhecidas (honestas)
- **Navegador**: o navegador só permite partilhar o ecrã; não permite controlo remoto do rato/teclado. O modo de privacidade no navegador cobre apenas a página Crypto Conex (o ecrã partilhado continua visível ao técnico). Para controlo assistido, usar as apps nativas.
- **Android no navegador**: a maioria dos navegadores Android não suporta `getDisplayMedia`; a página mostra o download da app.
- **Windows**: o ecrã seguro (UAC, Ctrl+Alt+Del, ecrã de bloqueio) não é capturável nem controlável — por desenho do Windows e intencionalmente não contornado. O modo de privacidade usa `WDA_EXCLUDEFROMCAPTURE` (Windows 10 2004+).
- **Android**: o modo de privacidade e o controlo exigem que o utilizador ative o serviço de acessibilidade. Campos de palavra-passe/financeiros não são lidos nem preenchidos.
- As apps nativas não foram compiladas nem testadas neste ambiente (não há Android SDK/Windows). Devem ser compiladas e testadas em equipamentos físicos (ver ANDROID.md e WINDOWS.md).
