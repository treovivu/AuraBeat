"""Connection hub: tracks connected phones/watches per session and fans messages out."""

from __future__ import annotations

import asyncio
import logging
import os
from collections import deque
from dataclasses import dataclass, field
from typing import Iterable, Optional

from fastapi import WebSocket
from pydantic import BaseModel

from .messages import Role, now_ms

log = logging.getLogger("hub")

# How far ahead cues are scheduled on phones. Covers typical Wi-Fi jitter; raise it on a busy network.
LIGHT_BUFFER_MS = int(os.getenv("LIGHT_BUFFER_MS", "150"))


@dataclass
class Client:
    id: str
    role: Role
    session: str
    ws: WebSocket
    connected_at: int = field(default_factory=now_ms)
    # Round-trip latency samples from ping/pong (ms), most recent last.
    rtt_ms: deque = field(default_factory=lambda: deque(maxlen=20))
    # Estimated (server_clock - client_clock) in ms.
    clock_offset_ms: Optional[float] = None
    # One-way cue delivery samples from acks (ms), corrected for clock offset.
    cue_latency_ms: deque = field(default_factory=lambda: deque(maxlen=50))

    def summary(self) -> dict:
        def avg(xs):
            return round(sum(xs) / len(xs), 1) if xs else None

        return {
            "id": self.id,
            "role": self.role,
            "session": self.session,
            "connected_at": self.connected_at,
            "avg_rtt_ms": avg(self.rtt_ms),
            "clock_offset_ms": None if self.clock_offset_ms is None else round(self.clock_offset_ms, 1),
            "avg_cue_latency_ms": avg(self.cue_latency_ms),
            "cue_samples": len(self.cue_latency_ms),
        }


class Hub:
    def __init__(self) -> None:
        self._clients: dict[str, Client] = {}
        self._lock = asyncio.Lock()
        # cue_id -> server sent_at, so acks can be turned into latency numbers.
        self._cue_sent: dict[str, int] = {}
        self._seq: dict[str, int] = {}

    def stamp(self, msg) -> None:
        """Give a cue its per-session sequence number and the moment every phone should show it.
        Phones schedule the light at display_at (using their measured clock offset), so two phones
        with different network delays still flash together. Phones drop cues older than one they've shown."""
        self._seq[msg.session] = self._seq.get(msg.session, 0) + 1
        msg.seq = self._seq[msg.session]
        msg.display_at = msg.sent_at + LIGHT_BUFFER_MS

    async def add(self, client: Client) -> None:
        async with self._lock:
            self._clients[client.id] = client
        log.info("connect %s role=%s session=%s", client.id, client.role, client.session)

    async def remove(self, client_id: str, client: Optional[Client] = None) -> bool:
        """Forget a connection. With `client`, only if that exact connection is still the one
        registered under this id: a reconnect (or a second tab) with the same id must not be
        thrown away when the old socket closes."""
        async with self._lock:
            current = self._clients.get(client_id)
            if current is None or (client is not None and current is not client):
                return False
            del self._clients[client_id]
        log.info("disconnect %s role=%s", current.id, current.role)
        return True

    def get(self, client_id: str) -> Optional[Client]:
        return self._clients.get(client_id)

    async def send_to(self, client_id: str, msg: BaseModel) -> bool:
        c = self._clients.get(client_id)
        if not c:
            return False
        try:
            await c.ws.send_text(msg.model_dump_json())
            return True
        except Exception:
            await self.remove(client_id, c)
            return False

    def server_time_of(self, client: "Client", client_ms: Optional[int]) -> int:
        """Map a device timestamp to server time using its measured clock offset.
        Falls back to arrival time minus half the round trip."""
        if client_ms is not None and client.clock_offset_ms is not None:
            return int(client_ms + client.clock_offset_ms)
        rtt = (sum(client.rtt_ms) / len(client.rtt_ms)) if client.rtt_ms else 0
        return int(now_ms() - rtt / 2)

    def clients(self, session: Optional[str] = None) -> list[Client]:
        return [c for c in self._clients.values() if session is None or c.session == session]

    def remember_cue(self, cue_id: str, sent_at: int) -> None:
        self._cue_sent[cue_id] = sent_at
        if len(self._cue_sent) > 5000:  # keep memory bounded during a long night
            for k in list(self._cue_sent)[:1000]:
                del self._cue_sent[k]

    def cue_sent_at(self, cue_id: str) -> Optional[int]:
        return self._cue_sent.get(cue_id)

    async def broadcast(
        self,
        msg: BaseModel,
        session: str,
        roles: Optional[Iterable[Role]] = None,
        exclude: Optional[str] = None,
    ) -> int:
        """Send msg to every client in the session (optionally filtered by role). Returns delivery count."""
        role_set = set(roles) if roles else None
        targets = [
            c for c in self.clients(session)
            if (role_set is None or c.role in role_set) and c.id != exclude
        ]
        if not targets:
            return 0
        text = msg.model_dump_json()
        results = await asyncio.gather(
            *(c.ws.send_text(text) for c in targets), return_exceptions=True
        )
        delivered = 0
        for c, r in zip(targets, results):
            if isinstance(r, Exception):
                log.warning("send to %s failed: %s; dropping", c.id, r)
                await self.remove(c.id, c)
            else:
                delivered += 1
        return delivered


hub = Hub()
