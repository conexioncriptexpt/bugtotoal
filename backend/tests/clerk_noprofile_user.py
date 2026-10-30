# Helper: ensure a Clerk user WITHOUT CRM profile exists (for access-denied test); prints its user_id
import requests
from pathlib import Path
from dotenv import dotenv_values
sk = dotenv_values(Path("/app/backend/.env"))["CLERK_SECRET_KEY"]
h = {"Authorization": f"Bearer {sk}", "User-Agent": "cc-tests"}
email = "semperfil+clerk_test@cryptoconex.pt"
r = requests.get("https://api.clerk.com/v1/users", params={"email_address": email}, headers=h, timeout=15).json()
if r:
    print(r[0]["id"])
else:
    c = requests.post("https://api.clerk.com/v1/users", headers=h, timeout=15, json={
        "email_address": [email], "password": "CryptoTest-2026!", "skip_password_checks": True})
    print(c.json().get("id") or c.text)
