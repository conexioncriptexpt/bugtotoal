# Helper: cleanup data created by tests (cancel TEST_ pending requests, delete TEST_OS devices, end open sessions)
import requests
from conftest import clerk_jwt, USERS, BASE_URL
A = f"{BASE_URL}/api"
h = {"Authorization": f"Bearer {clerk_jwt(USERS['admin'])}"}
for s in requests.get(f"{A}/sessions", params={"status": "open"}, headers=h).json():
    requests.post(f"{A}/sessions/{s['id']}/end", headers=h)
n = 0
for r in requests.get(f"{A}/requests", params={"status": "pending"}, headers=h).json():
    if r.get("client_name") == "TEST_client" or r.get("os") == "TEST_OS":
        n += requests.post(f"{A}/requests/{r['id']}/cancel", headers=h).status_code == 200
d = 0
for dev in requests.get(f"{A}/devices", params={"os_filter": "TEST_OS"}, headers=h).json():
    d += requests.delete(f"{A}/devices/{dev['id']}", headers=h).status_code == 200
print(f"cancelled={n} devices_deleted={d}")
