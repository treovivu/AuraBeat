"""FastAPI backend: one WebSocket for devices, a few REST routes to push events.

Run:  uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import json
import logging
import os
from typing import Optional

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field, TypeAdapter, ValidationError

import asyncio
import time

from . import gemini
from .attempts import CLOSE_MS, ON_BEAT_MS, RULE_VERSION, attempts
from .hub import Client, hub
from .storage import store
from .timeline import TIMELINE_DIR, list_timelines, load_timeline, player
from .messages import (
    AckMsg,
    AnnouncementMsg,
    AnnouncementPayload,
    AnyMessage,
    AttemptInfoMsg,
    AttemptInfoPayload,
    AttemptMsg,
    ClientMessage,
    ControlMsg,
    ControlPayload,
    CueMsg,
    CuePayload,
    ErrorMsg,
    ErrorPayload,
    MovementDetectedMsg,
    MovementDetectedPayload,
    MovementMsg,
    PingMsg,
    PlaybackMsg,
    PlaybackPayload,
    PongMsg,
    PongPayload,
    PresenceMsg,
    PresencePayload,
    ResultsMsg,
    ResultsPayload,
    ScoreMsg,
    ScorePayload,
    PROTOCOL_VERSION,
    Role,
    StatusMsg,
    StatusPayload,
    WelcomeMsg,
    WelcomePayload,
    new_id,
    now_ms,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

@asynccontextmanager
async def lifespan(_app: FastAPI):
    await store.start()
    ticker = asyncio.create_task(_ticker())
    yield
    ticker.cancel()
    for session in list(player.runs):
        await player.stop(session, announce=False)
    await store.stop()


app = FastAPI(title="AuraBeat backend", version=str(PROTOCOL_VERSION), lifespan=lifespan)

MEDIA_DIR = Path(__file__).resolve().parent.parent / "media"

# Hackathon setting: allow the React dev server and phones on the LAN to call us.
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

_client_msg = TypeAdapter(ClientMessage)

# Remember the latest playback state per session so late joiners can sync.
_last_playback: dict[str, PlaybackMsg] = {}


# ---------------------------------------------------------------------------
# WebSocket: phones and watches connect here
# ---------------------------------------------------------------------------


@app.websocket("/ws")
async def ws_endpoint(
    ws: WebSocket,
    role: Role = Query(...),
    session: str = Query("demo"),
    client_id: Optional[str] = Query(None),
    pair: Optional[str] = Query(None, description="watch only: the phone client_id this watch belongs to"),
):
    await ws.accept()
    client = Client(id=client_id or f"{role}-{new_id()[:6]}", role=role, session=session, ws=ws)
    await hub.add(client)
    if role == "watch" and pair:
        attempts.pairs[client.id] = pair

    await ws.send_text(
        WelcomeMsg(
            session=session,
            payload=WelcomePayload(
                client_id=client.id, role=role, session=session, server_time=now_ms()
            ),
        ).model_dump_json()
    )
    if session in _last_playback:
        await ws.send_text(_last_playback[session].model_dump_json())
    state = player.state(session)
    if state["playing"]:
        await ws.send_text(StatusMsg(session=session, payload=StatusPayload(
            audio="listening", source=state["name"], title=state["title"],
            position_ms=state["position_ms"])).model_dump_json())
    store.record_connection(session, client.id, role, "connect")
    await _announce_presence(session)
    # Arriving late? You still get the last announcement if it's recent.
    recent = [a for a in _announcements.get(session, []) if now_ms() - a.sent_at < ANNOUNCEMENT_TTL_MS]
    if recent:
        await ws.send_text(recent[-1].model_dump_json())

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = _client_msg.validate_json(raw)
            except ValidationError as e:
                await ws.send_text(
                    ErrorMsg(session=session, payload=ErrorPayload(message=_short_error(e))).model_dump_json()
                )
                continue
            await _handle_client_message(client, msg)
    except WebSocketDisconnect:
        pass
    finally:
        # Only clean up if this socket is still the registered one. A newer connection with the
        # same id (reconnect, second tab, React dev double-mount) keeps working.
        if await hub.remove(client.id, client):
            store.record_connection(session, client.id, role, "disconnect")
            if role == "phone":
                att = attempts.close(client.id)
                if att and att.results and not att.finished:
                    _store_results(att)
            attempts.pairs.pop(client.id, None)
        await _announce_presence(session)


async def _announce_presence(session: str) -> None:
    clients = hub.clients(session)
    count = lambda r: sum(1 for c in clients if c.role == r)  # noqa: E731
    msg = PresenceMsg(session=session, payload=PresencePayload(
        phones=count("phone"), watches=count("watch"), controllers=count("controller")))
    await hub.broadcast(msg, session)


async def _handle_client_message(client: Client, msg) -> None:
    if isinstance(msg, PingMsg):
        p = msg.payload
        if p.last_rtt_ms is not None:
            client.rtt_ms.append(p.last_rtt_ms)
            store.record_latency(client.session, client.id, client.role, rtt_ms=p.last_rtt_ms)
        if p.clock_offset_ms is not None:
            client.clock_offset_ms = p.clock_offset_ms
        await client.ws.send_text(
            PongMsg(
                session=client.session,
                payload=PongPayload(client_time=p.client_time, server_time=now_ms()),
            ).model_dump_json()
        )

    elif isinstance(msg, AckMsg):
        sent = hub.cue_sent_at(msg.payload.cue_id)
        if sent is not None:
            offset = client.clock_offset_ms or 0.0
            latency = msg.payload.received_at + offset - sent
            client.cue_latency_ms.append(latency)
            store.record_latency(client.session, client.id, client.role, cue_latency_ms=latency)

    elif isinstance(msg, MovementMsg):
        data = msg.payload.model_dump()
        if data.get("at_ms") is None:
            data["at_ms"] = player.position_ms(client.session)
        relay = MovementDetectedMsg(
            session=client.session,
            payload=MovementDetectedPayload(**data, source_client=client.id),
        )
        await hub.broadcast(relay, client.session, roles=["phone", "controller"])
        store.record_movement(client.session, client.id, data["gesture"], data["confidence"], data["at_ms"])
        if client.role == "watch":
            await _score_wave(client, msg.payload)

    elif isinstance(msg, CueMsg):
        # At-home mode: the phone's video is the clock, so the phone sends haptic cues
        # and we pass them straight to the watches in the session.
        if client.role == "watch":
            await client.ws.send_text(ErrorMsg(session=client.session, payload=ErrorPayload(
                message="watches can't send cues")).model_dump_json())
            return
        att = attempts.get(client.id)
        if att and att.in_quiet_zone(now_ms()):
            # Quiet zone around a target beat: the watch motor must not fake a wave.
            att_quiet[client.id] = att_quiet.get(client.id, 0) + 1
            return
        relay = CueMsg(session=client.session, payload=msg.payload)
        hub.stamp(relay)
        hub.remember_cue(relay.payload.cue_id, relay.sent_at)
        delivered = await hub.broadcast(relay, client.session, roles=["watch"])
        p = relay.payload
        store.record_cue(client.session, p.cue_id, p.kind, p.intensity, p.pattern,
                         p.at_ms or None, f"relay:{client.id}", delivered)

    elif isinstance(msg, AttemptMsg):
        if client.role != "phone":
            return
        att = attempts.open(client.id, client.session, msg.payload)
        await _send_attempt_info(att)

    elif isinstance(msg, PlaybackMsg):
        # Private to this phone's attempt: never broadcast (other phones and the live lightstick
        # must not pause because one person paused their recording).
        att = attempts.get(client.id)
        if client.role != "phone" or not att:
            return
        server_ms = hub.server_time_of(client, msg.payload.client_time)
        if att.apply_playback(msg.payload, server_ms):
            if att.results and not att.finished:
                _store_results(att)
            att.reset()
            await _send_attempt_info(att)
        if msg.payload.state == "ended":
            await _finish(att)


def _short_error(e: ValidationError) -> str:
    first = e.errors()[0]
    loc = ".".join(str(x) for x in first.get("loc", []))
    return f"invalid message at {loc or 'root'}: {first.get('msg')}"


# ---------------------------------------------------------------------------
# REST: whoever generates music events (fake generator, audio analysis,
# At-home timeline) POSTs here and the server fans out to devices.
# ---------------------------------------------------------------------------


@app.get("/health")
def health():
    return {"ok": True, "server_time": now_ms(), "protocol_version": PROTOCOL_VERSION}


@app.get("/clients")
def list_clients(session: Optional[str] = None):
    return [c.summary() for c in hub.clients(session)]


@app.post("/sessions/{session}/cue")
async def send_cue(session: str, cue: CuePayload, roles: Optional[list[Role]] = Query(None)):
    msg = CueMsg(session=session, payload=cue)
    hub.stamp(msg)
    hub.remember_cue(cue.cue_id, msg.sent_at)
    _touch_live_source(session)
    delivered = await hub.broadcast(msg, session, roles=roles or ["phone", "watch"])
    store.record_cue(session, cue.cue_id, cue.kind, cue.intensity, cue.pattern, cue.at_ms or None, "api", delivered)
    return {"delivered": delivered, "message": msg}


@app.post("/sessions/{session}/cues")
async def send_cues(session: str, cues: list[CuePayload]):
    """Send several cues back to back (e.g. a chord of bass + flash)."""
    _touch_live_source(session)
    total = 0
    for cue in cues:
        msg = CueMsg(session=session, payload=cue)
        hub.stamp(msg)
        hub.remember_cue(cue.cue_id, msg.sent_at)
        n = await hub.broadcast(msg, session, roles=["phone", "watch"])
        store.record_cue(session, cue.cue_id, cue.kind, cue.intensity, cue.pattern, cue.at_ms or None, "api", n)
        total += n
    return {"cues": len(cues), "deliveries": total}


@app.post("/sessions/{session}/playback")
async def set_playback(session: str, playback: PlaybackPayload):
    msg = PlaybackMsg(session=session, payload=playback)
    _last_playback[session] = msg
    delivered = await hub.broadcast(msg, session)
    return {"delivered": delivered, "message": msg}


@app.post("/sessions/{session}/control")
async def send_control(session: str, control: ControlPayload):
    msg = ControlMsg(session=session, payload=control)
    if control.action in ("stop", "reset"):
        _last_playback.pop(session, None)
        await player.stop(session, announce=False)
    delivered = await hub.broadcast(msg, session)
    return {"delivered": delivered, "message": msg}


@app.get("/schema")
def schema():
    """JSON Schema for every message type, so the phone/watch teams can check their parsers."""
    return TypeAdapter(AnyMessage).json_schema()


@app.get("/schema/examples")
def examples():
    """One concrete example of each message, copy-paste friendly."""
    s = "demo"
    return {
        "cue": json.loads(CueMsg(session=s, payload=CuePayload(kind="bass", intensity=1.0, duration_ms=200, pattern="pulse", color="#FF3EA5")).model_dump_json()),
        "playback": json.loads(PlaybackMsg(session=s, payload=PlaybackPayload(state="playing", position_ms=0, media_id="song1")).model_dump_json()),
        "control": json.loads(ControlMsg(session=s, payload=ControlPayload(action="haptics_off")).model_dump_json()),
        "movement (watch -> server)": {"type": "movement", "session": s, "payload": {"gesture": "wave", "confidence": 0.9, "at_ms": 45200}},
        "movement_detected": json.loads(MovementDetectedMsg(session=s, payload=MovementDetectedPayload(gesture="wave", confidence=0.9, at_ms=45200, source_client="watch-ab12cd")).model_dump_json()),
        "ping (client -> server)": {"type": "ping", "payload": {"client_time": now_ms()}},
        "ack (client -> server)": {"type": "ack", "payload": {"cue_id": "abc123def456", "received_at": now_ms()}},
    }


# ---------------------------------------------------------------------------
# GET /test : a tiny phone page that connects as role=phone and flashes on
# every cue. Proves the phone path works without Vy's app, and works as a
# backup lightstick.
# ---------------------------------------------------------------------------

_TEST_PAGE = """<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<title>Backend test</title>
<style>
  html,body{margin:0;height:100%;background:#000;color:#fff;font-family:-apple-system,system-ui,sans-serif;overflow:hidden}
  #stage{position:fixed;inset:0;background:#000;transition:background-color .25s ease-out}
  #hud{position:fixed;left:16px;right:16px;top:16px;font-size:14px;line-height:1.5;mix-blend-mode:difference}
  #dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#f33;margin-right:6px}
  #big{position:fixed;left:16px;right:16px;top:45%;text-align:center;font-size:34px;font-weight:700;mix-blend-mode:difference}
  #count{position:fixed;left:16px;bottom:24px;font-size:13px;opacity:.7;mix-blend-mode:difference}
</style></head>
<body>
<div id="stage"></div>
<div id="hud"><span id="dot"></span><span id="status">connecting...</span><br><span id="lat"></span></div>
<div id="big"></div>
<div id="count">cues: 0</div>
<script>
const stage=document.getElementById('stage'),statusEl=document.getElementById('status'),
      dot=document.getElementById('dot'),lat=document.getElementById('lat'),
      big=document.getElementById('big'),countEl=document.getElementById('count');
let ws,rtt=null,offset=null,cues=0,pingTimer;
const KIND_COLOR={beat:'#3EA5FF',bass:'#FF3EA5',percussion:'#FFFFFF',drop:'#FFC83E',get_ready:'#FFC83E',wave:'#FFFFFF'};

function flash(color,intensity,ms){
  stage.style.transition='none';
  stage.style.backgroundColor=color;
  stage.style.opacity=Math.max(.25,intensity);
  requestAnimationFrame(()=>{requestAnimationFrame(()=>{
    stage.style.transition='background-color '+Math.max(150,ms)+'ms ease-out';
    stage.style.backgroundColor='#000';
  });});
}

function connect(){
  const proto=location.protocol==='https:'?'wss':'ws';
  ws=new WebSocket(proto+'://'+location.host+'/ws?role=phone&session=demo&client_id=test-page');
  ws.onopen=()=>{statusEl.textContent='connected';dot.style.background='#3d3';
    pingTimer=setInterval(()=>ws.send(JSON.stringify({type:'ping',payload:{client_time:Date.now(),last_rtt_ms:rtt,clock_offset_ms:offset}})),2000);};
  ws.onclose=()=>{statusEl.textContent='disconnected, retrying...';dot.style.background='#f33';
    clearInterval(pingTimer);setTimeout(connect,1500);};
  ws.onmessage=(e)=>{
    const now=Date.now(),m=JSON.parse(e.data),p=m.payload;
    if(m.type==='pong'){rtt=now-p.client_time;offset=p.server_time-(p.client_time+rtt/2);
      lat.textContent='round trip: '+rtt+' ms';return;}
    if(m.type==='cue'){
      cues++;countEl.textContent='cues: '+cues+'  last: '+p.kind;
      ws.send(JSON.stringify({type:'ack',payload:{cue_id:p.cue_id,received_at:now}}));
      if(p.text) big.textContent=p.text; else if(p.kind!=='lyric') big.textContent='';
      if(p.pattern!=='none') flash(p.color||KIND_COLOR[p.kind]||'#fff',p.intensity,p.duration_ms);
      if(navigator.vibrate&&p.pattern!=='none') navigator.vibrate(Math.min(p.duration_ms,400));
    }
    if(m.type==='control'){big.textContent=p.action==='stop'?'STOPPED':p.action.replace('_',' ').toUpperCase();
      setTimeout(()=>{if(big.textContent!=='')big.textContent='';},1500);}
    if(m.type==='movement_detected'){big.textContent='WAVE DETECTED!';flash('#3d3',1,800);}
  };
}
connect();
</script></body></html>"""


@app.get("/test", response_class=HTMLResponse)
def test_page():
    return _TEST_PAGE


# ---------------------------------------------------------------------------
# Real songs: play a prepared timeline (scripts/analyze_song.py) to every device
# ---------------------------------------------------------------------------


class TimelineStart(BaseModel):
    name: str = Field("grateful", description="timelines/<name>.json")
    offset_s: float = Field(0.0, ge=0, description="start this many seconds into the song")
    lead_ms: int = Field(0, ge=0, le=10_000, description="wait this long before the first cue")


@app.get("/timelines")
def get_timelines():
    return list_timelines()


@app.post("/sessions/{session}/timeline/start")
async def timeline_start(session: str, body: TimelineStart):
    try:
        return await player.start(session, body.name, body.offset_s, body.lead_ms)
    except FileNotFoundError:
        raise HTTPException(404, f"no timeline named {body.name!r}; see GET /timelines")


@app.post("/sessions/{session}/timeline/stop")
async def timeline_stop(session: str):
    await player.stop(session)
    return {"playing": False}


@app.get("/sessions/{session}/timeline")
def timeline_state(session: str):
    return player.state(session)


@app.post("/sessions/{session}/status")
async def set_status(session: str, status: StatusPayload):
    """For live sources (e.g. the mic listener) to say whether they hear music. Live sources should
    repeat this every ~2 s: if they go quiet for 5 s, phones are told the audio source is unavailable."""
    if status.source and status.audio in ("listening", "lost"):
        _live_sources[session] = {"source": status.source, "last": time.monotonic(), "down": False}
    elif status.audio == "idle":
        _live_sources.pop(session, None)
    delivered = await hub.broadcast(StatusMsg(session=session, payload=status), session)
    return {"delivered": delivered}


# ---------------------------------------------------------------------------
# Tiger Data: show analytics
# ---------------------------------------------------------------------------


@app.get("/stats/{session}")
async def stats(session: str, minutes: int = Query(60, ge=1, le=60 * 24 * 7)):
    return await store.stats(session, minutes)


@app.get("/integrations")
def integrations():
    return {
        "tiger_data": {"enabled": store.enabled, "rows_written": store.written,
                       "continuous_aggregate": store.has_cagg, "error": store.error},
        "gemini": {"enabled": gemini.enabled(), "model": gemini.model_name()},
    }


@app.get("/dashboard", response_class=HTMLResponse)
def dashboard():
    return (Path(__file__).resolve().parent / "dashboard.html").read_text()


# ---------------------------------------------------------------------------
# Gemini: describe a song for Deaf and hard-of-hearing fans
# ---------------------------------------------------------------------------


def _media_for(name: str) -> Path:
    for ext in (".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"):
        p = MEDIA_DIR / f"{name}{ext}"
        if p.exists():
            return p
    raise HTTPException(404, f"put the song's audio at media/{name}.mp3")


@app.post("/ai/analyze/{name}")
async def ai_analyze(name: str, merge: bool = True):
    """Gemini listens to media/<name>.mp3, saves timelines/<name>.ai.json, and (merge=true) writes its
    descriptions onto the BUILD/DROP/CHORUS cues of timelines/<name>.json."""
    if not gemini.enabled():
        raise HTTPException(400, "set GEMINI_API_KEY first")
    audio = _media_for(name)
    try:
        analysis = await gemini.analyze(str(audio))
    except Exception as e:
        raise HTTPException(502, f"Gemini failed: {type(e).__name__}: {e}")
    gemini.save_analysis(name, analysis, TIMELINE_DIR)
    result = {"analysis": analysis.model_dump(), "merged": False}
    if merge:
        try:
            tl = load_timeline(name)
        except FileNotFoundError:
            return result
        tl = gemini.merge_into_timeline(tl, analysis)
        (TIMELINE_DIR / f"{name}.json").write_text(json.dumps(tl, indent=1))
        result["merged"] = True
        result["captioned_cues"] = sum(1 for c in tl["cues"] if c.get("text"))
    return result


@app.get("/ai/{name}")
def ai_result(name: str):
    path = TIMELINE_DIR / f"{name}.ai.json"
    if not path.exists():
        raise HTTPException(404, "not analyzed yet; POST /ai/analyze/{name}")
    return json.loads(path.read_text())


# ---------------------------------------------------------------------------
# At-home Play Along: scoring (rules in app/attempts.py)
# ---------------------------------------------------------------------------

att_quiet: dict[str, int] = {}  # phone id -> haptic cues held back in quiet zones (for the stats page)


async def _send_attempt_info(att) -> None:
    await hub.send_to(att.owner, AttemptInfoMsg(session=att.session, payload=AttemptInfoPayload(
        attempt_id=att.attempt_id, version=att.version, play_along=att.spec.play_along,
        targets=att.targets, rule_version=RULE_VERSION,
        window_ms={"on_beat": ON_BEAT_MS, "close": CLOSE_MS})))


async def _send_score(att, target_id: str, result: str, points: int, offset) -> None:
    t = att.totals()
    await hub.send_to(att.owner, ScoreMsg(session=att.session, payload=ScorePayload(
        attempt_id=att.attempt_id, target_id=target_id, result=result, points=points, offset_ms=offset,
        total=t["total"], hits=t["hits"], judged=t["judged"], targets=t["targets"], rule_version=RULE_VERSION)))


def _store_results(att) -> None:
    t = att.totals()
    store.record_attempt(att.session, att.attempt_id, att.owner, att.spec.media_id, t["total"], t["on_beat"],
                         t["close"], t["missed"], t["targets"], RULE_VERSION)


async def _finish(att) -> None:
    if att.finished or not att.spec.play_along or not att.targets:
        return
    att.finished = True
    t = att.totals()
    await hub.send_to(att.owner, ResultsMsg(session=att.session, payload=ResultsPayload(
        attempt_id=att.attempt_id, total=t["total"], on_beat=t["on_beat"], close=t["close"],
        missed=t["missed"], targets=t["targets"], rule_version=RULE_VERSION)))
    _store_results(att)


async def _score_wave(watch: Client, payload) -> None:
    att = attempts.for_watch(watch.id, watch.session)
    if not att:
        return
    wave_ms = hub.server_time_of(watch, payload.client_time)
    judged = att.judge_wave(watch.id, wave_ms, payload.confidence)
    if judged:
        target, result, pts, off = judged
        await _send_score(att, target.id, result, pts, off)
        if att.is_done(wave_ms):
            await _finish(att)


# ---------------------------------------------------------------------------
# Live audio source watchdog: never pretend to hear music we don't
# ---------------------------------------------------------------------------

_live_sources: dict[str, dict] = {}
LIVE_SOURCE_TIMEOUT_S = 5.0


def _touch_live_source(session: str) -> None:
    src = _live_sources.get(session)
    if src:
        src["last"] = time.monotonic()


async def _ticker() -> None:
    """10x a second: call missed targets, finish attempts, and flag a silent live audio source."""
    while True:
        await asyncio.sleep(0.1)
        try:
            now = now_ms()
            for att in list(attempts.by_phone.values()):
                for t in att.sweep_missed(now):
                    await _send_score(att, t.id, "missed", 0, None)
                if att.is_done(now):
                    await _finish(att)
            mono = time.monotonic()
            for session, src in list(_live_sources.items()):
                if not src["down"] and mono - src["last"] > LIVE_SOURCE_TIMEOUT_S:
                    src["down"] = True
                    await hub.broadcast(StatusMsg(session=session, payload=StatusPayload(
                        audio="lost", source=src["source"], title="Audio source unavailable")), session)
        except Exception as e:  # the ticker must never die
            logging.getLogger("ticker").warning("tick failed: %s", e)


@app.get("/attempts")
def list_attempts(session: Optional[str] = None):
    out = []
    for a in attempts.by_phone.values():
        if session and a.session != session:
            continue
        out.append({"attempt_id": a.attempt_id, "phone": a.owner, "media_id": a.spec.media_id,
                    "play_along": a.spec.play_along, "state": a.state, "version": a.version,
                    "position_ms": a.position_at(now_ms()), "finished": a.finished,
                    "quiet_zone_holds": att_quiet.get(a.owner, 0),
                    "target_beats": [t.model_dump() for t in a.targets],
                    "results": {k: {"result": r[0], "points": r[1], "offset_ms": r[2]} for k, r in a.results.items()},
                    **a.totals()})
    return out


# ---------------------------------------------------------------------------
# Announcements: what the PA says, as words on every phone and a tap on every watch
# ---------------------------------------------------------------------------

_announcements: dict[str, list] = {}
ANNOUNCEMENT_TTL_MS = 15 * 60 * 1000


@app.post("/sessions/{session}/announce")
async def announce(session: str, body: AnnouncementPayload):
    msg = AnnouncementMsg(session=session, payload=body)
    _announcements.setdefault(session, []).append(msg)
    _announcements[session] = _announcements[session][-20:]
    delivered = await hub.broadcast(msg, session)
    store.record_announcement(session, body.id, body.text, body.urgent, delivered)
    return {"delivered": delivered, "message": msg}


@app.get("/sessions/{session}/announcements")
def get_announcements(session: str):
    return [a.payload.model_dump() | {"sent_at": a.sent_at} for a in _announcements.get(session, [])]


@app.get("/lightstick", response_class=HTMLResponse)
def lightstick_page():
    """Ambient colour lightstick (standalone page). Pairs with scripts/live_lightstick.py."""
    return (Path(__file__).resolve().parent / "static" / "lightstick.html").read_text()


# ---------------------------------------------------------------------------
# Serve the built phone app from the same address (deployment): one HTTPS URL, and the app's
# WebSocket is same-origin wss://. Set FRONTEND_DIST, or `npm run build` in the repo root (../dist).
# Mounted last, so every API route above wins.
# ---------------------------------------------------------------------------

def _frontend_dist() -> Optional[Path]:
    env = os.getenv("FRONTEND_DIST")
    candidates = [Path(env)] if env else []
    root = Path(__file__).resolve().parent.parent
    # root.parent / "dist": the frontend repo this backend lives in (backend/ sits next to package.json).
    candidates += [root / "frontend_dist", root.parent / "dist", root.parent / "AuraBeat" / "dist",
                   root.parent / "frontend" / "dist"]
    return next((p for p in candidates if (p / "index.html").exists()), None)


_dist = _frontend_dist()
if _dist:
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="app")
