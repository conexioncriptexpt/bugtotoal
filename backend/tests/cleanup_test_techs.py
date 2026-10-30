# Deletes TEST_ technicians (email starts with test_) via API using admin login
from test_auth_jwt import login, API, ADMIN_EMAIL, ADMIN_PW, hdr
import requests

tok = login(ADMIN_EMAIL, ADMIN_PW).json()["token"]
for t in requests.get(f"{API}/technicians", headers=hdr(tok), timeout=20).json():
    if t["email"].startswith("test_"):
        r = requests.delete(f"{API}/technicians/{t['id']}", headers=hdr(tok), timeout=20)
        print("deleted", t["email"], r.status_code)
