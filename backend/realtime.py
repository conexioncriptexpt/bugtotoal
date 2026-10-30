import asyncio
from collections import defaultdict
from dataclasses import dataclass, field

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException

from core import db, log, now_iso, audit, identify, get_settings

ws_router = APIRouter()

ALLOWED_COMMANDS = {"pointer_move", "click", "double_click", "right_click", "long_press", "swipe", "scroll",
                    "text", "key", "shortcut", "back", "home", "recents", "a11y_action", "request_tree"}
ALLOWED_SHORTCUTS = {"ctrl+c", "ctrl+v", "ctrl+x", "ctrl+z", "ctrl+a", "ctrl+f", "alt+tab", "win+d",
                     "enter", "esc", "tab", "backspace", "delete", "up", "down", "left", "right"}
OPEN = ("assigned", "active")


@dataclass(eq=False)
class Conn:
    ws: WebSocket
    kind: str
    id: str
    role: str
    name: str = ""
    rooms: set = field(default_factory=set)


class Hub:
    def __init__(self):
        self.rooms = defaultdict(set)

    def join(self, conn: Conn, room: str):
        self.rooms[room].add(conn)
        conn.rooms.add(room)

    def leave(self, conn: Conn, room: str):
        self.rooms[room].discard(conn)
        conn.rooms.discard(room)

    def leave_all(self, conn: Conn):
        for r in list(conn.rooms):
            self.leave(conn, r)

    def clear_room(self, room: str):
        for c in list(self.rooms.get(room, ())):
            self.leave(c, room)

    def present(self, room: str) -> bool:
        return bool(self.rooms.get(room))

    def online_ids(self, prefix: str) -> set:
        return {r.split(":", 1)[1] for r, cs in self.rooms.items() if r.startswith(prefix) and cs}

    async def emit(self, room: str, event: str, data: dict, exclude: Conn | None = None):
        for c in list(self.rooms.get(room, ())):
            if c is exclude:
                continue
            try:
                await c.ws.send_json({"event": event, "data": data})
            except Exception:
                pass

    async def emit_many(self, rooms: list, event: str, data: dict, exclude: Conn | None = None):
        sent = set()
        for room in rooms:
            for c in list(self.rooms.get(room, ())):
                if c is exclude or c in sent:
                    continue
                sent.add(c)
                try:
                    await c.ws.send_json({"event": event, "data": data})
                except Exception:
                    pass


hub = Hub()


async def log_op(session_id: str, actor: str, kind: str, detail: str):
    op = {"at": now_iso(), "actor": actor, "type": kind, "detail": detail[:300]}
    await db.sessions.update_one({"id": session_id}, {"$push": {"operations": {"$each": [op], "$slice": -500}}})
    await hub.emit(f"session:{session_id}", "session:operation", {"session_id": session_id, **op})


def session_rooms(s: dict) -> list:
    return ["admin:global", f"technician:{s['technician_id']}", f"device:{s['device_id']}", f"session:{s['id']}"]


async def end_session(session_id: str, actor: str, reason: str = "terminada") -> dict:
    s = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    if s["status"] == "ended":
        return s
    ended = now_iso()
    await db.sessions.update_one({"id": session_id}, {"$set": {"status": "ended", "ended_at": ended, "privacy": False,
                                                                 "end_reason": reason, "connection_state": "terminada"}})
    await db.support_requests.update_one({"id": s["request_id"]}, {"$set": {"status": "closed", "closed_at": ended}})
    await db.devices.update_one({"id": s["device_id"]}, {"$set": {"last_technician_id": s["technician_id"],
                                                                    "last_technician_name": s.get("technician_name")}})
    await log_op(session_id, actor, "sessao", f"Sessão terminada por {actor} ({reason})")
    await audit(actor, "sessao.terminada", session_id, {"reason": reason})
    s.update({"status": "ended", "ended_at": ended})
    await hub.emit_many(session_rooms(s), "session:ended", {"session_id": session_id, "by": actor, "reason": reason})
    hub.clear_room(f"session:{session_id}")
    return s


async def _session_for(conn: Conn, session_id: str, statuses=OPEN, must_assigned=True) -> dict:
    s = await db.sessions.find_one({"id": session_id}, {"_id": 0}) if session_id else None
    if not s or s["status"] not in statuses:
        raise PermissionError("Sessão inexistente ou não ativa")
    if conn.kind == "device" and s["device_id"] != conn.id:
        raise PermissionError("Dispositivo não associado à sessão")
    if conn.kind == "user" and s["technician_id"] != conn.id and (must_assigned or conn.role != "super_admin"):
        raise PermissionError("Sessão não atribuída a este técnico")
    return s


async def on_join(conn, d, member):
    s = await _session_for(conn, d.get("session_id"), must_assigned=False)
    hub.join(conn, f"session:{s['id']}")
    if s["technician_id"] == conn.id and s["status"] == "active":
        await hub.emit(f"device:{s['device_id']}", "technician:joined",
                       {"session_id": s["id"], "technician_name": conn.name})
    await conn.ws.send_json({"event": "session:status", "data": {
        "session_id": s["id"], "device_connected": hub.present(f"device:{s['device_id']}"),
        "privacy": s.get("privacy", False), "consent": s.get("consent", {}), "status": s["status"]}})


async def on_signal(conn, d, member, event):
    s = await _session_for(conn, d.get("session_id"), statuses=("active",))
    await hub.emit(f"session:{s['id']}", event, d, exclude=conn)
    if conn.kind == "device":
        hub.join(conn, f"session:{s['id']}")


async def on_command(conn, d, member):
    if conn.kind != "user":
        raise PermissionError("Apenas técnicos enviam comandos")
    s = await _session_for(conn, d.get("session_id"), statuses=("active",))
    if not member.get("permissions", {}).get("control", True):
        raise PermissionError("Sem permissão de controlo")
    if not s.get("consent", {}).get("control"):
        raise PermissionError("O cliente não autorizou o controlo assistido")
    cmd = d.get("command") or {}
    ctype = cmd.get("type")
    if ctype not in ALLOWED_COMMANDS:
        raise PermissionError("Comando não permitido")
    if ctype == "shortcut" and str(cmd.get("keys", "")).lower() not in ALLOWED_SHORTCUTS:
        raise PermissionError("Atalho não permitido")
    if ctype == "text":
        limit = (await get_settings())["max_text_command_length"]
        if s.get("sensitive_focus"):
            raise PermissionError("Campo sensível ativo: escrita bloqueada (palavras-passe/dados financeiros)")
        if len(str(cmd.get("text", ""))) > limit:
            raise PermissionError("Texto demasiado longo")
    await hub.emit(f"device:{s['device_id']}", "remote:command", {"session_id": s["id"], "command": cmd})
    detail = ctype if ctype != "text" else f"text ({len(str(cmd.get('text', '')))} caracteres)"
    await log_op(s["id"], conn.name, "comando", detail)


async def on_privacy(conn, d, member, enable):
    if conn.kind != "user":
        raise PermissionError("Apenas o técnico controla o modo de privacidade")
    s = await _session_for(conn, d.get("session_id"), statuses=("active",))
    if not member.get("permissions", {}).get("privacy", True):
        raise PermissionError("Sem permissão para o modo de privacidade")
    await db.sessions.update_one({"id": s["id"]}, {"$set": {"privacy": enable}})
    event = "privacy:enabled" if enable else "privacy:disabled"
    await hub.emit_many([f"device:{s['device_id']}", f"session:{s['id']}"], event, {"session_id": s["id"]})
    await log_op(s["id"], conn.name, "privacidade",
                 "Modo de privacidade ativado" if enable else "Modo de privacidade desativado")


async def on_consent(conn, d, member):
    if conn.kind != "device":
        raise PermissionError("Só o cliente pode dar consentimento")
    s = await _session_for(conn, d.get("session_id"))
    consent = {"screen": bool(d.get("screen")), "control": bool(d.get("control")), "updated_at": now_iso()}
    await db.sessions.update_one({"id": s["id"]}, {"$set": {"consent": consent}})
    await hub.emit(f"session:{s['id']}", "session:status", {"session_id": s["id"], "consent": consent})
    await log_op(s["id"], "cliente", "consentimento",
                 f"Ecrã: {'sim' if consent['screen'] else 'não'} · Controlo: {'sim' if consent['control'] else 'não'}")
    await audit("cliente", "consentimento.atualizado", s["id"], consent)


async def on_status(conn, d, member):
    s = await _session_for(conn, d.get("session_id"))
    upd = {k: d[k] for k in ("connection_state", "resolution", "sensitive_focus", "quality") if k in d}
    if upd:
        await db.sessions.update_one({"id": s["id"]}, {"$set": upd})
    await hub.emit(f"session:{s['id']}", "session:status", {"session_id": s["id"], **upd}, exclude=conn)


async def on_chat(conn, d, member):
    s = await _session_for(conn, d.get("session_id"))
    text = str(d.get("text", ""))[:1000].strip()
    if not text:
        return
    who = conn.name if conn.kind == "user" else "cliente"
    msg = {"session_id": s["id"], "from": conn.kind, "name": who, "text": text, "at": now_iso()}
    await hub.emit_many([f"session:{s['id']}", f"device:{s['device_id']}"], "chat:message", msg)
    await log_op(s["id"], who, "mensagem", text)


async def on_tree(conn, d, member):
    if conn.kind != "device":
        raise PermissionError("Apenas o dispositivo envia a árvore de acessibilidade")
    s = await _session_for(conn, d.get("session_id"), statuses=("active",))
    await hub.emit(f"session:{s['id']}", "accessibility:tree", d, exclude=conn)


THUMBS: dict = {}


async def on_thumb(conn, d, member):
    if conn.kind != "device":
        raise PermissionError("Apenas o dispositivo envia prévias")
    img = str(d.get("image", ""))
    if not img.startswith("data:image/jpeg;base64,") or len(img) > 150_000:
        return
    THUMBS[conn.id] = {"device_id": conn.id, "image": img, "at": now_iso()}
    rooms = ["admin:global"]
    req = await db.support_requests.find_one({"device_id": conn.id, "status": {"$in": ["pending", "assigned", "accepted"]}}, {"_id": 0})
    if req and req.get("target_technician_id"):
        rooms.append(f"technician:{req['target_technician_id']}")
    s = await db.sessions.find_one({"device_id": conn.id, "status": {"$in": list(OPEN)}}, {"_id": 0, "technician_id": 1})
    if s:
        rooms.append(f"technician:{s['technician_id']}")
    await hub.emit_many(rooms, "device:thumbnail", THUMBS[conn.id])


async def on_end(conn, d, member):
    s = await _session_for(conn, d.get("session_id"))
    await end_session(s["id"], conn.name if conn.kind == "user" else "cliente", "terminada pelo cliente" if conn.kind == "device" else "terminada pelo técnico")


HANDLERS = {
    "session:join": on_join,
    "webrtc:offer": lambda c, d, m: on_signal(c, d, m, "webrtc:offer"),
    "webrtc:answer": lambda c, d, m: on_signal(c, d, m, "webrtc:answer"),
    "webrtc:ice-candidate": lambda c, d, m: on_signal(c, d, m, "webrtc:ice-candidate"),
    "remote:command": on_command,
    "privacy:enable": lambda c, d, m: on_privacy(c, d, m, True),
    "privacy:disable": lambda c, d, m: on_privacy(c, d, m, False),
    "consent:update": on_consent,
    "session:status": on_status,
    "chat:message": on_chat,
    "accessibility:tree": on_tree,
    "session:end": on_end,
    "device:thumbnail": on_thumb,
}


async def _device_online(conn: Conn):
    dev = await db.devices.find_one({"id": conn.id}, {"_id": 0})
    if not dev:
        raise HTTPException(status_code=404)
    conn.name = dev.get("name", "Dispositivo")
    await db.devices.update_one({"id": conn.id}, {"$set": {"online": True, "last_seen": now_iso()}})
    hub.join(conn, f"device:{conn.id}")
    s = await db.sessions.find_one({"device_id": conn.id, "status": {"$in": list(OPEN)}}, {"_id": 0})
    if s:
        hub.join(conn, f"session:{s['id']}")
        await hub.emit(f"session:{s['id']}", "session:status", {"session_id": s["id"], "device_connected": True}, exclude=conn)
    await hub.emit("admin:global", "device:online", {"device_id": conn.id})
    return s


async def _device_offline(conn: Conn):
    if hub.present(f"device:{conn.id}"):
        return
    THUMBS.pop(conn.id, None)
    await db.devices.update_one({"id": conn.id}, {"$set": {"online": False, "last_seen": now_iso()}})
    await hub.emit("admin:global", "device:offline", {"device_id": conn.id})
    s = await db.sessions.find_one({"device_id": conn.id, "status": {"$in": list(OPEN)}}, {"_id": 0})
    if s:
        await hub.emit(f"session:{s['id']}", "session:status", {"session_id": s["id"], "device_connected": False})


@ws_router.websocket("/api/ws")
async def ws_endpoint(ws: WebSocket, token: str = "", kind: str = "user"):
    await ws.accept()
    try:
        who = await identify(token, kind)
    except Exception:
        await ws.send_json({"event": "error", "data": {"message": "Autenticação inválida", "code": 401}})
        await ws.close(code=4401)
        return
    member = who["member"]
    conn = Conn(ws=ws, kind=who["kind"], id=who["id"], role=who["role"], name=(member or {}).get("name", ""))
    session = None
    if conn.kind == "device":
        session = await _device_online(conn)
    else:
        hub.join(conn, f"technician:{conn.id}")
        if conn.role == "super_admin":
            hub.join(conn, "admin:global")
        await hub.emit("admin:global", "technician:presence", {"technician_id": conn.id, "online": True})
    await ws.send_json({"event": "connected", "data": {"id": conn.id, "kind": conn.kind,
                                                       "session": session}})
    try:
        while True:
            msg = await ws.receive_json()
            event, data = msg.get("event"), msg.get("data") or {}
            if event == "ping":
                await ws.send_json({"event": "pong", "data": {}})
                continue
            handler = HANDLERS.get(event)
            if not handler:
                continue
            try:
                await handler(conn, data, member)
            except PermissionError as e:
                await ws.send_json({"event": "error", "data": {"message": str(e), "event": event}})
                log.warning(f"ws denied kind={conn.kind} id={conn.id} event={event} reason={e}")
    except (WebSocketDisconnect, RuntimeError):
        pass
    except Exception as e:
        log.warning(f"ws error {e}")
    finally:
        hub.leave_all(conn)
        if conn.kind == "device":
            await _device_offline(conn)
        elif not hub.present(f"technician:{conn.id}"):
            await hub.emit("admin:global", "technician:presence", {"technician_id": conn.id, "online": False})


async def expire_stale_requests(offline_minutes: int = 5):
    from core import ago_iso
    online = hub.online_ids("device:")
    stale = await db.devices.distinct("id", {"last_seen": {"$lt": ago_iso(minutes=offline_minutes)}})
    ids = [d for d in stale if d not in online]
    if not ids:
        return
    pending = await db.support_requests.find({"status": "pending", "device_id": {"$in": ids}}, {"_id": 0}).to_list(1000)
    for r in pending:
        await db.support_requests.update_one({"id": r["id"]}, {"$set": {"status": "cancelled", "closed_at": now_iso(), "close_reason": "dispositivo offline"}})
        rooms = ["admin:global"] + ([f"technician:{r['target_technician_id']}"] if r.get("target_technician_id") else [])
        await hub.emit_many(rooms, "support:cancelled", {"request_id": r["id"]})


async def heartbeat_loop():
    while True:
        await asyncio.sleep(60)
        online = list(hub.online_ids("device:"))
        if online:
            await db.devices.update_many({"id": {"$in": online}}, {"$set": {"last_seen": now_iso()}})
        try:
            await expire_stale_requests()
        except Exception as e:
            log.warning(f"expire_stale_requests failed {e}")
