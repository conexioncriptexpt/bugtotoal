# API e protocolo em tempo real

Base: `https://<dominio>/api`. Respostas JSON; datas em ISO-8601 UTC (o CRM apresenta em Europe/Lisbon, DD/MM/AAAA, 24 h).

## Autenticação
- **CRM**: `Authorization: Bearer <token de sessão>` (JWT de curta duração com renovação automática e rotação, gerido pelo fornecedor de autenticação). O papel (`super_admin`/`technician`) é lido da base de dados em cada pedido.
- **Dispositivos**: `POST /public/connect` devolve `device_token` (JWT HS256, 4 h). Enviar com `Authorization: Bearer <device_token>` + `x-client-kind: device`.

## Endpoints públicos
| Método | Caminho | Descrição |
|---|---|---|
| GET | `/public/config` | URLs de download Android/Windows |
| GET | `/public/link/{token}` | Valida link de técnico (não dá acesso a nada) |
| POST | `/public/connect` | Regista/recupera dispositivo, cria pedido de assistência. Rate limit 10/min/IP |
| POST | `/public/cancel` | (device) cancela pedido / termina sessão |
| GET | `/ice-servers` | (device ou técnico) servidores STUN/TURN |

## CRM
| Método | Caminho | Acesso |
|---|---|---|
| GET | `/me` | autenticado |
| GET | `/dashboard/stats` | autenticado (âmbito por papel) |
| GET | `/requests?status=pending` | admin: todos · técnico: só pedidos dos seus links |
| POST | `/requests/{id}/assign` `{technician_id}` | super admin |
| POST | `/requests/{id}/take` | admin ou técnico destinatário do link |
| POST | `/requests/{id}/cancel` | super admin |
| GET | `/sessions?status=open\|ended\|all&device_id=` | técnico: só as suas |
| GET | `/sessions/{id}` | técnico atribuído ou super admin (404 caso contrário) |
| POST | `/sessions/{id}/accept` · `/reject` | técnico atribuído |
| POST | `/sessions/{id}/transfer` `{technician_id}` | super admin |
| POST | `/sessions/{id}/end` | técnico atribuído ou super admin |
| GET/POST/PATCH/DELETE | `/technicians[/{id}]` | super admin (GET reduzido para técnicos) |
| POST | `/technicians/{id}/password` `{password}` | super admin |
| GET | `/technicians/{id}/activity` | super admin |
| GET/POST | `/links` · POST `/links/{id}/revoke` | técnico: os seus · admin: todos |
| GET | `/devices?q=&os_filter=&status=` · PATCH/DELETE `/devices/{id}` | DELETE só super admin |
| GET/PUT | `/settings` · GET `/audit` | super admin |

## WebSocket `wss://<dominio>/api/ws?kind=user|device&token=...`
Mensagens: `{"event": "...", "data": {...}}`. Salas: `admin:global`, `technician:{id}`, `device:{id}`, `session:{id}`.

Servidor → clientes: `connected`, `device:online`, `device:offline`, `support:request`, `support:assigned`,
`support:accepted`, `support:rejected`, `support:cancelled`, `session:started`, `session:ended`, `session:status`,
`session:transferred`, `session:operation`, `technician:joined`, `technician:presence`, `privacy:enabled`,
`privacy:disabled`, `privacy:disable-requested`, `chat:message`, `accessibility:tree`, `remote:command`, `error`.

Clientes → servidor (todos validados: identidade, associação sessão/dispositivo/técnico, estado e consentimento):
| Evento | Quem | Regras |
|---|---|---|
| `session:join` | técnico | sessão atribuída (admin pode observar eventos) |
| `webrtc:offer` / `webrtc:answer` / `webrtc:ice-candidate` | device / técnico | sessão `active` |
| `consent:update` `{screen, control}` | device | só o próprio dispositivo |
| `remote:command` `{command:{type,...}}` | técnico | sessão ativa + `consent.control` + permissão `control` + lista branca de comandos/atalhos; texto bloqueado se `sensitive_focus` |
| `privacy:enable` / `privacy:disable` | técnico (pedido) / device (desliga) | permissão `privacy` |
| `session:status` | ambos | `connection_state`, `resolution`, `sensitive_focus`, `quality` |
| `chat:message` `{text}` | ambos | — |
| `accessibility:tree` `{tree}` | device | não é guardada |
| `session:end` | ambos | — |

Comandos permitidos: `pointer_move, click, double_click, right_click, long_press, swipe, scroll, text, key, shortcut, back, home, recents, a11y_action, request_tree`. Coordenadas `x`,`y` normalizadas (0–1).

## Coleções MongoDB
`users`, `devices`, `sessions` (inclui `operations` e `consent`), `support_requests`, `technician_links`, `audit_logs`, `system_settings` — com índices criados no arranque.
