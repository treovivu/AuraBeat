"""At-home Play Along: target beats, the phone's playback clock, and wrist-wave scoring.

Rules (from the project spec, version "v1"):
  - Targets are bar downbeats inside the track's "wave with the music" windows, so they sit at
    least one bar (~3.2 s at 75 BPM) apart and a wave can never match two targets.
  - A wave within ±200 ms of a target scores 100 ("on_beat"), within ±350 ms scores 50 ("close").
  - Each target is judged once. One wave can award at most one target, and the same watch can't
    score again for 700 ms (cooldown), so shaking harder or faster never earns more.
  - Wave timing comes from the watch's own timestamp mapped to server time with the clock offset
    measured by ping/pong. Arrival time is only a fallback.
  - The phone's player is the clock. Paused or buffering: no scoring, no "missed". A seek or restart
    (version bump, or a jump the backend notices) wipes the attempt and starts a fresh one.
  - Quiet zone: haptic cues the phone asks us to relay to the watch are held back within ±350 ms of
    a target, so the watch's own motor can't fake a wave at a scoring moment.
  - Targets the music passes without a wave become "missed" (0 points), only while playing.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional

from .messages import AttemptPayload, PlaybackPayload, Target, new_id, now_ms

RULE_VERSION = "v1"
ON_BEAT_MS = 200
CLOSE_MS = 350
COOLDOWN_MS = 700
QUIET_MS = 350
MISS_GRACE_MS = 250  # wait a little past the window for slow networks before calling it missed
SEEK_JUMP_MS = 1500  # a jump this big without a version bump counts as a seek
MIN_CONFIDENCE = 0.5


def compute_targets(a: AttemptPayload) -> list[Target]:
    bar = a.beats_per_bar * 60.0 / a.bpm
    targets: list[Target] = []
    for w in a.windows:
        # First downbeat at or after the window opens.
        k = -(-(w.start - a.downbeat_anchor) // bar)  # ceil
        t = a.downbeat_anchor + k * bar
        n = 0
        while t <= w.end - CLOSE_MS / 1000:
            if t >= 0:
                targets.append(Target(id=f"{w.id}-{n + 1}", t_ms=int(round(t * 1000))))
                n += 1
            t += bar
    return sorted(targets, key=lambda x: x.t_ms)


@dataclass
class Attempt:
    owner: str  # phone client id
    session: str
    spec: AttemptPayload
    attempt_id: str = field(default_factory=lambda: "att-" + new_id()[:8])
    version: int = 0
    targets: list[Target] = field(default_factory=list)
    results: dict[str, tuple[str, int, Optional[int]]] = field(default_factory=dict)  # id -> (result, pts, offset)
    # Playback anchor: position_ms at server time anchor_server_ms.
    state: str = "paused"
    position_ms: int = 0
    anchor_server_ms: int = field(default_factory=now_ms)
    last_wave_by_watch: dict[str, int] = field(default_factory=dict)
    finished: bool = False
    updated_mono: float = field(default_factory=time.monotonic)

    def __post_init__(self) -> None:
        self.targets = compute_targets(self.spec)

    # ---- clock -------------------------------------------------------------------------------

    def position_at(self, server_ms: int) -> int:
        if self.state != "playing":
            return self.position_ms
        return self.position_ms + (server_ms - self.anchor_server_ms)

    def apply_playback(self, p: PlaybackPayload, server_ms: int) -> bool:
        """Update the clock. Returns True if this was a seek/restart (attempt must reset)."""
        expected = self.position_at(server_ms)
        seek = p.version != self.version or (
            self.state == "playing" and p.state == "playing" and abs(p.position_ms - expected) > SEEK_JUMP_MS
        )
        self.version = p.version
        self.state = p.state
        self.position_ms = p.position_ms
        self.anchor_server_ms = server_ms
        self.updated_mono = time.monotonic()
        return seek

    def reset(self) -> None:
        self.attempt_id = "att-" + new_id()[:8]
        self.results.clear()
        self.last_wave_by_watch.clear()
        self.finished = False

    # ---- scoring -----------------------------------------------------------------------------

    @property
    def scoring(self) -> bool:
        return self.spec.play_along and self.state == "playing" and not self.finished

    def totals(self) -> dict:
        pts = sum(r[1] for r in self.results.values())
        on = sum(1 for r in self.results.values() if r[0] == "on_beat")
        close = sum(1 for r in self.results.values() if r[0] == "close")
        missed = sum(1 for r in self.results.values() if r[0] == "missed")
        return {"total": pts, "on_beat": on, "close": close, "missed": missed,
                "hits": on + close, "judged": len(self.results), "targets": len(self.targets)}

    def judge_wave(self, watch_id: str, wave_server_ms: int, confidence: float) -> Optional[tuple[Target, str, int, int]]:
        """Score one wave. Returns (target, result, points, offset_ms) or None if it doesn't count."""
        if not self.scoring or confidence < MIN_CONFIDENCE:
            return None
        last = self.last_wave_by_watch.get(watch_id)
        if last is not None and wave_server_ms - last < COOLDOWN_MS:
            return None
        self.last_wave_by_watch[watch_id] = wave_server_ms
        pos = self.position_at(wave_server_ms)
        best = None
        for t in self.targets:
            if t.id in self.results:
                continue
            off = pos - t.t_ms
            if abs(off) <= CLOSE_MS and (best is None or abs(off) < abs(best[1])):
                best = (t, off)
        if not best:
            return None
        t, off = best
        result, pts = ("on_beat", 100) if abs(off) <= ON_BEAT_MS else ("close", 50)
        self.results[t.id] = (result, pts, off)
        return t, result, pts, off

    def sweep_missed(self, server_ms: int) -> list[Target]:
        if not self.scoring:
            return []
        pos = self.position_at(server_ms)
        missed = [t for t in self.targets
                  if t.id not in self.results and pos > t.t_ms + CLOSE_MS + MISS_GRACE_MS]
        for t in missed:
            self.results[t.id] = ("missed", 0, None)
        return missed

    def in_quiet_zone(self, server_ms: int) -> bool:
        if not self.spec.play_along or self.state != "playing":
            return False
        pos = self.position_at(server_ms)
        return any(abs(pos - t.t_ms) <= QUIET_MS for t in self.targets)

    def is_done(self, server_ms: int) -> bool:
        if self.finished or not self.targets:
            return False
        return len(self.results) == len(self.targets) or self.state == "ended"


class Attempts:
    """One private attempt per phone. A watch's waves go to the attempt of the phone it's paired with,
    or (demo setup, no pairing) the most recently active attempt in its session."""

    def __init__(self) -> None:
        self.by_phone: dict[str, Attempt] = {}
        self.pairs: dict[str, str] = {}  # watch id -> phone id

    def open(self, phone_id: str, session: str, spec: AttemptPayload) -> Attempt:
        old = self.by_phone.get(phone_id)
        att = Attempt(owner=phone_id, session=session, spec=spec)
        if old and old.spec.media_id == spec.media_id:
            # Same performance (e.g. Play Along toggled): keep the clock, start scoring fresh.
            att.state, att.position_ms, att.anchor_server_ms, att.version = (
                old.state, old.position_ms, old.anchor_server_ms, old.version)
        self.by_phone[phone_id] = att
        return att

    def close(self, phone_id: str) -> Optional[Attempt]:
        return self.by_phone.pop(phone_id, None)

    def get(self, phone_id: str) -> Optional[Attempt]:
        return self.by_phone.get(phone_id)

    def for_watch(self, watch_id: str, session: str) -> Optional[Attempt]:
        phone = self.pairs.get(watch_id)
        if phone and phone in self.by_phone:
            return self.by_phone[phone]
        candidates = [a for a in self.by_phone.values() if a.session == session]
        if not candidates:
            return None
        return max(candidates, key=lambda a: (a.state == "playing", a.updated_mono))

    def in_session(self, session: str) -> list[Attempt]:
        return [a for a in self.by_phone.values() if a.session == session]


attempts = Attempts()
