# Helper: print Clerk sign-in tickets for UI tests (does not print the secret)
import sys, json, requests
from pathlib import Path
from dotenv import dotenv_values
sk = dotenv_values(Path("/app/backend/.env"))["CLERK_SECRET_KEY"]
sys.path.insert(0, "/app/backend/tests")
from conftest import USERS
out = {}
for k in sys.argv[1:] or USERS:
    r = requests.post("https://api.clerk.com/v1/sign_in_tokens", json={"user_id": USERS[k], "expires_in_seconds": 1800},
                      headers={"Authorization": f"Bearer {sk}", "User-Agent": "cc-tests"}, timeout=15)
    out[k] = r.json()["token"]
print(json.dumps(out))
