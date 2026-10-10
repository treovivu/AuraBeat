"""Shared message structure for the phone, watch and backend.

Every message on the wire is one JSON object with the same envelope:

    {
      "v": 1,
      "type": "cue",
      "id": "b3c1...",
      "session": "demo",
      "sent_at": 1760044800123,   # server Unix time in ms
      "payload": { ... }          # shape depends on "type"
    }

Server -> clients:  welcome, cue, playback, control, movement_detected, status, presence,
                    attempt, score, results, announcement, pong, error
Clients -> server:  ping, ack, movement,
                    cue (phones only: relayed to the watches, used by At-home mode),
                    attempt + playback (phones only: At-home Play Along, private to that phone)
"""

from __future__ import annotations

import time
import uuid
from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, Field

PROTOCOL_VERSION = 1


def now_ms() -> int:
    return int(time.time() * 1000)


def new_id() -> str:
    return uuid.uuid4().hex[:12]


# ---------------------------------------------------------------------------
# Shared vocabularies. Change these here, then regenerate shared/ types.
# ---------------------------------------------------------------------------

Role = Literal["phone", "watch", "controller"]

CueKind = Literal[
    "beat",        # regular pulse
    "bass",        # low-end hit, strongest haptic
    "percussion",  # snare / hi-hat, short tap
    "drop",        # big moment, long buzz + full lightstick flash
    "build",       # energy rising before a drop
    "chorus",      # the hook has arrived, settle into pulse
    "lyric",       # lyric line change (At-home mode)
    "get_ready",   # "GET READY" prompt before a wave section
    "wave",        # "WAVE WITH THE MUSIC" window opens
]

HapticPattern = Literal["tap", "double_tap", "pulse", "long", "ramp", "none"]

ControlAction = Literal["stop", "haptics_on", "haptics_off", "reset"]

PlaybackState = Literal["playing", "paused", "stopped", "buffering", "ended"]

Gesture = Literal["wave"]

AudioStatus = Literal["listening", "lost", "idle"]


# ---------------------------------------------------------------------------
# Payloads
# ---------------------------------------------------------------------------


class CuePayload(BaseModel):
    cue_id: str = Field(default_factory=new_id)
    kind: CueKind
    at_ms: int = Field(
        0, ge=0,
        description="Position in the song/video this cue belongs to (ms). 0 for live cues.",
    )
    intensity: float = Field(0.8, ge=0.0, le=1.0, description="Haptic strength + lightstick brightness")
    duration_ms: int = Field(120, ge=0, le=10_000)
    pattern: HapticPattern = "tap"
    color: Optional[str] = Field(None, description="Lightstick hex color, e.g. #FF3EA5")
    text: Optional[str] = Field(None, description="Lyric line or on-screen prompt")


class PlaybackPayload(BaseModel):
    """The phone's video position. The phone's player is the source of truth for At-home mode."""
    state: PlaybackState
    position_ms: int = Field(ge=0)
    media_id: Optional[str] = None
    version: int = Field(0, ge=0, description="Bumped by the phone on every seek/restart")
    client_time: Optional[int] = Field(None, description="Phone clock (ms) when position_ms was read")


class WaveWindow(BaseModel):
    id: str
    start: float = Field(ge=0, description="seconds")
    end: float = Field(ge=0, description="seconds")


class AttemptPayload(BaseModel):
    """Phone -> server when an At-home performance is opened (and when Play Along changes)."""
    media_id: str
    title: Optional[str] = None
    play_along: bool = True
    bpm: float = Field(gt=0, le=400)
    downbeat_anchor: float = Field(ge=0, description="a time (s) known to be beat 1 of a bar")
    beats_per_bar: int = Field(4, ge=1, le=12)
    duration: float = Field(gt=0)
    windows: list[WaveWindow] = Field(default_factory=list)


class Target(BaseModel):
    id: str
    t_ms: int


class AttemptInfoPayload(BaseModel):
    """Server -> phone: the target beats for this attempt, so the phone can show them."""
    attempt_id: str
    version: int
    play_along: bool
    targets: list[Target]
    rule_version: str
    window_ms: dict[str, int]


ScoreResult = Literal["on_beat", "close", "missed"]


class ScorePayload(BaseModel):
    attempt_id: str
    target_id: str
    result: ScoreResult
    points: int
    offset_ms: Optional[int] = Field(None, description="wave time minus target time; negative = early")
    total: int
    hits: int
    judged: int
    targets: int
    rule_version: str


class ResultsPayload(BaseModel):
    attempt_id: str
    total: int
    on_beat: int
    close: int
    missed: int
    targets: int
    rule_version: str


class AnnouncementPayload(BaseModel):
    """Venue staff -> every phone and watch: what was said over the PA, in words."""
    id: str = Field(default_factory=new_id)
    text: str = Field(min_length=1, max_length=280)
    urgent: bool = False


class ControlPayload(BaseModel):
    action: ControlAction


class MovementPayload(BaseModel):
    """Watch -> server when it detects an intentional wrist wave."""
    gesture: Gesture = "wave"
    confidence: float = Field(1.0, ge=0.0, le=1.0)
    at_ms: Optional[int] = Field(None, description="Playback position when detected, if known")
    client_time: Optional[int] = Field(
        None, description="Watch clock (ms) when the wave happened. Scoring uses this, not arrival time."
    )


class MovementDetectedPayload(MovementPayload):
    """Server -> phones, relaying a watch movement."""
    source_client: str


class PingPayload(BaseModel):
    client_time: int = Field(description="Client clock in ms when ping was sent")
    # Optional: what the client measured from its previous ping/pong, so the
    # server can show per-device latency at GET /clients.
    last_rtt_ms: Optional[float] = None
    clock_offset_ms: Optional[float] = Field(
        None, description="server_time - client_time, estimated by the client"
    )


class PongPayload(BaseModel):
    client_time: int
    server_time: int


class AckPayload(BaseModel):
    """Client -> server after acting on a cue, for latency measurement."""
    cue_id: str
    received_at: int = Field(description="Client clock in ms when the cue arrived")


class StatusPayload(BaseModel):
    """What the music source is doing, so phones can show "Listening" vs "Waiting for audio"."""
    audio: AudioStatus
    source: Optional[str] = Field(None, description="timeline name, 'mic', 'fake', ...")
    title: Optional[str] = None
    position_ms: Optional[int] = None


class PresencePayload(BaseModel):
    """Who is connected to this session. Sent to everyone whenever it changes."""
    phones: int
    watches: int
    controllers: int


class WelcomePayload(BaseModel):
    client_id: str
    role: Role
    session: str
    server_time: int
    protocol_version: int = PROTOCOL_VERSION


class ErrorPayload(BaseModel):
    message: str


# ---------------------------------------------------------------------------
# Envelopes (discriminated on "type")
# ---------------------------------------------------------------------------


class _Envelope(BaseModel):
    v: int = PROTOCOL_VERSION
    id: str = Field(default_factory=new_id)
    session: str = "demo"
    sent_at: int = Field(default_factory=now_ms)


class CueMsg(_Envelope):
    type: Literal["cue"] = "cue"
    payload: CuePayload
    seq: Optional[int] = Field(None, description="Per-session cue counter; phones drop older cues")
    display_at: Optional[int] = Field(
        None, description="Server ms when every phone should show this cue (shared lightstick sync)"
    )


class PlaybackMsg(_Envelope):
    type: Literal["playback"] = "playback"
    payload: PlaybackPayload


class ControlMsg(_Envelope):
    type: Literal["control"] = "control"
    payload: ControlPayload


class MovementMsg(_Envelope):
    type: Literal["movement"] = "movement"
    payload: MovementPayload


class MovementDetectedMsg(_Envelope):
    type: Literal["movement_detected"] = "movement_detected"
    payload: MovementDetectedPayload


class PingMsg(_Envelope):
    type: Literal["ping"] = "ping"
    payload: PingPayload


class PongMsg(_Envelope):
    type: Literal["pong"] = "pong"
    payload: PongPayload


class AckMsg(_Envelope):
    type: Literal["ack"] = "ack"
    payload: AckPayload


class WelcomeMsg(_Envelope):
    type: Literal["welcome"] = "welcome"
    payload: WelcomePayload


class AttemptMsg(_Envelope):
    type: Literal["attempt"] = "attempt"
    payload: AttemptPayload


class AttemptInfoMsg(_Envelope):
    type: Literal["attempt"] = "attempt"
    payload: AttemptInfoPayload


class ScoreMsg(_Envelope):
    type: Literal["score"] = "score"
    payload: ScorePayload


class ResultsMsg(_Envelope):
    type: Literal["results"] = "results"
    payload: ResultsPayload


class AnnouncementMsg(_Envelope):
    type: Literal["announcement"] = "announcement"
    payload: AnnouncementPayload


class StatusMsg(_Envelope):
    type: Literal["status"] = "status"
    payload: StatusPayload


class PresenceMsg(_Envelope):
    type: Literal["presence"] = "presence"
    payload: PresencePayload


class ErrorMsg(_Envelope):
    type: Literal["error"] = "error"
    payload: ErrorPayload


# What a client is allowed to send us over the socket.
ClientMessage = Annotated[
    Union[PingMsg, AckMsg, MovementMsg, CueMsg, AttemptMsg, PlaybackMsg], Field(discriminator="type")
]

# Everything that can appear on the wire.
AnyMessage = Annotated[
    Union[
        CueMsg, PlaybackMsg, ControlMsg, MovementMsg, MovementDetectedMsg,
        PingMsg, PongMsg, AckMsg, WelcomeMsg, ErrorMsg, StatusMsg, PresenceMsg,
        ScoreMsg, ResultsMsg, AnnouncementMsg,
    ],
    Field(discriminator="type"),
]
