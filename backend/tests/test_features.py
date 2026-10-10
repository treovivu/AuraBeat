import json
import time

import pytest
from fastapi.testclient import TestClient

from app import gemini, timeline
from app.main import app


def recv(ws, want):
    for _ in range(50):
        m = ws.receive_json()
        if m["type"] == want:
            return m
    raise AssertionError(f"no {want} message")


def drain_until(ws, want, pred=lambda m: True):
    for _ in range(100):
        m = ws.receive_json()
        if m["type"] == want and pred(m):
            return m
    raise AssertionError(f"no matching {want}")


@pytest.fixture
def tl_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(timeline, "TIMELINE_DIR", tmp_path)
    import app.main as main
    monkeypatch.setattr(main, "TIMELINE_DIR", tmp_path)
    (tmp_path / "mini.json").write_text(json.dumps({
        "title": "Mini", "duration": 1.0, "bpm": 120,
        "cues": [
            {"t": 0.00, "kind": "beat", "intensity": 0.5, "pattern": "tap", "duration_ms": 70},
            {"t": 0.05, "kind": "build", "intensity": 0.7, "pattern": "ramp", "duration_ms": 400, "text": "BUILD"},
            {"t": 0.10, "kind": "drop", "intensity": 1.0, "pattern": "long", "duration_ms": 600, "text": "DROP"},
        ],
    }))
    (tmp_path / "long.json").write_text(json.dumps({
        "title": "Long", "duration": 30.0, "bpm": 120,
        "cues": [{"t": 20.0, "kind": "beat", "intensity": 0.5, "pattern": "tap", "duration_ms": 70}],
    }))
    return tmp_path


def test_presence_counts_watches():
    with TestClient(app) as c:
        with c.websocket_connect("/ws?role=phone&session=p1") as phone:
            p = recv(phone, "presence")
            assert p["payload"] == {"phones": 1, "watches": 0, "controllers": 0}
            with c.websocket_connect("/ws?role=watch&session=p1"):
                p = recv(phone, "presence")
                assert p["payload"]["watches"] == 1
            p = recv(phone, "presence")
            assert p["payload"]["watches"] == 0


def test_phone_cue_is_relayed_to_watch_only():
    with TestClient(app) as c:
        with c.websocket_connect("/ws?role=phone&session=r1") as phone, \
             c.websocket_connect("/ws?role=watch&session=r1") as watch:
            recv(phone, "welcome"); recv(watch, "welcome")
            phone.send_json({"type": "cue", "payload": {"kind": "bass", "intensity": 0.9, "pattern": "pulse"}})
            m = recv(watch, "cue")
            assert m["payload"]["kind"] == "bass"
            # The phone never gets its own cue back: the next thing it sees is our pong.
            phone.send_json({"type": "ping", "payload": {"client_time": 1}})
            m = phone.receive_json()
            while m["type"] in ("presence", "status"):
                m = phone.receive_json()
            assert m["type"] == "pong"


def test_watch_cannot_send_cues():
    with TestClient(app) as c:
        with c.websocket_connect("/ws?role=watch&session=r2") as watch:
            watch.send_json({"type": "cue", "payload": {"kind": "beat"}})
            assert recv(watch, "error")["payload"]["message"] == "watches can't send cues"


def test_new_cue_kinds_accepted():
    with TestClient(app) as c:
        for kind in ("build", "chorus"):
            assert c.post("/sessions/k/cue", json={"kind": kind}).status_code == 200


def test_timeline_plays_real_cues_in_order(tl_dir):
    with TestClient(app) as c:
        assert any(t["name"] == "mini" for t in c.get("/timelines").json())
        with c.websocket_connect("/ws?role=watch&session=tl") as watch:
            recv(watch, "welcome")
            r = c.post("/sessions/tl/timeline/start", json={"name": "mini"})
            assert r.status_code == 200 and r.json()["playing"]
            st = recv(watch, "status")
            assert st["payload"]["audio"] == "listening" and st["payload"]["title"] == "Mini"
            kinds = [recv(watch, "cue")["payload"] for _ in range(3)]
            assert [k["kind"] for k in kinds] == ["beat", "build", "drop"]
            assert kinds[2]["text"] == "DROP" and kinds[2]["at_ms"] == 100
            end = drain_until(watch, "status", lambda m: m["payload"]["audio"] == "idle")
            assert end["payload"]["audio"] == "idle"
        assert c.get("/sessions/tl/timeline").json() == {"playing": False}


def test_timeline_offset_and_stop(tl_dir):
    with TestClient(app) as c:
        with c.websocket_connect("/ws?role=phone&session=tl2") as phone:
            r = c.post("/sessions/tl2/timeline/start", json={"name": "long", "offset_s": 10})
            assert r.json()["position_ms"] >= 10_000
            time.sleep(0.05)
            st = c.get("/sessions/tl2/timeline").json()
            assert st["playing"] and st["position_ms"] >= 10_000
            # Late joiner learns music is playing.
            with c.websocket_connect("/ws?role=watch&session=tl2") as watch:
                assert recv(watch, "status")["payload"]["audio"] == "listening"
                # Movement during a song gets the song position filled in.
                watch.send_json({"type": "movement", "payload": {"gesture": "wave"}})
                mv = recv(phone, "movement_detected")
                assert mv["payload"]["at_ms"] >= 10_000
            c.post("/sessions/tl2/control", json={"action": "stop"})
            assert c.get("/sessions/tl2/timeline").json() == {"playing": False}


def test_unknown_timeline_404(tl_dir):
    with TestClient(app) as c:
        assert c.post("/sessions/x/timeline/start", json={"name": "nope"}).status_code == 404
        assert c.post("/sessions/x/timeline/start", json={"name": "../etc"}).status_code == 404


def test_real_grateful_timeline_ships():
    tl = timeline.load_timeline("grateful")
    kinds = {c["kind"] for c in tl["cues"]}
    assert {"beat", "bass", "build", "drop", "chorus"} <= kinds
    ts = [c["t"] for c in tl["cues"]]
    assert ts == sorted(ts) and min(b - a for a, b in zip(ts, ts[1:])) >= 0.15


def test_integrations_off_by_default():
    with TestClient(app) as c:
        i = c.get("/integrations").json()
        assert i["tiger_data"]["enabled"] is False
        assert c.get("/stats/demo").json()["enabled"] is False
        assert c.get("/dashboard").status_code == 200
        assert c.post("/sessions/demo/status", json={"audio": "listening", "source": "mic"}).status_code == 200


def test_ai_requires_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    with TestClient(app) as c:
        assert c.post("/ai/analyze/grateful").status_code == 400


FAKE = gemini.SongAnalysis(
    summary="Upbeat rap anthem with heavy bass.", genre="hip hop",
    sections=[
        gemini.AISection(start_s=0, end_s=11, label="Intro", mood="restrained", energy=0.3, description="soft piano, waiting"),
        gemini.AISection(start_s=40, end_s=64, label="Build", mood="rising", energy=0.7, description="drums climbing, tension grows"),
        gemini.AISection(start_s=76.5, end_s=102, label="Hook", mood="peak", energy=1, description="huge bass, full band"),
    ],
    moments=[gemini.AIMoment(t_s=0.1, caption="[deep bass hit]")],
)


def test_gemini_merge_puts_words_on_cues():
    tl = {"cues": [
        {"t": 0.1, "kind": "bass", "intensity": 1},
        {"t": 40.0, "kind": "build", "intensity": 0.7, "text": "BUILD"},
        {"t": 76.83, "kind": "drop", "intensity": 1, "text": "DROP"},
        {"t": 80.0, "kind": "beat", "intensity": 0.5},
    ]}
    out = gemini.merge_into_timeline(tl, FAKE)
    c = out["cues"]
    assert c[0]["text"] == "[deep bass hit]"
    assert c[1]["text"] == "drums climbing, tension grows"
    assert c[2]["text"] == "huge bass, full band"
    assert "text" not in c[3]
    assert out["ai"]["genre"] == "hip hop"
    assert [s["mood"] for s in gemini.sections_for_analyzer(FAKE)] == ["restrained", "rising", "peak"]


def test_gemini_call_shape(tmp_path):
    """The SDK call: upload the file, ask for JSON matching SongAnalysis."""
    calls = {}

    class Files:
        def upload(self, file):
            calls["file"] = file
            return "uploaded-handle"

    class Models:
        def generate_content(self, model, contents, config):
            calls.update(model=model, contents=contents, config=config)
            return type("R", (), {"parsed": FAKE, "text": FAKE.model_dump_json()})()

    client = type("C", (), {"files": Files(), "models": Models()})()
    audio = tmp_path / "s.mp3"
    audio.write_bytes(b"x")
    res = gemini._analyze_sync(str(audio), client)
    assert res.genre == "hip hop"
    assert calls["file"] == str(audio) and calls["contents"][1] == "uploaded-handle"
    assert calls["config"].response_mime_type == "application/json"
    assert calls["config"].response_schema is gemini.SongAnalysis


def test_same_id_reconnect_is_not_dropped_when_old_socket_closes():
    """Real-phone bug: a second connection with the same client_id (React dev double-mount,
    two tabs, a reconnect) was deleted from the hub when the first one closed."""
    with TestClient(app) as c:
        first = c.websocket_connect("/ws?role=phone&session=dup&client_id=phone-same")
        first.__enter__()
        recv(first, "welcome")
        with c.websocket_connect("/ws?role=phone&session=dup&client_id=phone-same") as second:
            recv(second, "welcome")
            first.__exit__(None, None, None)  # old socket closes
            time.sleep(0.1)
            assert [x["id"] for x in c.get("/clients?session=dup").json()] == ["phone-same"]
            assert c.post("/sessions/dup/cue", json={"kind": "bass"}).json()["delivered"] == 1
            assert recv(second, "cue")["payload"]["kind"] == "bass"
