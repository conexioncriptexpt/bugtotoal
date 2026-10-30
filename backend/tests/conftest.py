# Shared fixtures: base URL, Clerk session tokens for test users, device connect helper
import os
import uuid
import pytest
import requests
from pathlib import Path
from dotenv import dotenv_values

FRONT_ENV = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or FRONT_ENV["REACT_APP_BACKEND_URL"]).rstrip("/")
WS_BASE = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
_SK = dotenv_values(Path("/app/backend/.env")).get("CLERK_SECRET_KEY")

USERS = {
    "admin": "user_3LPbVL0J7tuCthFKELshU3daCyt",
    "tech1": "user_3LPbVNTxlPkcWgYcLAihqwF2aJj",
    "tech2": "user_3LPbVLbAbCcMeP24wMWOgMq5DrQ",
    "noprofile": "user_3LPdgg99grBfACv3bH0p6SZZV7X",
}


def clerk_jwt(user_id: str) -> str:
    h = {"Authorization": f"Bearer {_SK}", "User-Agent": "cc-tests", "Content-Type": "application/json"}
    s = requests.post("https://api.clerk.com/v1/sessions", json={"user_id": user_id}, headers=h, timeout=15)
    s.raise_for_status()
    t = requests.post(f"https://api.clerk.com/v1/sessions/{s.json()['id']}/tokens",
                      json={"expires_in_seconds": 1800}, headers=h, timeout=15)
    t.raise_for_status()
    return t.json()["jwt"]


@pytest.fixture(scope="session")
def tokens():
    try:
        return {k: clerk_jwt(v) for k, v in USERS.items() if k != "noprofile"}
    except Exception as e:
        pytest.skip(f"Clerk token creation failed: {e}")


def hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def connect_device(link_token=None, ip=None):
    """POST /api/public/connect with unique TEST_ installation id."""
    inst = f"TEST_{uuid.uuid4().hex[:16]}"
    headers = {"X-Forwarded-For": ip or f"10.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}"}
    r = requests.post(f"{BASE_URL}/api/public/connect", headers=headers, json={
        "installation_id": inst, "platform": "web", "os": "TEST_OS", "os_version": "1", "link_token": link_token,
        "client_name": "TEST_client"}, timeout=15)
    return r, inst
