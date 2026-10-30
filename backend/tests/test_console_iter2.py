# Iteration 2: live console backend - thumbnails, one-click start, inline rename scope, technician-only privacy, remote control relay
import json
import asyncio
import uuid
import pytest
import requests
import websockets
from conftest import BASE_URL, WS_BASE, hdr

API = f"{BASE_URL}/api"
JPEG = "data:image/jpeg;base64," + "A" * 200


@pytest.fixture(scope="module")
def ids(tokens):
    return {k: requests.get(f"{API}/me", headers=hdr(t), timeout=15).json()["id"] for k, t in tokens.items()}


@pytest.fixture(scope="module")
def link1(tokens):
    t1 = hdr(tokens["tech1"])
    l = requests.post(f"{API}/links", headers=t1, json={"expires_in_days": 1, "label": "TEST_link_iter2"}).json()
    yield l
    requests.post(f"{API}/links/{l['id']}/revoke", headers=t1)


def connect(platform="web", link_token=None):
    r = requests.post(f"{API}/public/connect", headers={"X-Forwarded-For": f"10.9.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}"},
                      json={"installation_id": f"TEST_{uuid.uuid4().hex[:16]}", "platform": platform, "os": "TEST_OS",
                            "os_version": "1", "client_name": "TEST_client", "link_token": link_token}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


async def recv_until(ws, event, timeout=8, pred=None):
    end = asyncio.get_event_loop().time() + timeout
    while True:
        left = end - asyncio.get_event_loop().time()
        if left <= 0:
            raise TimeoutError(event)
        m = json.loads(await asyncio.wait_for(ws.recv(), left))
        if m["event"] == event and (pred is None or pred(m["data"])):
            return m["data"]


async def no_event(ws, event, timeout=2.5, pred=None):
    try:
        await recv_until(ws, event, timeout, pred)
        return False
    except (TimeoutError, asyncio.TimeoutError):
        return True


def send(ws, event, data):
    return ws.send(json.dumps({"event": event, "data": data}))


# ---------- thumbnails ----------
class TestThumbnails:
    def test_thumbnail_relay_and_scope(self, tokens, link1):
        d = connect(link_token=link1["token"])
        did = d["device_id"]

        async def run():
            async with websockets.connect(f"{WS_BASE}/api/ws?kind=device&token={d['device_token']}") as dev, \
                    websockets.connect(f"{WS_BASE}/api/ws?kind=user&token={tokens['admin']}") as aw, \
                    websockets.connect(f"{WS_BASE}/api/ws?kind=user&token={tokens['tech1']}") as t1w, \
                    websockets.connect(f"{WS_BASE}/api/ws?kind=user&token={tokens['tech2']}") as t2w:
                for w in (dev, aw, t1w, t2w):
                    await recv_until(w, "connected")
                await send(dev, "device:thumbnail", {"image": JPEG})
                isd = lambda x: x["device_id"] == did
                assert (await recv_until(aw, "device:thumbnail", pred=isd))["image"] == JPEG
                assert (await recv_until(t1w, "device:thumbnail", pred=isd))["image"] == JPEG
                assert await no_event(t2w, "device:thumbnail", pred=isd)
                # REST scope
                ga = requests.get(f"{API}/thumbnails", headers=hdr(tokens["admin"])).json()
                g1 = requests.get(f"{API}/thumbnails", headers=hdr(tokens["tech1"])).json()
                g2 = requests.get(f"{API}/thumbnails", headers=hdr(tokens["tech2"])).json()
                assert any(t["device_id"] == did and t["image"] == JPEG for t in ga)
                assert any(t["device_id"] == did for t in g1)
                assert not any(t["device_id"] == did for t in g2)
                # invalid image (png / too large) ignored
                await send(dev, "device:thumbnail", {"image": "data:image/png;base64,AAAA"})
                await send(dev, "device:thumbnail", {"image": "data:image/jpeg;base64," + "B" * 160_000})
                assert await no_event(aw, "device:thumbnail", pred=isd)
                # user cannot send thumbnails
                await send(aw, "device:thumbnail", {"image": JPEG})
                assert (await recv_until(aw, "error"))["event"] == "device:thumbnail"
            await asyncio.sleep(1)
            # offline -> thumbnail dropped
            ga = requests.get(f"{API}/thumbnails", headers=hdr(tokens["admin"])).json()
            assert not any(t["device_id"] == did for t in ga)
        asyncio.run(run())

    def test_thumbnails_requires_auth(self):
        assert requests.get(f"{API}/thumbnails").status_code == 401


# ---------- rename scope ----------
class TestRenameScope:
    def test_tech_renames_pending_targeted_device(self, tokens, link1):
        d = connect(link_token=link1["token"])
        did = d["device_id"]
        r = requests.patch(f"{API}/devices/{did}", headers=hdr(tokens["tech1"]), json={"name": "TEST_renamed_t1"})
        assert r.status_code == 200, r.text
        reqs = requests.get(f"{API}/requests", headers=hdr(tokens["tech1"])).json()
        assert any(x["device_id"] == did and x["device_name"] == "TEST_renamed_t1" for x in reqs)
        assert requests.patch(f"{API}/devices/{did}", headers=hdr(tokens["tech2"]), json={"name": "TEST_hack"}).status_code == 404
        u = connect()  # untargeted
        assert requests.patch(f"{API}/devices/{u['device_id']}", headers=hdr(tokens["tech1"]), json={"name": "TEST_hack"}).status_code == 404
        assert requests.patch(f"{API}/devices/{u['device_id']}", headers=hdr(tokens["admin"]), json={"name": "TEST_admin_ren"}).status_code == 200
        devs = requests.get(f"{API}/devices", headers=hdr(tokens["admin"]), params={"q": "TEST_admin_ren"}).json()
        assert devs and devs[0]["name"] == "TEST_admin_ren"


# ---------- one-click start ----------
class TestStart:
    def test_start_targeted_and_isolation(self, tokens, ids, link1):
        d = connect(link_token=link1["token"])
        rid = d["request"]["id"]
        assert requests.post(f"{API}/requests/{rid}/start", headers=hdr(tokens["tech2"])).status_code == 404
        r = requests.post(f"{API}/requests/{rid}/start", headers=hdr(tokens["tech1"]))
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["status"] == "active" and s["technician_id"] == ids["tech1"] and s["started_at"]
        g = requests.get(f"{API}/sessions/{s['id']}", headers=hdr(tokens["tech1"])).json()
        assert g["status"] == "active"
        assert requests.get(f"{API}/sessions/{s['id']}", headers=hdr(tokens["tech2"])).status_code == 404
        assert requests.post(f"{API}/requests/{rid}/start", headers=hdr(tokens["tech1"])).status_code == 404
        assert not any(x["id"] == rid for x in requests.get(f"{API}/requests", headers=hdr(tokens["admin"])).json())
        assert requests.post(f"{API}/sessions/{s['id']}/end", headers=hdr(tokens["tech1"])).status_code == 200

    def test_admin_start_untargeted(self, tokens, ids):
        d = connect()
        assert requests.post(f"{API}/requests/{d['request']['id']}/start", headers=hdr(tokens["tech1"])).status_code == 404
        r = requests.post(f"{API}/requests/{d['request']['id']}/start", headers=hdr(tokens["admin"]))
        assert r.status_code == 200 and r.json()["status"] == "active" and r.json()["technician_id"] == ids["admin"]
        requests.post(f"{API}/sessions/{r.json()['id']}/end", headers=hdr(tokens["admin"]))

    def test_start_requires_auth(self):
        assert requests.post(f"{API}/requests/x/start").status_code == 401


# ---------- remote control + privacy (simulated android device) ----------
class TestRemoteControl:
    def test_android_command_relay_and_privacy(self, tokens, link1):
        d = connect("android", link1["token"])
        t1 = hdr(tokens["tech1"])

        async def run():
            async with websockets.connect(f"{WS_BASE}/api/ws?kind=device&token={d['device_token']}") as dev, \
                    websockets.connect(f"{WS_BASE}/api/ws?kind=user&token={tokens['tech1']}") as tw, \
                    websockets.connect(f"{WS_BASE}/api/ws?kind=user&token={tokens['tech2']}") as tw2:
                for w in (dev, tw, tw2):
                    await recv_until(w, "connected")
                s = requests.post(f"{API}/requests/{d['request']['id']}/start", headers=t1).json()
                sid = s["id"]
                await recv_until(dev, "session:started")
                await send(tw, "session:join", {"session_id": sid})
                await recv_until(dev, "technician:joined")
                # no consent yet -> error
                await send(tw, "remote:command", {"session_id": sid, "command": {"type": "click", "x": 0.5, "y": 0.5}})
                assert "autorizou" in (await recv_until(tw, "error"))["message"]
                await send(dev, "consent:update", {"session_id": sid, "screen": True, "control": True})
                st = await recv_until(tw, "session:status", pred=lambda x: "consent" in x)
                assert st["consent"]["control"] is True
                cmds = [{"type": "click", "x": 0.25, "y": 0.75}, {"type": "long_press", "x": 0.1, "y": 0.2},
                        {"type": "swipe", "dx": 3}, {"type": "scroll", "dy": -3}, {"type": "back"}, {"type": "home"},
                        {"type": "recents"}, {"type": "text", "text": "TEST_ola"}]
                for c in cmds:
                    await send(tw, "remote:command", {"session_id": sid, "command": c})
                    got = await recv_until(dev, "remote:command")
                    assert got["command"] == c and got["session_id"] == sid
                # disallowed
                await send(tw, "remote:command", {"session_id": sid, "command": {"type": "rm_rf"}})
                assert (await recv_until(tw, "error"))["event"] == "remote:command"
                await send(tw, "remote:command", {"session_id": sid, "command": {"type": "shortcut", "keys": "ctrl+alt+del"}})
                assert "Atalho" in (await recv_until(tw, "error"))["message"]
                await send(tw2, "remote:command", {"session_id": sid, "command": {"type": "back"}})
                assert (await recv_until(tw2, "error"))["event"] == "remote:command"
                # privacy technician-only
                await send(dev, "privacy:enable", {"session_id": sid})
                assert (await recv_until(dev, "error"))["event"] == "privacy:enable"
                await send(tw, "privacy:enable", {"session_id": sid})
                await recv_until(dev, "privacy:enabled")
                assert requests.get(f"{API}/sessions/{sid}", headers=t1).json()["privacy"] is True
                await send(dev, "privacy:disable", {"session_id": sid})
                assert (await recv_until(dev, "error"))["event"] == "privacy:disable"
                assert requests.get(f"{API}/sessions/{sid}", headers=t1).json()["privacy"] is True
                await send(tw, "privacy:disable", {"session_id": sid})
                await recv_until(dev, "privacy:disabled")
                assert requests.get(f"{API}/sessions/{sid}", headers=t1).json()["privacy"] is False
                # thumbnail during open session reaches the technician
                await send(dev, "device:thumbnail", {"image": JPEG})
                await recv_until(tw, "device:thumbnail", pred=lambda x: x["device_id"] == d["device_id"])
                await send(tw, "session:end", {"session_id": sid})
                await recv_until(dev, "session:ended")
        asyncio.run(run())
