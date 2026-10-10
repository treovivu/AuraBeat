"""Tiger Data (TimescaleDB on Tiger Cloud) storage for everything that happens in a show.

Every cue sent, every latency sample, every wrist wave and every connect/disconnect lands in a
hypertable, so after a run we can answer questions like "how fast did cues reach each device",
"which moments of the song made people wave" and "how busy was the haptic stream minute by minute".

Turned on by one environment variable (the service URL from the Tiger Cloud console):

    export TIGER_DATABASE_URL="postgres://tsdbadmin:<password>@<host>:<port>/tsdb?sslmode=require"

Without it the backend runs exactly as before and /stats says {"enabled": false}.
Writes go through an in-memory queue and are flushed in batches, so a slow database can never
delay a beat reaching a watch.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

log = logging.getLogger("tiger")

SCHEMA = [
    """
    CREATE TABLE IF NOT EXISTS cue_events (
        time        TIMESTAMPTZ NOT NULL,
        session     TEXT        NOT NULL,
        cue_id      TEXT,
        kind        TEXT        NOT NULL,
        intensity   REAL,
        pattern     TEXT,
        song_ms     INTEGER,
        source      TEXT,
        deliveries  INTEGER
    )""",
    "SELECT create_hypertable('cue_events', by_range('time'), if_not_exists => TRUE)",
    "CREATE INDEX IF NOT EXISTS cue_events_session_time ON cue_events (session, time DESC)",
    """
    CREATE TABLE IF NOT EXISTS device_latency (
        time            TIMESTAMPTZ NOT NULL,
        session         TEXT        NOT NULL,
        client_id       TEXT        NOT NULL,
        role            TEXT,
        rtt_ms          REAL,
        cue_latency_ms  REAL
    )""",
    "SELECT create_hypertable('device_latency', by_range('time'), if_not_exists => TRUE)",
    """
    CREATE TABLE IF NOT EXISTS movements (
        time        TIMESTAMPTZ NOT NULL,
        session     TEXT        NOT NULL,
        client_id   TEXT,
        gesture     TEXT,
        confidence  REAL,
        song_ms     INTEGER
    )""",
    "SELECT create_hypertable('movements', by_range('time'), if_not_exists => TRUE)",
    """
    CREATE TABLE IF NOT EXISTS connections (
        time        TIMESTAMPTZ NOT NULL,
        session     TEXT        NOT NULL,
        client_id   TEXT,
        role        TEXT,
        event       TEXT
    )""",
    "SELECT create_hypertable('connections', by_range('time'), if_not_exists => TRUE)",
    """
    CREATE TABLE IF NOT EXISTS attempt_results (
        time         TIMESTAMPTZ NOT NULL,
        session      TEXT        NOT NULL,
        attempt_id   TEXT        NOT NULL,
        phone_id     TEXT,
        media_id     TEXT,
        total        INTEGER,
        on_beat      INTEGER,
        close        INTEGER,
        missed       INTEGER,
        targets      INTEGER,
        rule_version TEXT
    )""",
    "SELECT create_hypertable('attempt_results', by_range('time'), if_not_exists => TRUE)",
    """
    CREATE TABLE IF NOT EXISTS announcements (
        time        TIMESTAMPTZ NOT NULL,
        session     TEXT        NOT NULL,
        announce_id TEXT,
        text        TEXT,
        urgent      BOOLEAN,
        deliveries  INTEGER
    )""",
    "SELECT create_hypertable('announcements', by_range('time'), if_not_exists => TRUE)",
    # Minute-by-minute haptic activity, kept up to date by TimescaleDB itself.
    """
    CREATE MATERIALIZED VIEW IF NOT EXISTS cue_activity_1m
    WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
    SELECT time_bucket('1 minute', time) AS bucket, session, kind,
           count(*) AS cues, avg(intensity) AS avg_intensity, sum(deliveries) AS deliveries
    FROM cue_events
    GROUP BY bucket, session, kind
    WITH NO DATA""",
    """
    SELECT add_continuous_aggregate_policy('cue_activity_1m',
        start_offset => INTERVAL '1 day', end_offset => INTERVAL '1 minute',
        schedule_interval => INTERVAL '1 minute', if_not_exists => TRUE)""",
]

INSERT = {
    "cue": "INSERT INTO cue_events (time, session, cue_id, kind, intensity, pattern, song_ms, source, deliveries) "
           "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    "latency": "INSERT INTO device_latency (time, session, client_id, role, rtt_ms, cue_latency_ms) "
               "VALUES ($1,$2,$3,$4,$5,$6)",
    "movement": "INSERT INTO movements (time, session, client_id, gesture, confidence, song_ms) "
                "VALUES ($1,$2,$3,$4,$5,$6)",
    "connection": "INSERT INTO connections (time, session, client_id, role, event) VALUES ($1,$2,$3,$4,$5)",
    "attempt": "INSERT INTO attempt_results (time, session, attempt_id, phone_id, media_id, total, on_beat, close, "
               "missed, targets, rule_version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
    "announcement": "INSERT INTO announcements (time, session, announce_id, text, urgent, deliveries) "
                    "VALUES ($1,$2,$3,$4,$5,$6)",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Store:
    def __init__(self, url: Optional[str] = None) -> None:
        self.url = url if url is not None else (os.getenv("TIGER_DATABASE_URL") or os.getenv("DATABASE_URL"))
        self.pool = None
        self.error: Optional[str] = None
        self._queue: asyncio.Queue = asyncio.Queue(maxsize=50_000)
        self._writer: Optional[asyncio.Task] = None
        self.written = 0
        self.has_cagg = False

    @property
    def enabled(self) -> bool:
        return self.pool is not None

    async def start(self) -> None:
        if not self.url:
            log.info("Tiger Data off (set TIGER_DATABASE_URL to turn it on)")
            return
        try:
            import asyncpg

            self.pool = await asyncpg.create_pool(self.url, min_size=1, max_size=4, command_timeout=10)
            async with self.pool.acquire() as con:
                for stmt in SCHEMA[:-2]:
                    await con.execute(stmt)
                # The continuous aggregate is a bonus: if it can't be created, stats fall back to raw data.
                try:
                    for stmt in SCHEMA[-2:]:
                        await con.execute(stmt)
                    self.has_cagg = True
                except Exception as e:
                    log.warning("continuous aggregate unavailable, using raw queries: %s", e)
            self._writer = asyncio.create_task(self._flush_loop())
            log.info("Tiger Data on: hypertables ready")
        except Exception as e:  # never stop the show because the database is unhappy
            self.error = f"{type(e).__name__}: {e}"
            log.warning("Tiger Data disabled: %s", self.error)
            if self.pool:
                await self.pool.close()
            self.pool = None

    async def stop(self) -> None:
        if self._writer:
            self._writer.cancel()
        if self.pool:
            await self._flush()
            await self.pool.close()
            self.pool = None

    # ---- recording (non-blocking) -------------------------------------------------

    def _put(self, kind: str, row: tuple) -> None:
        if not self.pool:
            return
        try:
            self._queue.put_nowait((kind, row))
        except asyncio.QueueFull:
            pass

    def record_cue(self, session: str, cue_id: str, kind: str, intensity: float, pattern: str,
                   song_ms: Optional[int], source: str, deliveries: int) -> None:
        self._put("cue", (_now(), session, cue_id, kind, intensity, pattern, song_ms, source, deliveries))

    def record_latency(self, session: str, client_id: str, role: str,
                       rtt_ms: Optional[float] = None, cue_latency_ms: Optional[float] = None) -> None:
        self._put("latency", (_now(), session, client_id, role, rtt_ms, cue_latency_ms))

    def record_movement(self, session: str, client_id: str, gesture: str, confidence: float,
                        song_ms: Optional[int]) -> None:
        self._put("movement", (_now(), session, client_id, gesture, confidence, song_ms))

    def record_connection(self, session: str, client_id: str, role: str, event: str) -> None:
        self._put("connection", (_now(), session, client_id, role, event))

    def record_attempt(self, session: str, attempt_id: str, phone_id: str, media_id: str, total: int,
                       on_beat: int, close: int, missed: int, targets: int, rule_version: str) -> None:
        self._put("attempt", (_now(), session, attempt_id, phone_id, media_id, total, on_beat, close, missed,
                              targets, rule_version))

    def record_announcement(self, session: str, announce_id: str, text: str, urgent: bool, deliveries: int) -> None:
        self._put("announcement", (_now(), session, announce_id, text, urgent, deliveries))

    async def _flush(self) -> None:
        batches: dict[str, list[tuple]] = {}
        while not self._queue.empty():
            kind, row = self._queue.get_nowait()
            batches.setdefault(kind, []).append(row)
        if not batches or not self.pool:
            return
        try:
            async with self.pool.acquire() as con:
                for kind, rows in batches.items():
                    await con.executemany(INSERT[kind], rows)
                    self.written += len(rows)
        except Exception as e:
            log.warning("Tiger Data write failed (%d rows dropped): %s", sum(map(len, batches.values())), e)

    async def _flush_loop(self) -> None:
        while True:
            await asyncio.sleep(0.5)
            await self._flush()

    # ---- analytics -----------------------------------------------------------------

    async def stats(self, session: str, minutes: int = 60) -> dict[str, Any]:
        if not self.pool:
            return {"enabled": False, "error": self.error}
        await self._flush()
        since = timedelta(minutes=int(minutes))
        async with self.pool.acquire() as con:
            activity = await con.fetch(
                """SELECT time_bucket('10 seconds', time) AS bucket,
                          count(*) AS cues,
                          count(*) FILTER (WHERE kind IN ('bass','drop')) AS strong,
                          round(avg(intensity)::numeric, 2) AS avg_intensity
                   FROM cue_events WHERE session = $1 AND time > now() - $2::interval
                   GROUP BY bucket ORDER BY bucket""", session, since)
            if self.has_cagg:
                by_kind = await con.fetch(
                    """SELECT kind, sum(cues)::int AS cues, round(avg(avg_intensity)::numeric, 2) AS avg_intensity
                       FROM cue_activity_1m WHERE session = $1 AND bucket > now() - $2::interval
                       GROUP BY kind ORDER BY cues DESC""", session, since)
            else:
                by_kind = await con.fetch(
                    """SELECT kind, count(*)::int AS cues, round(avg(intensity)::numeric, 2) AS avg_intensity
                       FROM cue_events WHERE session = $1 AND time > now() - $2::interval
                       GROUP BY kind ORDER BY cues DESC""", session, since)
            latency = await con.fetch(
                """SELECT client_id, role,
                          round(avg(rtt_ms)::numeric, 1) AS avg_rtt_ms,
                          round((percentile_cont(0.95) WITHIN GROUP (ORDER BY rtt_ms))::numeric, 1) AS p95_rtt_ms,
                          round(avg(cue_latency_ms)::numeric, 1) AS avg_cue_latency_ms,
                          count(*) AS samples
                   FROM device_latency WHERE session = $1 AND time > now() - $2::interval
                   GROUP BY client_id, role ORDER BY role, client_id""", session, since)
            waves = await con.fetch(
                """SELECT time_bucket('1 minute', time) AS bucket, count(*) AS waves
                   FROM movements WHERE session = $1 AND time > now() - $2::interval
                   GROUP BY bucket ORDER BY bucket""", session, since)
            song = await con.fetch(
                """WITH c AS (SELECT (song_ms / 5000) * 5 AS sec, avg(intensity) AS intensity, count(*) AS cues
                              FROM cue_events WHERE session = $1 AND song_ms IS NOT NULL
                                AND time > now() - $2::interval GROUP BY 1),
                        m AS (SELECT (song_ms / 5000) * 5 AS sec, count(*) AS waves
                              FROM movements WHERE session = $1 AND song_ms IS NOT NULL
                                AND time > now() - $2::interval GROUP BY 1)
                   SELECT coalesce(c.sec, m.sec) AS sec, round(coalesce(c.intensity, 0)::numeric, 2) AS intensity,
                          coalesce(c.cues, 0) AS cues, coalesce(m.waves, 0) AS waves
                   FROM c FULL JOIN m ON c.sec = m.sec ORDER BY sec""", session, since)
            play_along = await con.fetch(
                """SELECT time, attempt_id, media_id, total, on_beat, close, missed, targets, rule_version
                   FROM attempt_results WHERE session = $1 AND time > now() - $2::interval
                   ORDER BY time DESC LIMIT 20""", session, since)
            totals = await con.fetchrow(
                """SELECT (SELECT count(*) FROM cue_events WHERE session = $1 AND time > now() - $2::interval) AS cues,
                          (SELECT count(*) FROM movements WHERE session = $1 AND time > now() - $2::interval) AS waves,
                          (SELECT count(DISTINCT client_id) FROM connections
                             WHERE session = $1 AND time > now() - $2::interval) AS devices""", session, since)

        def rows(rs):
            out = []
            for r in rs:
                d = dict(r)
                for k, v in d.items():
                    if isinstance(v, datetime):
                        d[k] = v.isoformat()
                    elif v is not None and not isinstance(v, (int, float, str, bool)):
                        d[k] = float(v)
                out.append(d)
            return out

        return {
            "enabled": True,
            "continuous_aggregate": self.has_cagg,
            "session": session,
            "minutes": minutes,
            "totals": rows([totals])[0] if totals else {},
            "activity_10s": rows(activity),
            "by_kind": rows(by_kind),
            "latency": rows(latency),
            "waves_per_minute": rows(waves),
            "song_heatmap_5s": rows(song),
            "play_along": rows(play_along),
        }


store = Store()
