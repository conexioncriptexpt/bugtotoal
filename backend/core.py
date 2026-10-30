import os
import time
import uuid
import secrets
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta

import jwt
import requests
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient
from starlette.concurrency import run_in_threadpool

load_dotenv(Path(__file__).parent / ".env")

try:
    from backend.clerk_auth import require_user, verify_session_token
except ModuleNotFoundError:
    from clerk_auth import require_user, verify_session_token

logging.basicConfig(level=logging.INFO, format='{"t":"%(asctime)s","lvl":"%(levelname)s","log":"%(name)s","msg":"%(message)s"}')
log = logging.getLogger("cryptoconex")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

DEVICE_JWT_SECRET = os.environ["DEVICE_JWT_SECRET"]
DEVICE_TOKEN_TTL = 4 * 3600
ENV = "live" if os.environ.get("CLERK_PUBLISHABLE_KEY", "").startswith("pk_live_") else "preview"
ROLES = ["super_admin", "technician"]
DEFAULT_PERMISSIONS = {"control": True, "privacy": True, "accessibility": True}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ago_iso(**kw) -> str:
    return (datetime.now(timezone.utc) - timedelta(**kw)).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def random_token(n: int = 12) -> str:
    alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(n))


async def audit(actor: str, action: str, target: str = "", details: dict | None = None):
    await db.audit_logs.insert_one({"id": new_id(), "actor": actor, "action": action, "target": target,
                                    "details": details or {}, "at": now_iso()})
    log.info(f"audit actor={actor} action={action} target={target}")


def _clerk_headers():
    return {"Authorization": f"Bearer {os.environ['CLERK_SECRET_KEY']}", "User-Agent": "crypto-conex"}


def _clerk_user(uid: str) -> dict:
    r = requests.get(f"https://api.clerk.com/v1/users/{uid}", headers=_clerk_headers(), timeout=10)
    r.raise_for_status()
    return r.json()


def clerk_set_password(uid: str, password: str):
    r = requests.patch(f"https://api.clerk.com/v1/users/{uid}", headers=_clerk_headers(),
                       json={"password": password}, timeout=10)
    if r.status_code >= 400:
        msg = (r.json().get("errors") or [{}])[0].get("long_message", "Palavra-passe inválida")
        raise HTTPException(status_code=400, detail=msg)


def _admin_emails() -> set:
    return {e.strip().lower() for e in os.environ.get("ADMIN_EMAIL", "").split(",") if e.strip()}


async def resolve_member(uid: str) -> dict:
    member = await db.users.find_one({"user_id": uid}, {"_id": 0})
    if member is None:
        cu = await run_in_threadpool(_clerk_user, uid)
        verified = [e["email_address"].lower() for e in cu.get("email_addresses", [])
                    if (e.get("verification") or {}).get("status") == "verified"]
        name = " ".join(x for x in [cu.get("first_name"), cu.get("last_name")] if x) or (verified[0].split("@")[0] if verified else "Utilizador")
        # Link by verified email: unlinked profiles, or ones linked in the other Clerk instance (preview <-> live).
        profile = await db.users.find_one({"email": {"$in": verified}, "$or": [{"user_id": None}, {"env": {"$ne": ENV}}]},
                                          {"_id": 0}) if verified else None
        if profile:
            await db.users.update_one({"id": profile["id"]}, {"$set": {"user_id": uid, "env": ENV, "linked_at": now_iso()}})
            member = {**profile, "user_id": uid}
            await audit(profile["email"], "conta.ligada", profile["id"])
        elif set(verified) & _admin_emails():
            member = {"id": new_id(), "user_id": uid, "email": verified[0], "name": name, "role": "super_admin",
                      "active": True, "permissions": DEFAULT_PERMISSIONS, "env": ENV, "created_at": now_iso()}
            await db.users.insert_one({**member})
            member.pop("_id", None)
            await audit(member["email"], "superadmin.criado", member["id"])
        else:
            raise HTTPException(status_code=403, detail="Conta não autorizada. Peça ao Super Admin para criar o seu perfil.")
    if not member.get("active", True):
        raise HTTPException(status_code=403, detail="Conta desativada. Contacte o Super Admin.")
    if member.get("role") not in ROLES:
        member["role"] = "technician"
    return member


async def current_member(user: dict = Depends(require_user)) -> dict:
    return await resolve_member(user["user_id"])


async def require_super_admin(member: dict = Depends(current_member)) -> dict:
    if member["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Apenas o Super Admin pode realizar esta operação")
    return member


def create_device_token(device_id: str) -> str:
    exp = int(time.time()) + DEVICE_TOKEN_TTL
    return jwt.encode({"sub": device_id, "typ": "device", "exp": exp}, DEVICE_JWT_SECRET, algorithm="HS256")


def verify_device_token(token: str) -> str:
    try:
        claims = jwt.decode(token, DEVICE_JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Credencial de dispositivo inválida ou expirada")
    if claims.get("typ") != "device":
        raise HTTPException(status_code=401, detail="Credencial inválida")
    return claims["sub"]


async def identify(token: str, kind: str) -> dict:
    """Returns {'kind','id','role','member'} for a WS/ICE caller."""
    if kind == "device":
        return {"kind": "device", "id": verify_device_token(token), "role": "device", "member": None}
    claims = await run_in_threadpool(verify_session_token, token)
    member = await resolve_member(claims["sub"])
    return {"kind": "user", "id": member["id"], "role": member["role"], "member": member}


async def any_caller(request: Request) -> dict:
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else ""
    if not token:
        raise HTTPException(status_code=401, detail="Sem autenticação")
    kind = "device" if request.headers.get("x-client-kind") == "device" else "user"
    return await identify(token, kind)


def ice_servers() -> list:
    domain, key = os.environ.get("METERED_DOMAIN"), os.environ.get("METERED_API_KEY")
    if domain and key:
        try:
            r = requests.get(f"https://{domain}/api/v1/turn/credentials", params={"apiKey": key}, timeout=8)
            r.raise_for_status()
            return r.json()
        except requests.RequestException:
            log.warning("metered temporary credentials failed, falling back to env")
    servers = [{"urls": u} for u in os.environ.get("STUN_URLS", "").split(",") if u]
    turn = [u for u in os.environ.get("TURN_URLS", "").split(",") if u]
    if turn:
        servers.append({"urls": turn, "username": os.environ.get("TURN_USERNAME", ""),
                        "credential": os.environ.get("TURN_CREDENTIAL", "")})
    return servers


async def get_settings() -> dict:
    s = await db.system_settings.find_one({"key": "global"}, {"_id": 0})
    defaults = {"key": "global", "retention_days": 365, "default_link_days": 30, "sound_feedback": True,
                "max_text_command_length": 500}
    return {**defaults, **(s or {})}
