"""Acceptance tests from the project spec, section 8 and 17."""

import time

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.attempts import compute_targets
from app.messages import AttemptPayload, WaveWindow, now_ms

# 120 BPM, one beat per "bar" -> a target every 0.5 s. Window 1.0-2.5 s -> targets 1000, 1500, 2000 ms.
ATTEMPT = {"media_id": "test-song", "title": "Test", "play_along": True, "bpm": 120, "downbeat_anchor": 0,
           "beats_per_bar": 1, "duration": 10, "windows": [{"id": "w", "start": 1.0, "end": 2.5}]}


def recv(ws, want, limit=200):
    for _ in range(limit):
        m = ws.receive_json()
        if m["type"] == want:
            return m
    raise AssertionError(f"no {want}")


def sync_clock(ws):
    """Tell the server this device's clock equals server time (offset 0), so client_time maps 1:1."""
    ws.send_json({"type": "ping", "payload": {"client_time": now_ms(), "clock_offset_ms": 0, "last_rtt_ms": 1}})
    recv(ws, "pong")


def start(phone, position_ms, version=0):
    phone.send_json({"type": "playback", "payload": {"state": "playing", "position_ms": 0, "version": version,
                                                     "client_time": now_ms() - position_ms}})


def test_targets_are_bar_downbeats_inside_windows():
    a = AttemptPayload(media_id="g", bpm=75.03, downbeat_anchor=76.82, duration=182,
                       windows=[WaveWindow(id="hook", start=76.62, end=89.57),
                                WaveWindow(id="final", start=153.31, end=165.69)])
    ts = [t.t_ms for t in compute_targets(a)]
    assert ts[:4] == [76820, 80019, 83217, 86416]
    assert len(ts) == 8 and min(b - a for a, b in zip(ts, ts[1:])) > 3000


def test_full_attempt_scoring_dedupe_missed_and_results():
    with TestClient(main.app) as c:
        with c.websocket_connect("/ws?role=phone&session=pa&client_id=phone-A") as phone, \
             c.websocket_connect("/ws?role=watch&session=pa&client_id=watch-A") as watch:
            sync_clock(phone); sync_clock(watch)
            phone.send_json({"type": "attempt", "payload": ATTEMPT})
            info = recv(phone, "attempt")["payload"]
            assert [t["t_ms"] for t in info["targets"]] == [1000, 1500, 2000]
            assert info["rule_version"] == "v1"

            t0 = now_ms() - 1200          # song position "now" = 1.2 s
            start(phone, 1200)
            time.sleep(0.05)

            def wave(pos):
                watch.send_json({"type": "movement", "payload": {"gesture": "wave", "confidence": 0.9,
                                                                 "client_time": t0 + pos}})

            wave(1080)                      # +80 ms from 1000 -> on beat
            s = recv(phone, "score")["payload"]
            assert (s["target_id"], s["result"], s["points"], s["offset_ms"]) == ("w-1", "on_beat", 100, 80)

            wave(1300)                      # 220 ms later: cooldown, one wave can't score twice
            wave(1820)                      # nearest unjudged target is 2000 (-180) -> on beat
            s = recv(phone, "score")["payload"]
            assert (s["target_id"], s["result"], s["points"]) == ("w-3", "on_beat", 100)
            assert s["total"] == 200

            # 1500 was never waved at: once the music passes it, it's missed (only while playing).
            s = recv(phone, "score")["payload"]
            assert (s["target_id"], s["result"], s["points"]) == ("w-2", "missed", 0)

            r = recv(phone, "results")["payload"]
            assert (r["total"], r["on_beat"], r["close"], r["missed"], r["targets"]) == (200, 2, 0, 1, 3)


def test_close_window_and_outside_window():
    with TestClient(main.app) as c:
        with c.websocket_connect("/ws?role=phone&session=pc&client_id=phone-C") as phone, \
             c.websocket_connect("/ws?role=watch&session=pc&client_id=watch-C") as watch:
            sync_clock(phone); sync_clock(watch)
            # 60 BPM: targets a full second apart (1000, 2000), like the real song's 3.2 s spacing.
            phone.send_json({"type": "attempt", "payload": {**ATTEMPT, "bpm": 60}})
            assert [t["t_ms"] for t in recv(phone, "attempt")["payload"]["targets"]] == [1000, 2000]
            t0 = now_ms() - 900
            start(phone, 900)
            time.sleep(0.05)
            watch.send_json({"type": "movement", "payload": {"client_time": t0 + 600}})   # 400 ms early: nothing
            watch.send_json({"type": "movement", "payload": {"client_time": t0 + 1300}})  # +300: close
            s = recv(phone, "score")["payload"]
            assert (s["target_id"], s["result"], s["points"]) == ("w-1", "close", 50)


def test_low_confidence_and_play_along_off_never_score():
    with TestClient(main.app) as c:
        with c.websocket_connect("/ws?role=phone&session=pd&client_id=phone-D") as phone, \
             c.websocket_connect("/ws?role=watch&session=pd&client_id=watch-D") as watch:
            sync_clock(phone); sync_clock(watch)
            phone.send_json({"type": "attempt", "payload": {**ATTEMPT, "play_along": False}})
            recv(phone, "attempt")
            t0 = now_ms() - 1000
            start(phone, 1000)
            time.sleep(0.05)
            watch.send_json({"type": "movement", "payload": {"client_time": t0 + 1000}})
            time.sleep(0.2)
            assert main.attempts.get("phone-D").results == {}
            phone.send_json({"type": "attempt", "payload": ATTEMPT})  # Play Along back on
            recv(phone, "attempt")
            watch.send_json({"type": "movement", "payload": {"confidence": 0.2, "client_time": t0 + 1500}})
            time.sleep(0.2)
            assert "w-2" not in main.attempts.get("phone-D").results


def test_still_wrist_quiet_zone_holds_haptics_near_targets():
    with TestClient(main.app) as c:
        with c.websocket_connect("/ws?role=phone&session=pq&client_id=phone-Q") as phone, \
             c.websocket_connect("/ws?role=watch&session=pq&client_id=watch-Q") as watch:
            sync_clock(phone); sync_clock(watch)
            phone.send_json({"type": "attempt", "payload": {**ATTEMPT, "windows": [{"id": "w", "start": 5, "end": 9}]}})
            recv(phone, "attempt")
            start(phone, 5000)  # exactly on target 5000: inside the quiet zone
            time.sleep(0.05)
            phone.send_json({"type": "cue", "payload": {"kind": "beat", "intensity": 1}})
            time.sleep(0.1)
            assert main.att_quiet.get("phone-Q", 0) >= 1
            # The watch got nothing: its next message is our pong.
            watch.send_json({"type": "ping", "payload": {"client_time": now_ms()}})
            m = watch.receive_json()
            while m["type"] in ("presence", "status", "attempt"):
                m = watch.receive_json()
            assert m["type"] == "pong"


def test_pause_stops_missed_and_seek_resets_attempt():
    with TestClient(main.app) as c:
        with c.websocket_connect("/ws?role=phone&session=ps&client_id=phone-S") as phone:
            sync_clock(phone)
            phone.send_json({"type": "attempt", "payload": ATTEMPT})
            first = recv(phone, "attempt")["payload"]["attempt_id"]
            phone.send_json({"type": "playback", "payload": {"state": "paused", "position_ms": 900, "version": 0,
                                                             "client_time": now_ms()}})
            time.sleep(1.5)  # paused: the clock doesn't move, nothing is missed
            assert main.attempts.get("phone-S").results == {}
            phone.send_json({"type": "playback", "payload": {"state": "playing", "position_ms": 0, "version": 1,
                                                             "client_time": now_ms()}})
            again = recv(phone, "attempt")["payload"]
            assert again["attempt_id"] != first and again["version"] == 1


def test_scores_are_private_to_the_attempt_owner():
    with TestClient(main.app) as c:
        with c.websocket_connect("/ws?role=phone&session=pp&client_id=phone-P1") as p1, \
             c.websocket_connect("/ws?role=phone&session=pp&client_id=phone-P2") as p2, \
             c.websocket_connect("/ws?role=watch&session=pp&client_id=watch-P&pair=phone-P1") as watch:
            sync_clock(p1); sync_clock(watch)
            p1.send_json({"type": "attempt", "payload": ATTEMPT})
            recv(p1, "attempt")
            t0 = now_ms() - 1000
            start(p1, 1000)
            time.sleep(0.05)
            watch.send_json({"type": "movement", "payload": {"client_time": t0 + 1000}})
            assert recv(p1, "score")["payload"]["result"] == "on_beat"
            p2.send_json({"type": "ping", "payload": {"client_time": now_ms()}})
            m = p2.receive_json()
            while m["type"] != "pong":
                assert m["type"] not in ("score", "attempt", "results")
                m = p2.receive_json()


def test_announcement_reaches_everyone_and_late_joiners():
    with TestClient(main.app) as c:
        with c.websocket_connect("/ws?role=phone&session=an") as phone, \
             c.websocket_connect("/ws?role=watch&session=an") as watch:
            r = c.post("/sessions/an/announce", json={"text": "Encore in 5 minutes", "urgent": False})
            assert r.json()["delivered"] == 2
            assert recv(phone, "announcement")["payload"]["text"] == "Encore in 5 minutes"
            assert recv(watch, "announcement")["payload"]["urgent"] is False
        with c.websocket_connect("/ws?role=phone&session=an") as late:
            assert recv(late, "announcement")["payload"]["text"] == "Encore in 5 minutes"
        assert c.get("/sessions/an/announcements").json()[0]["text"] == "Encore in 5 minutes"


def test_silent_mic_is_reported_unavailable(monkeypatch):
    monkeypatch.setattr(main, "LIVE_SOURCE_TIMEOUT_S", 0.3)
    with TestClient(main.app) as c:
        with c.websocket_connect("/ws?role=phone&session=mic") as phone:
            c.post("/sessions/mic/status", json={"audio": "listening", "source": "mic"})
            assert recv(phone, "status")["payload"]["audio"] == "listening"
            m = recv(phone, "status")
            assert m["payload"] == {"audio": "lost", "source": "mic", "title": "Audio source unavailable",
                                    "position_ms": None}


def test_cues_carry_sequence_and_display_time():
    with TestClient(main.app) as c:
        with c.websocket_connect("/ws?role=phone&session=sq") as phone:
            c.post("/sessions/sq/cue", json={"kind": "bass"})
            c.post("/sessions/sq/cue", json={"kind": "beat"})
            a, b = recv(phone, "cue"), recv(phone, "cue")
            assert b["seq"] == a["seq"] + 1
            assert a["display_at"] - a["sent_at"] == 150
