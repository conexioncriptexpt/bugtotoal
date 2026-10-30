import os
import time
import uuid
import secrets
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta

import bcrypt
import jwt
import requests
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient
from starlette.concurrency import run_in_threadpool

load_dotenv(Path(__file__).parent / ".env")

logging.basicConfig(level=logging.INFO, format='{"t":"%(asctime)s","lvl":"%(levelname)s","log":"%(name)s","msg":"%(message)s"}')
log = logging.getLogger("cryptoconex")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

DEVICE_JWT_SECRET = os.environ["DEVICE_JWT_SECRET"]
DEVICE_TOKEN_TTL = 4 * 3600
USER_TOKEN_TTL = 12 * 3600
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


def _admin_emails() -> set:
    return {e.strip().lower() for e in os.environ.get("ADMIN_EMAIL", "").split(",") if e.strip()}


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def check_password(pw: str, hashed: str | None) -> bool:
    try:
        return bool(hashed) and bcrypt.checkpw(pw.encode(), hashed.encode())
    except ValueError:
        return False


def create_user_token(member: dict) -> str:
    exp = int(time.time()) + USER_TOKEN_TTL
    return jwt.encode({"sub": member["id"], "typ": "user", "pwv": member.get("pw_version", 0), "exp": exp},
                      DEVICE_JWT_SECRET, algorithm="HS256")


async def member_from_token(token: str) -> dict:
    try:
        claims = jwt.decode(token, DEVICE_JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada. Entre novamente.")
    if claims.get("typ") != "user":
        raise HTTPException(status_code=401, detail="Sessão inválida")
    member = await db.users.find_one({"id": claims["sub"]}, {"_id": 0})
    if not member or claims.get("pwv") != member.get("pw_version", 0):
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada. Entre novamente.")
    if not member.get("active", True):
        raise HTTPException(status_code=403, detail="Conta desativada. Contacte o Super Admin.")
    if member.get("role") not in ROLES:
        member["role"] = "technician"
    return member


async def current_member(request: Request) -> dict:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Sem sessão iniciada")
    return await member_from_token(auth[7:])


async def seed_admins():
    """Ensures each ADMIN_EMAIL has a super admin profile; sets ADMIN_PASSWORD only where no password exists yet."""
    pw = os.environ.get("ADMIN_PASSWORD", "")
    for email in _admin_emails():
        u = await db.users.find_one({"email": email}, {"_id": 0})
        if not u:
            u = {"id": new_id(), "email": email, "name": email.split("@")[0], "role": "super_admin", "active": True,
                 "permissions": DEFAULT_PERMISSIONS, "created_at": now_iso(), "pw_version": 0}
            await db.users.insert_one({**u})
            await audit("sistema", "superadmin.criado", u["id"])
        upd = {"role": "super_admin", "active": True}
        if not u.get("password_hash") and pw:
            upd |= {"password_hash": hash_password(pw), "pw_version": u.get("pw_version", 0) + 1}
        await db.users.update_one({"id": u["id"]}, {"$set": upd})


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
    member = await member_from_token(token)
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
