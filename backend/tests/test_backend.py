from fastapi.testclient import TestClient

from app.main import app


def _connect(client, role, session="t1"):
    ws = client.websocket_connect(f"/ws?role={role}&session={session}")
    return ws


_SKIP = {"presence", "status"}


def _recv(ws, want=None):
    """Next message, skipping presence/status chatter unless asked for."""
    while True:
        m = ws.receive_json()
        if want and m["type"] == want:
            return m
        if not want and m["type"] not in _SKIP:
            return m


def test_health():
    with TestClient(app) as c:
        r = c.get("/health")
        assert r.status_code == 200 and r.json()["ok"] is True


def test_cue_reaches_phone_and_watch():
    with TestClient(app) as c:
        with _connect(c, "phone") as phone, _connect(c, "watch") as watch:
            assert _recv(phone)["type"] == "welcome"
            assert _recv(watch)["type"] == "welcome"

            r = c.post("/sessions/t1/cue", json={"kind": "bass", "intensity": 1.0, "pattern": "pulse"})
            assert r.json()["delivered"] == 2

            for ws in (phone, watch):
                m = _recv(ws)
                assert m["type"] == "cue"
                assert m["payload"]["kind"] == "bass"
                assert m["session"] == "t1"


def test_sessions_are_isolated():
    with TestClient(app) as c:
        with _connect(c, "phone", "a") as a:
            _recv(a)
            r = c.post("/sessions/b/cue", json={"kind": "beat"})
            assert r.json()["delivered"] == 0


def test_role_filter():
    with TestClient(app) as c:
        with _connect(c, "phone", "rf") as p, _connect(c, "watch", "rf") as w:
            _recv(p); _recv(w)
            r = c.post("/sessions/rf/cue?roles=watch", json={"kind": "percussion"})
            assert r.json()["delivered"] == 1
            assert _recv(w)["type"] == "cue"


def test_ping_pong_and_ack_latency():
    with TestClient(app) as c:
        with _connect(c, "watch", "lat") as w:
            welcome = _recv(w)
            w.send_json({"type": "ping", "payload": {"client_time": 1000, "clock_offset_ms": 0, "last_rtt_ms": 12}})
            pong = _recv(w)
            assert pong["type"] == "pong" and pong["payload"]["client_time"] == 1000

            cue = c.post("/sessions/lat/cue", json={"kind": "beat"}).json()["message"]
            got = _recv(w)
            w.send_json({"type": "ack", "payload": {"cue_id": got["payload"]["cue_id"], "received_at": cue["sent_at"] + 25}})
            w.send_json({"type": "ping", "payload": {"client_time": 2000}})
            _recv(w)  # pong, guarantees ack was processed

            info = [x for x in c.get("/clients?session=lat").json() if x["id"] == welcome["payload"]["client_id"]][0]
            assert info["avg_cue_latency_ms"] == 25.0
            assert info["avg_rtt_ms"] == 12.0


def test_movement_relayed_to_phone_not_watch():
    with TestClient(app) as c:
        with _connect(c, "phone", "mv") as p, _connect(c, "watch", "mv") as w:
            _recv(p); _recv(w)
            w.send_json({"type": "movement", "payload": {"gesture": "wave", "confidence": 0.9, "at_ms": 4500}})
            m = _recv(p)
            assert m["type"] == "movement_detected"
            assert m["payload"]["source_client"].startswith("watch-")
            assert m["payload"]["at_ms"] == 4500


def test_bad_message_gets_error_not_disconnect():
    with TestClient(app) as c:
        with _connect(c, "watch", "bad") as w:
            _recv(w)
            w.send_text('{"type": "movement", "payload": {"gesture": "jump"}}')
            assert _recv(w)["type"] == "error"
            w.send_text("not json")
            assert _recv(w)["type"] == "error"
            w.send_json({"type": "ping", "payload": {"client_time": 1}})
            assert _recv(w)["type"] == "pong"


def test_late_joiner_gets_playback_state():
    with TestClient(app) as c:
        c.post("/sessions/pb/playback", json={"state": "playing", "position_ms": 30000, "media_id": "song1"})
        with _connect(c, "watch", "pb") as w:
            assert _recv(w)["type"] == "welcome"
            m = _recv(w)
            assert m["type"] == "playback" and m["payload"]["position_ms"] == 30000


def test_invalid_cue_rejected():
    with TestClient(app) as c:
        assert c.post("/sessions/x/cue", json={"kind": "bass", "intensity": 3}).status_code == 422
        assert c.post("/sessions/x/cue", json={"kind": "guitar"}).status_code == 422


def test_schema_endpoints():
    with TestClient(app) as c:
        assert "oneOf" in c.get("/schema").json() or "discriminator" in c.get("/schema").json()
        assert "cue" in c.get("/schema/examples").json()
