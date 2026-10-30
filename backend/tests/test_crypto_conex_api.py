# Crypto Conex backend regression: public, auth/roles, queue/sessions isolation, links, devices, settings, WS signalling
import json
import asyncio
import uuid
import pytest
import requests
import websockets
from conftest import BASE_URL, WS_BASE, hdr, connect_device

API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def ids(tokens):
    return {k: requests.get(f"{API}/me", headers=hdr(t), timeout=15).json()["id"] for k, t in tokens.items()}


# ---------- public ----------
class TestPublic:
    def test_root_and_config(self):
        assert requests.get(f"{API}/").json()["status"] == "ok"
        c = requests.get(f"{API}/public/config").json()
        assert "android_download_url" in c and "windows_download_url" in c

    def test_invalid_link(self):
        assert requests.get(f"{API}/public/link/TEST_nope").json()["valid"] is False

    def test_connect_returns_token_and_pending_request(self):
        r, _ = connect_device()
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["device_token"] and d["request"]["status"] == "pending"

    def test_connect_validation(self):
        r = requests.post(f"{API}/public/connect", json={"installation_id": "x", "platform": "mac"})
        assert r.status_code == 422


# ---------- auth ----------
class TestAuth:
    @pytest.mark.parametrize("path", ["/me", "/requests", "/sessions", "/devices", "/links", "/settings", "/audit"])
    def test_no_token_401(self, path):
        assert requests.get(f"{API}{path}").status_code == 401

    def test_roles(self, tokens):
        assert requests.get(f"{API}/me", headers=hdr(tokens["admin"])).json()["role"] == "super_admin"
        assert requests.get(f"{API}/me", headers=hdr(tokens["tech1"])).json()["role"] == "technician"

    def test_device_token_cannot_call_crm(self):
        r, _ = connect_device()
        tok = r.json()["device_token"]
        for p in ["/me", "/requests", "/sessions", "/devices"]:
            assert requests.get(f"{API}{p}", headers={**hdr(tok), "x-client-kind": "device"}).status_code == 401
            assert requests.get(f"{API}{p}", headers=hdr(tok)).status_code == 401

    def test_ice_servers_device(self):
        r, _ = connect_device()
        tok = r.json()["device_token"]
        ice = requests.get(f"{API}/ice-servers", headers={**hdr(tok), "x-client-kind": "device"})
        assert ice.status_code == 200 and isinstance(ice.json()["iceServers"], list) and ice.json()["iceServers"]

    def test_tech_forbidden_admin_routes(self, tokens):
        h = hdr(tokens["tech1"])
        assert requests.get(f"{API}/settings", headers=h).status_code == 403
        assert requests.get(f"{API}/audit", headers=h).status_code == 403
        assert requests.post(f"{API}/technicians", headers=h, json={"email": "TEST_x@x.pt", "name": "TEST X"}).status_code == 403
        assert requests.delete(f"{API}/devices/whatever", headers=h).status_code == 403


# ---------- queue / sessions / isolation ----------
class TestSessionFlow:
    def test_full_flow_and_isolation(self, tokens, ids):
        r, _ = connect_device()
        rid = r.json()["request"]["id"]
        a, t1, t2 = hdr(tokens["admin"]), hdr(tokens["tech1"]), hdr(tokens["tech2"])
        assert any(x["id"] == rid for x in requests.get(f"{API}/requests", headers=a).json())
        assert not any(x["id"] == rid for x in requests.get(f"{API}/requests", headers=t2).json())
        # tech cannot assign
        assert requests.post(f"{API}/requests/{rid}/assign", headers=t2, json={"technician_id": ids["tech2"]}).status_code == 403
        # tech cannot take a non-targeted request
        assert requests.post(f"{API}/requests/{rid}/take", headers=t2).status_code == 404
        s = requests.post(f"{API}/requests/{rid}/assign", headers=a, json={"technician_id": ids["tech1"]})
        assert s.status_code == 200, s.text
        sid = s.json()["id"]
        assert s.json()["status"] == "assigned" and s.json()["technician_id"] == ids["tech1"]
        # double assign -> 404
        assert requests.post(f"{API}/requests/{rid}/assign", headers=a, json={"technician_id": ids["tech1"]}).status_code == 404
        # isolation
        assert requests.get(f"{API}/sessions/{sid}", headers=t2).status_code == 404
        assert requests.post(f"{API}/sessions/{sid}/accept", headers=t2).status_code == 404
        assert requests.post(f"{API}/sessions/{sid}/end", headers=t2).status_code == 404
        assert not any(x["id"] == sid for x in requests.get(f"{API}/sessions", headers=t2).json())
        # admin cannot accept others' session
        assert requests.post(f"{API}/sessions/{sid}/accept", headers=a).status_code == 404
        acc = requests.post(f"{API}/sessions/{sid}/accept", headers=t1)
        assert acc.status_code == 200 and acc.json()["status"] == "active"
        # transfer to tech2 by admin, then tech1 loses access
        tr = requests.post(f"{API}/sessions/{sid}/transfer", headers=a, json={"technician_id": ids["tech2"]})
        assert tr.status_code == 200 and tr.json()["technician_id"] == ids["tech2"]
        assert requests.get(f"{API}/sessions/{sid}", headers=t1).status_code == 404
        assert requests.get(f"{API}/sessions/{sid}", headers=t2).json()["status"] == "assigned"
        e = requests.post(f"{API}/sessions/{sid}/end", headers=t2)
        assert e.status_code == 200
        g = requests.get(f"{API}/sessions/{sid}", headers=a).json()
        assert g["status"] == "ended" and g["ended_at"] and g["started_at"]

    def test_reject_returns_to_queue(self, tokens, ids):
        r, _ = connect_device()
        rid = r.json()["request"]["id"]
        a, t1 = hdr(tokens["admin"]), hdr(tokens["tech1"])
        sid = requests.post(f"{API}/requests/{rid}/assign", headers=a, json={"technician_id": ids["tech1"]}).json()["id"]
        assert requests.post(f"{API}/sessions/{sid}/reject", headers=t1).status_code == 200
        req = [x for x in requests.get(f"{API}/requests", headers=a).json() if x["id"] == rid]
        assert req and req[0]["status"] == "pending"
        requests.post(f"{API}/requests/{rid}/cancel", headers=a)

    def test_dashboard_stats(self, tokens):
        d = requests.get(f"{API}/dashboard/stats", headers=hdr(tokens["admin"])).json()
        for k in ("devices_total", "requests_pending", "sessions_active", "technicians_total", "sessions_per_day"):
            assert k in d


# ---------- links ----------
class TestLinks:
    def test_link_lifecycle(self, tokens, ids):
        t1, t2 = hdr(tokens["tech1"]), hdr(tokens["tech2"])
        l = requests.post(f"{API}/links", headers=t1, json={"expires_in_days": 7, "label": "TEST_link"})
        assert l.status_code == 200
        link = l.json()
        assert "/assistir/" in link["url"] and link["technician_id"] == ids["tech1"]
        pub = requests.get(f"{API}/public/link/{link['token']}").json()
        assert pub["valid"] and pub["technician_name"]
        assert not any(x["id"] == link["id"] for x in requests.get(f"{API}/links", headers=t2).json())
        assert requests.post(f"{API}/links/{link['id']}/revoke", headers=t2).status_code == 404
        # request via link targets tech1 and is visible to tech1, and tech1 can take it
        r, _ = connect_device(link_token=link["token"])
        req = r.json()["request"]
        assert req["target_technician_id"] == ids["tech1"]
        assert any(x["id"] == req["id"] for x in requests.get(f"{API}/requests", headers=t1).json())
        tk = requests.post(f"{API}/requests/{req['id']}/take", headers=t1)
        assert tk.status_code == 200
        requests.post(f"{API}/sessions/{tk.json()['id']}/end", headers=t1)
        assert requests.post(f"{API}/links/{link['id']}/revoke", headers=t1).status_code == 200
        assert requests.get(f"{API}/public/link/{link['token']}").json()["valid"] is False


# ---------- devices ----------
class TestDevices:
    def test_rename_search_delete(self, tokens):
        r, inst = connect_device()
        did = r.json()["device_id"]
        a = hdr(tokens["admin"])
        assert requests.patch(f"{API}/devices/{did}", headers=a, json={"name": "TEST_renamed"}).status_code == 200
        found = requests.get(f"{API}/devices", headers=a, params={"q": "TEST_renamed"}).json()
        assert any(d["id"] == did and d["name"] == "TEST_renamed" for d in found)
        assert all("installation_id" not in d for d in found)
        assert requests.get(f"{API}/devices", headers=a, params={"os_filter": "TEST_OS"}).json()
        # technician has no access to unrelated device
        assert requests.patch(f"{API}/devices/{did}", headers=hdr(tokens["tech2"]), json={"name": "x"}).status_code == 404
        assert requests.delete(f"{API}/devices/{did}", headers=hdr(tokens["tech1"])).status_code == 403
        assert requests.delete(f"{API}/devices/{did}", headers=a).status_code == 200
        assert not any(d["id"] == did for d in requests.get(f"{API}/devices", headers=a, params={"q": "TEST_renamed"}).json())


# ---------- technicians / settings / audit ----------
class TestAdmin:
    def test_technician_crud(self, tokens):
        a = hdr(tokens["admin"])
        email = f"test_{uuid.uuid4().hex[:6]}@cryptoconex.pt"
        c = requests.post(f"{API}/technicians", headers=a, json={"email": email, "name": "TEST Tec"})
        assert c.status_code == 200
        tid = c.json()["id"]
        assert requests.post(f"{API}/technicians", headers=a, json={"email": email, "name": "TEST Tec"}).status_code == 409
        p = requests.patch(f"{API}/technicians/{tid}", headers=a, json={"active": False, "permissions": {"control": False}})
        assert p.json()["active"] is False and p.json()["permissions"]["control"] is False
        assert requests.get(f"{API}/technicians/{tid}/activity", headers=a).status_code == 200
        assert requests.delete(f"{API}/technicians/{tid}", headers=a).status_code == 200
        assert not any(t["id"] == tid for t in requests.get(f"{API}/technicians", headers=a).json())

    def test_self_protection(self, tokens, ids):
        a = hdr(tokens["admin"])
        assert requests.patch(f"{API}/technicians/{ids['admin']}", headers=a, json={"active": False}).status_code == 409
        assert requests.delete(f"{API}/technicians/{ids['admin']}", headers=a).status_code == 409

    def test_settings_and_audit(self, tokens):
        a = hdr(tokens["admin"])
        cur = requests.get(f"{API}/settings", headers=a).json()
        body = {k: cur[k] for k in ("retention_days", "default_link_days", "sound_feedback", "max_text_command_length")}
        assert requests.put(f"{API}/settings", headers=a, json=body).status_code == 200
        assert requests.put(f"{API}/settings", headers=a, json={**body, "retention_days": 1}).status_code == 422
        au = requests.get(f"{API}/audit", headers=a, params={"limit": 5}).json()
        assert isinstance(au, list) and au and "action" in au[0]


# ---------- websocket signalling ----------
async def _recv_until(ws, event, timeout=8):
    end = asyncio.get_event_loop().time() + timeout
    while True:
        left = end - asyncio.get_event_loop().time()
        if left <= 0:
            raise TimeoutError(event)
        m = json.loads(await asyncio.wait_for(ws.recv(), left))
        if m["event"] == event:
            return m["data"]


class TestWebSocket:
    def test_ws_bad_token(self):
        async def run():
            async with websockets.connect(f"{WS_BASE}/api/ws?kind=device&token=bad") as ws:
                m = json.loads(await asyncio.wait_for(ws.recv(), 8))
                assert m["event"] == "error" and m["data"]["code"] == 401
        asyncio.run(run())

    def test_ws_signalling_privacy_chat_command(self, tokens, ids):
        r, _ = connect_device()
        d = r.json()
        a, t1 = hdr(tokens["admin"]), hdr(tokens["tech1"])

        async def run():
            async with websockets.connect(f"{WS_BASE}/api/ws?kind=device&token={d['device_token']}") as dev, \
                    websockets.connect(f"{WS_BASE}/api/ws?kind=user&token={tokens['tech1']}") as tw1, \
                    websockets.connect(f"{WS_BASE}/api/ws?kind=user&token={tokens['tech2']}") as tw2, \
                    websockets.connect(f"{WS_BASE}/api/ws?kind=user&token={tokens['admin']}") as aw:
                for w in (dev, tw1, tw2, aw):
                    await _recv_until(w, "connected")
                s = requests.post(f"{API}/requests/{d['request']['id']}/assign", headers=a, json={"technician_id": ids["tech1"]}).json()
                sid = s["id"]
                assert (await _recv_until(dev, "support:assigned"))["session"]["id"] == sid
                requests.post(f"{API}/sessions/{sid}/accept", headers=t1)
                await _recv_until(dev, "session:started")
                await dev.send(json.dumps({"event": "consent:update", "data": {"session_id": sid, "screen": True, "control": False}}))
                await tw1.send(json.dumps({"event": "session:join", "data": {"session_id": sid}}))
                st = await _recv_until(tw1, "session:status")
                assert st["status"] == "active"
                await _recv_until(dev, "technician:joined")
                # tech2 cannot join / command / privacy
                await tw2.send(json.dumps({"event": "session:join", "data": {"session_id": sid}}))
                assert "message" in await _recv_until(tw2, "error")
                await tw2.send(json.dumps({"event": "remote:command", "data": {"session_id": sid, "command": {"type": "click"}}}))
                assert (await _recv_until(tw2, "error"))["event"] == "remote:command"
                # tech1 command without control consent -> error
                await tw1.send(json.dumps({"event": "remote:command", "data": {"session_id": sid, "command": {"type": "click"}}}))
                assert "autorizou" in (await _recv_until(tw1, "error"))["message"]
                # signalling relay
                await dev.send(json.dumps({"event": "webrtc:offer", "data": {"session_id": sid, "sdp": {"type": "offer", "sdp": "x"}}}))
                assert (await _recv_until(tw1, "webrtc:offer"))["sdp"]["type"] == "offer"
                # privacy
                await tw1.send(json.dumps({"event": "privacy:enable", "data": {"session_id": sid}}))
                await _recv_until(dev, "privacy:enabled")
                await tw1.send(json.dumps({"event": "privacy:disable", "data": {"session_id": sid}}))
                await _recv_until(dev, "privacy:disabled")  # iteration 2: technician-only privacy control
                await dev.send(json.dumps({"event": "privacy:disable", "data": {"session_id": sid}}))
                assert (await _recv_until(dev, "error"))["event"] == "privacy:disable"
                # chat both ways
                await tw1.send(json.dumps({"event": "chat:message", "data": {"session_id": sid, "text": "TEST_ola"}}))
                assert (await _recv_until(dev, "chat:message"))["text"] == "TEST_ola"
                await dev.send(json.dumps({"event": "chat:message", "data": {"session_id": sid, "text": "TEST_resp"}}))
                m = await _recv_until(tw1, "chat:message")
                if m["text"] == "TEST_ola":  # own echo first
                    m = await _recv_until(tw1, "chat:message")
                assert m["text"] == "TEST_resp" and m["from"] == "device"
                # device cannot send commands
                await dev.send(json.dumps({"event": "remote:command", "data": {"session_id": sid, "command": {"type": "click"}}}))
                assert (await _recv_until(dev, "error"))["event"] == "remote:command"
                await tw1.send(json.dumps({"event": "session:end", "data": {"session_id": sid}}))
                await _recv_until(dev, "session:ended")
                return sid
        sid = asyncio.run(run())
        assert requests.get(f"{API}/sessions/{sid}", headers=a).json()["status"] == "ended"


# ---------- rate limit (run last) ----------
class TestZRateLimit:
    def test_connect_rate_limit_same_ip(self):
        ip = f"192.0.2.{uuid.uuid4().int % 250}"
        codes = [connect_device(ip=ip)[0].status_code for _ in range(12)]
        assert 429 in codes, codes
