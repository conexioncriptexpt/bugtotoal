import os
import time
import asyncio
from collections import defaultdict, deque
from typing import Optional, Literal

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, EmailStr
from starlette.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from clerk_auth import clerk_router
from core import (db, log, client, now_iso, ago_iso, new_id, random_token, audit, current_member, require_super_admin,
                  create_device_token, any_caller, ice_servers, get_settings, clerk_set_password,
                  DEFAULT_PERMISSIONS, ENV, DEVICE_TOKEN_TTL)
from realtime import ws_router, hub, end_session, log_op, session_rooms, heartbeat_loop

app = FastAPI(title="Crypto Conex API")
api = APIRouter(prefix="/api")
NO_ID = {"_id": 0}


# ---------- rate limiting ----------
_hits = defaultdict(deque)


def rate_limit(key: str, limit: int, window: int = 60):
    q, now = _hits[key], time.time()
    while q and q[0] < now - window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(status_code=429, detail="Demasiados pedidos. Aguarde um momento.")
    q.append(now)


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "")


# ---------- models ----------
class ConnectIn(BaseModel):
    installation_id: str = Field(min_length=8, max_length=128)
    platform: Literal["web", "android", "windows"]
    os: str = Field(default="Desconhecido", max_length=60)
    os_version: str = Field(default="", max_length=60)
    client_name: str = Field(default="", max_length=80)
    link_token: Optional[str] = Field(default=None, max_length=64)
    screen: Optional[str] = Field(default=None, max_length=30)


class TechIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=2, max_length=80)
    role: Literal["technician", "super_admin"] = "technician"
    permissions: dict = Field(default_factory=lambda: dict(DEFAULT_PERMISSIONS))


class TechPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    active: Optional[bool] = None
    role: Optional[Literal["technician", "super_admin"]] = None
    permissions: Optional[dict] = None


class PasswordIn(BaseModel):
    password: str = Field(min_length=8, max_length=128)


class AssignIn(BaseModel):
    technician_id: str


class LinkIn(BaseModel):
    technician_id: Optional[str] = None
    expires_in_days: Optional[int] = Field(default=None, ge=0, le=3650)
    label: str = Field(default="", max_length=80)


class DevicePatch(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class SettingsIn(BaseModel):
    retention_days: int = Field(ge=7, le=3650)
    default_link_days: int = Field(ge=0, le=3650)
    sound_feedback: bool
    max_text_command_length: int = Field(ge=10, le=5000)


def public_user(u: dict) -> dict:
    return {k: u.get(k) for k in ("id", "email", "name", "role", "active", "permissions", "created_at", "linked_at")} | {
        "linked": bool(u.get("user_id")), "online": hub.present(f"technician:{u['id']}")}


def link_view(link: dict) -> dict:
    base = os.environ.get("PUBLIC_APP_URL", "").rstrip("/")
    return {**link, "url": f"{base}/assistir/{link['token']}"}


def link_valid(link: dict) -> bool:
    return not link.get("revoked") and (not link.get("expires_at") or link["expires_at"] > now_iso())


# ---------- public ----------
@api.get("/")
async def root():
    return {"service": "Crypto Conex", "status": "ok"}


@api.get("/public/config")
async def public_config():
    return {"android_download_url": os.environ.get("ANDROID_DOWNLOAD_URL", ""),
            "windows_download_url": os.environ.get("WINDOWS_DOWNLOAD_URL", ""),
            "sound_feedback": (await get_settings())["sound_feedback"]}


@api.get("/public/link/{token}")
async def public_link(token: str, request: Request):
    rate_limit(f"link:{client_ip(request)}", 30)
    link = await db.technician_links.find_one({"token": token}, NO_ID)
    if not link or not link_valid(link):
        return {"valid": False}
    tech = await db.users.find_one({"id": link["technician_id"], "active": True}, NO_ID)
    return {"valid": bool(tech), "technician_name": tech["name"] if tech else None}


@api.post("/public/connect")
async def public_connect(body: ConnectIn, request: Request):
    rate_limit(f"connect:{client_ip(request)}", 10)
    target_tech, link_id = None, None
    if body.link_token:
        link = await db.technician_links.find_one({"token": body.link_token}, NO_ID)
        if link and link_valid(link):
            tech = await db.users.find_one({"id": link["technician_id"], "active": True}, NO_ID)
            if tech:
                target_tech, link_id = tech, link["id"]
                await db.technician_links.update_one({"id": link["id"]}, {"$inc": {"uses": 1}, "$set": {"last_used_at": now_iso()}})
    dev = await db.devices.find_one({"installation_id": body.installation_id}, NO_ID)
    if not dev:
        dev = {"id": new_id(), "installation_id": body.installation_id,
               "name": body.client_name or f"{body.os} · {body.installation_id[:6]}", "platform": body.platform,
               "os": body.os, "os_version": body.os_version, "first_seen": now_iso(), "last_seen": now_iso(),
               "online": False, "client_name": body.client_name, "screen": body.screen,
               "last_technician_id": None, "last_technician_name": None, "consented_at": now_iso()}
        await db.devices.insert_one({**dev})
        dev.pop("_id", None)
        await audit("cliente", "dispositivo.registado", dev["id"], {"platform": body.platform})
    else:
        upd = {"os": body.os, "os_version": body.os_version, "platform": body.platform, "last_seen": now_iso(), "screen": body.screen}
        if body.client_name:
            upd["client_name"] = body.client_name
        await db.devices.update_one({"id": dev["id"]}, {"$set": upd})
        dev.update(upd)
    open_session = await db.sessions.find_one({"device_id": dev["id"], "status": {"$in": ["assigned", "active"]}}, NO_ID)
    req = await db.support_requests.find_one({"device_id": dev["id"], "status": {"$in": ["pending", "assigned", "accepted"]}}, NO_ID)
    if not req:
        req = {"id": new_id(), "device_id": dev["id"], "device_name": dev["name"], "platform": body.platform,
               "os": body.os, "client_name": body.client_name, "link_id": link_id,
               "target_technician_id": target_tech["id"] if target_tech else None,
               "target_technician_name": target_tech["name"] if target_tech else None,
               "status": "pending", "created_at": now_iso(), "session_id": None}
        await db.support_requests.insert_one({**req})
        req.pop("_id", None)
        await audit("cliente", "pedido.criado", req["id"], {"device_id": dev["id"]})
        rooms = ["admin:global"] + ([f"technician:{target_tech['id']}"] if target_tech else [])
        await hub.emit_many(rooms, "support:request", req)
    return {"device_id": dev["id"], "device_token": create_device_token(dev["id"]), "expires_in": DEVICE_TOKEN_TTL,
            "request": req, "session": open_session,
            "technician_name": target_tech["name"] if target_tech else None}


@api.post("/public/cancel")
async def public_cancel(caller: dict = Depends(any_caller)):
    if caller["kind"] != "device":
        raise HTTPException(status_code=403)
    res = await db.support_requests.find_one_and_update({"device_id": caller["id"], "status": "pending"},
                                                        {"$set": {"status": "cancelled", "closed_at": now_iso()}}, projection=NO_ID)
    if res:
        await hub.emit("admin:global", "support:cancelled", {"request_id": res["id"]})
        if res.get("target_technician_id"):
            await hub.emit(f"technician:{res['target_technician_id']}", "support:cancelled", {"request_id": res["id"]})
    s = await db.sessions.find_one({"device_id": caller["id"], "status": {"$in": ["assigned", "active"]}}, NO_ID)
    if s:
        await end_session(s["id"], "cliente", "terminada pelo cliente")
    return {"ok": True}


@api.get("/ice-servers")
async def get_ice(caller: dict = Depends(any_caller)):
    return {"iceServers": await run_in_threadpool(ice_servers)}


# ---------- me / dashboard ----------
@api.get("/me")
async def me(member: dict = Depends(current_member)):
    return public_user(member)


@api.get("/dashboard/stats")
async def stats(member: dict = Depends(current_member)):
    admin = member["role"] == "super_admin"
    sess_scope = {} if admin else {"technician_id": member["id"]}
    techs = await db.users.find({"active": True}, NO_ID).to_list(1000)
    busy_ids = set(await db.sessions.distinct("technician_id", {"status": {"$in": ["assigned", "active"]}}))
    online_techs = hub.online_ids("technician:")
    req_scope = {"status": "pending"} if admin else {"status": "pending", "target_technician_id": member["id"]}
    since = ago_iso(days=6)[:10]
    recent = await db.sessions.find({**sess_scope, "created_at": {"$gte": since}}, {"_id": 0, "created_at": 1}).to_list(5000)
    per_day = defaultdict(int)
    for s in recent:
        per_day[s["created_at"][:10]] += 1
    ended = await db.sessions.find({**sess_scope, "status": "ended", "started_at": {"$ne": None}},
                                   {"_id": 0, "started_at": 1, "ended_at": 1}).sort("ended_at", -1).to_list(200)
    from datetime import datetime
    durations = [(datetime.fromisoformat(s["ended_at"]) - datetime.fromisoformat(s["started_at"])).total_seconds()
                 for s in ended if s.get("ended_at") and s.get("started_at")]
    return {
        "devices_total": await db.devices.count_documents({}),
        "devices_online": len(hub.online_ids("device:")),
        "requests_pending": await db.support_requests.count_documents(req_scope),
        "sessions_active": await db.sessions.count_documents({**sess_scope, "status": {"$in": ["assigned", "active"]}}),
        "sessions_total": await db.sessions.count_documents(sess_scope),
        "technicians_available": len([t for t in techs if t["id"] in online_techs and t["id"] not in busy_ids]),
        "technicians_busy": len([t for t in techs if t["id"] in busy_ids]),
        "technicians_total": len(techs),
        "avg_duration_seconds": int(sum(durations) / len(durations)) if durations else 0,
        "sessions_per_day": [{"day": d, "count": c} for d, c in sorted(per_day.items())],
    }


# ---------- requests / sessions ----------
@api.get("/requests")
async def list_requests(status: str = "pending", member: dict = Depends(current_member)):
    q = {"status": status} if status != "all" else {}
    if member["role"] != "super_admin":
        q["target_technician_id"] = member["id"]
    items = await db.support_requests.find(q, NO_ID).sort("created_at", -1).to_list(500)
    online = hub.online_ids("device:")
    return [{**r, "device_online": r["device_id"] in online} for r in items]


async def _create_session(req: dict, tech: dict, actor: dict) -> dict:
    s = {"id": new_id(), "request_id": req["id"], "device_id": req["device_id"], "device_name": req.get("device_name"),
         "platform": req.get("platform"), "client_name": req.get("client_name"),
         "technician_id": tech["id"], "technician_name": tech["name"], "status": "assigned",
         "created_at": now_iso(), "started_at": None, "ended_at": None, "connection_state": "a aguardar",
         "consent": {"screen": req.get("platform") == "web", "control": False, "updated_at": now_iso()},
         "privacy": False, "sensitive_focus": False, "operations": [], "assigned_by": actor["name"]}
    await db.sessions.insert_one({**s})
    s.pop("_id", None)
    await db.support_requests.update_one({"id": req["id"]}, {"$set": {"status": "assigned", "session_id": s["id"],
                                                                     "assigned_to": tech["id"], "assigned_at": now_iso()}})
    await log_op(s["id"], actor["name"], "atribuicao", f"Atribuído a {tech['name']}")
    await audit(actor["email"], "pedido.atribuido", req["id"], {"technician_id": tech["id"], "session_id": s["id"]})
    await hub.emit_many(session_rooms(s), "support:assigned", {"request_id": req["id"], "session": s})
    return s


async def _active_tech(tid: str) -> dict:
    tech = await db.users.find_one({"id": tid, "active": True}, NO_ID)
    if not tech:
        raise HTTPException(status_code=404, detail="Técnico não encontrado ou inativo")
    return tech


@api.post("/requests/{rid}/assign")
async def assign_request(rid: str, body: AssignIn, admin: dict = Depends(require_super_admin)):
    req = await db.support_requests.find_one({"id": rid, "status": "pending"}, NO_ID)
    if not req:
        raise HTTPException(status_code=404, detail="Pedido não encontrado ou já atribuído")
    return await _create_session(req, await _active_tech(body.technician_id), admin)


@api.post("/requests/{rid}/take")
async def take_request(rid: str, member: dict = Depends(current_member)):
    q = {"id": rid, "status": "pending"}
    if member["role"] != "super_admin":
        q["target_technician_id"] = member["id"]
    req = await db.support_requests.find_one(q, NO_ID)
    if not req:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    return await _create_session(req, member, member)


@api.post("/requests/{rid}/cancel")
async def cancel_request(rid: str, admin: dict = Depends(require_super_admin)):
    r = await db.support_requests.find_one_and_update({"id": rid, "status": "pending"},
                                                      {"$set": {"status": "cancelled", "closed_at": now_iso()}}, projection=NO_ID)
    if not r:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    await hub.emit_many(["admin:global", f"device:{r['device_id']}"], "support:cancelled", {"request_id": rid})
    await audit(admin["email"], "pedido.descartado", rid)
    return {"ok": True}


async def _my_session(sid: str, member: dict) -> dict:
    q = {"id": sid}
    if member["role"] != "super_admin":
        q["technician_id"] = member["id"]
    s = await db.sessions.find_one(q, NO_ID)
    if not s:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    return s


@api.get("/sessions")
async def list_sessions(status: str = "all", technician_id: str = "", device_id: str = "", member: dict = Depends(current_member)):
    q = {}
    if status == "open":
        q["status"] = {"$in": ["assigned", "active"]}
    elif status != "all":
        q["status"] = status
    if member["role"] != "super_admin":
        q["technician_id"] = member["id"]
    elif technician_id:
        q["technician_id"] = technician_id
    if device_id:
        q["device_id"] = device_id
    items = await db.sessions.find(q, {"_id": 0, "operations": 0}).sort("created_at", -1).to_list(500)
    online = hub.online_ids("device:")
    return [{**s, "device_online": s["device_id"] in online} for s in items]


@api.get("/sessions/{sid}")
async def get_session(sid: str, member: dict = Depends(current_member)):
    s = await _my_session(sid, member)
    dev = await db.devices.find_one({"id": s["device_id"]}, {"_id": 0, "installation_id": 0})
    return {**s, "device": dev, "device_online": hub.present(f"device:{s['device_id']}")}


@api.post("/sessions/{sid}/accept")
async def accept_session(sid: str, member: dict = Depends(current_member)):
    s = await db.sessions.find_one({"id": sid, "technician_id": member["id"], "status": "assigned"}, NO_ID)
    if not s:
        raise HTTPException(status_code=404, detail="Sessão não encontrada ou não atribuída a si")
    started = now_iso()
    await db.sessions.update_one({"id": sid}, {"$set": {"status": "active", "started_at": started, "connection_state": "a ligar"}})
    await db.support_requests.update_one({"id": s["request_id"]}, {"$set": {"status": "accepted"}})
    s.update({"status": "active", "started_at": started})
    await log_op(sid, member["name"], "sessao", "Atendimento aceite e iniciado")
    await audit(member["email"], "sessao.iniciada", sid)
    await hub.emit_many(session_rooms(s), "support:accepted", {"session_id": sid, "technician_name": member["name"]})
    await hub.emit_many(session_rooms(s), "session:started", {"session_id": sid, "session": s})
    return s


@api.post("/sessions/{sid}/reject")
async def reject_session(sid: str, member: dict = Depends(current_member)):
    s = await db.sessions.find_one({"id": sid, "technician_id": member["id"], "status": "assigned"}, NO_ID)
    if not s:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    await db.sessions.update_one({"id": sid}, {"$set": {"status": "ended", "ended_at": now_iso(), "end_reason": "rejeitada"}})
    await db.support_requests.update_one({"id": s["request_id"]}, {"$set": {"status": "pending", "session_id": None, "assigned_to": None}})
    await log_op(sid, member["name"], "sessao", "Atendimento rejeitado; pedido voltou à fila")
    await audit(member["email"], "sessao.rejeitada", sid)
    req = await db.support_requests.find_one({"id": s["request_id"]}, NO_ID)
    await hub.emit_many(session_rooms(s), "support:rejected", {"session_id": sid, "request": req})
    return {"ok": True}


@api.post("/sessions/{sid}/transfer")
async def transfer_session(sid: str, body: AssignIn, admin: dict = Depends(require_super_admin)):
    s = await db.sessions.find_one({"id": sid, "status": {"$in": ["assigned", "active"]}}, NO_ID)
    if not s:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    tech = await _active_tech(body.technician_id)
    old_room = f"technician:{s['technician_id']}"
    await db.sessions.update_one({"id": sid}, {"$set": {"technician_id": tech["id"], "technician_name": tech["name"],
                                                       "status": "assigned", "privacy": False}})
    await db.support_requests.update_one({"id": s["request_id"]}, {"$set": {"assigned_to": tech["id"], "status": "assigned"}})
    for c in list(hub.rooms.get(f"session:{sid}", ())):
        if c.kind == "user":
            hub.leave(c, f"session:{sid}")
    await log_op(sid, admin["name"], "transferencia", f"Transferido de {s['technician_name']} para {tech['name']}")
    await audit(admin["email"], "sessao.transferida", sid, {"from": s["technician_id"], "to": tech["id"]})
    s.update({"technician_id": tech["id"], "technician_name": tech["name"], "status": "assigned"})
    await hub.emit_many(session_rooms(s) + [old_room], "session:transferred", {"session_id": sid, "session": s})
    return s


@api.post("/sessions/{sid}/end")
async def end_session_api(sid: str, member: dict = Depends(current_member)):
    s = await _my_session(sid, member)
    return await end_session(s["id"], member["name"], "terminada pelo técnico")


# ---------- technicians ----------
@api.get("/technicians")
async def list_techs(member: dict = Depends(current_member)):
    users = await db.users.find({"$or": [{"env": {"$in": [ENV, None]}}, {"user_id": None}]}, NO_ID).sort("created_at", 1).to_list(1000)
    busy = set(await db.sessions.distinct("technician_id", {"status": {"$in": ["assigned", "active"]}}))
    if member["role"] != "super_admin":
        return [{"id": u["id"], "name": u["name"], "role": u["role"]} for u in users if u.get("active")]
    return [{**public_user(u), "busy": u["id"] in busy} for u in users]


@api.post("/technicians")
async def create_tech(body: TechIn, admin: dict = Depends(require_super_admin)):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Já existe um perfil com este email")
    u = {"id": new_id(), "user_id": None, "email": email, "name": body.name, "role": body.role, "active": True,
         "permissions": {**DEFAULT_PERMISSIONS, **body.permissions}, "env": None, "created_at": now_iso()}
    await db.users.insert_one({**u})
    await audit(admin["email"], "tecnico.criado", u["id"], {"email": email})
    return public_user(u)


@api.patch("/technicians/{tid}")
async def update_tech(tid: str, body: TechPatch, admin: dict = Depends(require_super_admin)):
    u = await db.users.find_one({"id": tid}, NO_ID)
    if not u:
        raise HTTPException(status_code=404, detail="Perfil não encontrado")
    upd = body.model_dump(exclude_none=True)
    if tid == admin["id"] and (upd.get("active") is False or upd.get("role") == "technician"):
        raise HTTPException(status_code=409, detail="Não pode desativar ou despromover a sua própria conta")
    if "permissions" in upd:
        upd["permissions"] = {k: bool(upd["permissions"].get(k, v)) for k, v in DEFAULT_PERMISSIONS.items()}
    await db.users.update_one({"id": tid}, {"$set": upd})
    await audit(admin["email"], "tecnico.editado", tid, upd)
    return public_user({**u, **upd})


@api.delete("/technicians/{tid}")
async def delete_tech(tid: str, admin: dict = Depends(require_super_admin)):
    if tid == admin["id"]:
        raise HTTPException(status_code=409, detail="Não pode eliminar a sua própria conta")
    if await db.sessions.find_one({"technician_id": tid, "status": {"$in": ["assigned", "active"]}}):
        raise HTTPException(status_code=409, detail="O técnico tem atendimentos em curso. Transfira-os primeiro.")
    res = await db.users.delete_one({"id": tid})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Perfil não encontrado")
    await db.technician_links.update_many({"technician_id": tid}, {"$set": {"revoked": True}})
    await audit(admin["email"], "tecnico.eliminado", tid)
    return {"ok": True}


@api.post("/technicians/{tid}/password")
async def set_tech_password(tid: str, body: PasswordIn, admin: dict = Depends(require_super_admin)):
    u = await db.users.find_one({"id": tid}, NO_ID)
    if not u:
        raise HTTPException(status_code=404, detail="Perfil não encontrado")
    if not u.get("user_id"):
        raise HTTPException(status_code=409, detail="O técnico ainda não criou a conta. Peça-lhe para se registar com este email.")
    await run_in_threadpool(clerk_set_password, u["user_id"], body.password)
    await audit(admin["email"], "tecnico.palavra_passe_alterada", tid)
    return {"ok": True}


@api.get("/technicians/{tid}/activity")
async def tech_activity(tid: str, admin: dict = Depends(require_super_admin)):
    u = await db.users.find_one({"id": tid}, NO_ID)
    if not u:
        raise HTTPException(status_code=404, detail="Perfil não encontrado")
    sessions = await db.sessions.find({"technician_id": tid}, {"_id": 0, "operations": 0}).sort("created_at", -1).to_list(50)
    logs = await db.audit_logs.find({"$or": [{"actor": u["email"]}, {"target": tid}]}, NO_ID).sort("at", -1).to_list(50)
    return {"technician": public_user(u), "sessions": sessions, "audit": logs}


# ---------- links ----------
@api.get("/links")
async def list_links(member: dict = Depends(current_member)):
    q = {} if member["role"] == "super_admin" else {"technician_id": member["id"]}
    links = await db.technician_links.find(q, NO_ID).sort("created_at", -1).to_list(500)
    return [{**link_view(l), "valid": link_valid(l)} for l in links]


@api.post("/links")
async def create_link(body: LinkIn, member: dict = Depends(current_member)):
    tid = body.technician_id if member["role"] == "super_admin" and body.technician_id else member["id"]
    tech = await _active_tech(tid)
    days = body.expires_in_days if body.expires_in_days is not None else (await get_settings())["default_link_days"]
    from datetime import datetime, timezone, timedelta
    expires = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat() if days else None
    link = {"id": new_id(), "token": random_token(12), "technician_id": tid, "technician_name": tech["name"],
            "label": body.label, "created_at": now_iso(), "expires_at": expires, "revoked": False, "uses": 0,
            "last_used_at": None, "created_by": member["email"]}
    await db.technician_links.insert_one({**link})
    link.pop("_id", None)
    await audit(member["email"], "link.criado", link["id"], {"technician_id": tid})
    return {**link_view(link), "valid": True}


@api.post("/links/{lid}/revoke")
async def revoke_link(lid: str, member: dict = Depends(current_member)):
    q = {"id": lid} if member["role"] == "super_admin" else {"id": lid, "technician_id": member["id"]}
    res = await db.technician_links.update_one(q, {"$set": {"revoked": True, "revoked_at": now_iso()}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Link não encontrado")
    await audit(member["email"], "link.revogado", lid)
    return {"ok": True}


# ---------- devices ----------
async def _device_scope(member: dict) -> dict:
    if member["role"] == "super_admin":
        return {}
    ids = await db.sessions.distinct("device_id", {"technician_id": member["id"]})
    return {"id": {"$in": ids}}


@api.get("/devices")
async def list_devices(q: str = "", os_filter: str = "", status: str = "", member: dict = Depends(current_member)):
    query = await _device_scope(member)
    if q:
        import re
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"name": rx}, {"id": rx}, {"client_name": rx}, {"os": rx}]
    if os_filter:
        query["os"] = {"$regex": f"^{__import__('re').escape(os_filter)}", "$options": "i"}
    online = hub.online_ids("device:")
    items = await db.devices.find(query, {"_id": 0, "installation_id": 0}).sort("last_seen", -1).to_list(1000)
    items = [{**d, "online": d["id"] in online} for d in items]
    if status == "online":
        items = [d for d in items if d["online"]]
    elif status == "offline":
        items = [d for d in items if not d["online"]]
    for d in items:
        d["sessions_count"] = await db.sessions.count_documents({"device_id": d["id"]})
    return items


@api.patch("/devices/{did}")
async def rename_device(did: str, body: DevicePatch, member: dict = Depends(current_member)):
    scope = await _device_scope(member)
    res = await db.devices.update_one({"id": did, **scope}, {"$set": {"name": body.name}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado")
    await db.support_requests.update_many({"device_id": did}, {"$set": {"device_name": body.name}})
    await db.sessions.update_many({"device_id": did}, {"$set": {"device_name": body.name}})
    await audit(member["email"], "dispositivo.renomeado", did, {"name": body.name})
    return {"ok": True}


@api.delete("/devices/{did}")
async def delete_device(did: str, admin: dict = Depends(require_super_admin)):
    if await db.sessions.find_one({"device_id": did, "status": {"$in": ["assigned", "active"]}}):
        raise HTTPException(status_code=409, detail="O dispositivo tem uma sessão em curso. Termine-a primeiro.")
    res = await db.devices.delete_one({"id": did})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado")
    await db.support_requests.update_many({"device_id": did, "status": "pending"}, {"$set": {"status": "cancelled"}})
    await audit(admin["email"], "dispositivo.eliminado", did)
    return {"ok": True}


# ---------- settings / audit ----------
@api.get("/settings")
async def read_settings(admin: dict = Depends(require_super_admin)):
    return await get_settings()


@api.put("/settings")
async def write_settings(body: SettingsIn, admin: dict = Depends(require_super_admin)):
    await db.system_settings.update_one({"key": "global"}, {"$set": body.model_dump()}, upsert=True)
    await audit(admin["email"], "configuracoes.alteradas", "global", body.model_dump())
    return await get_settings()


@api.get("/audit")
async def read_audit(limit: int = 200, admin: dict = Depends(require_super_admin)):
    return await db.audit_logs.find({}, NO_ID).sort("at", -1).to_list(min(limit, 1000))


app.include_router(api)
app.include_router(clerk_router)
app.include_router(ws_router)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
                   allow_methods=["*"], allow_headers=["*"])


async def apply_retention():
    days = (await get_settings())["retention_days"]
    cutoff = ago_iso(days=days)
    r1 = await db.audit_logs.delete_many({"at": {"$lt": cutoff}})
    r2 = await db.sessions.update_many({"status": "ended", "ended_at": {"$lt": cutoff}}, {"$set": {"operations": []}})
    log.info(f"retention days={days} audit_removed={r1.deleted_count} sessions_trimmed={r2.modified_count}")


@app.on_event("startup")
async def startup():
    await db.users.create_index("id", unique=True)
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id")
    await db.devices.create_index("id", unique=True)
    await db.devices.create_index("installation_id", unique=True)
    await db.sessions.create_index("id", unique=True)
    await db.sessions.create_index([("technician_id", 1), ("status", 1)])
    await db.sessions.create_index("device_id")
    await db.support_requests.create_index("id", unique=True)
    await db.support_requests.create_index([("status", 1), ("created_at", -1)])
    await db.technician_links.create_index("token", unique=True)
    await db.audit_logs.create_index("at")
    await db.devices.update_many({}, {"$set": {"online": False}})
    await apply_retention()
    asyncio.create_task(heartbeat_loop())


@app.on_event("shutdown")
async def shutdown():
    client.close()
