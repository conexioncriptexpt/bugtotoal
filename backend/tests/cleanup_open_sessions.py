# Helper: end all open sessions (admin) to keep UI tests deterministic
import requests
from conftest import clerk_jwt, USERS, BASE_URL
h = {"Authorization": f"Bearer {clerk_jwt(USERS['admin'])}"}
for s in requests.get(f"{BASE_URL}/api/sessions", params={"status": "open"}, headers=h).json():
    print("end", s["id"], requests.post(f"{BASE_URL}/api/sessions/{s['id']}/end", headers=h).status_code)
