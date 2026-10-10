"""Pretend to be a phone or watch. Prints every message, pings for latency, acks cues.

    python scripts/fake_device.py --role watch
    python scripts/fake_device.py --role phone --url ws://192.168.1.20:8000/ws --session demo
    python scripts/fake_device.py --role watch --wave-every 5    # also send a wave every 5 s
"""

import argparse
import asyncio
import json
import time

import websockets


def now_ms() -> int:
    return int(time.time() * 1000)


async def run(url: str, role: str, session: str, wave_every: float, duration: float) -> None:
    rtt = offset = None
    async with websockets.connect(f"{url}?role={role}&session={session}") as ws:

        async def pinger():
            nonlocal rtt, offset
            while True:
                await ws.send(json.dumps({"type": "ping", "payload": {
                    "client_time": now_ms(), "last_rtt_ms": rtt, "clock_offset_ms": offset}}))
                await asyncio.sleep(2)

        async def waver():
            while wave_every > 0:
                await asyncio.sleep(wave_every)
                await ws.send(json.dumps({"type": "movement", "payload": {"gesture": "wave", "confidence": 0.9}}))
                print(">> sent wave")

        async def reader():
            nonlocal rtt, offset
            async for raw in ws:
                t = now_ms()
                m = json.loads(raw)
                if m["type"] == "pong":
                    p = m["payload"]
                    rtt = t - p["client_time"]
                    offset = p["server_time"] - (p["client_time"] + rtt / 2)
                    continue
                if m["type"] == "cue":
                    await ws.send(json.dumps({"type": "ack", "payload": {"cue_id": m["payload"]["cue_id"], "received_at": t}}))
                    lag = t + (offset or 0) - m["sent_at"]
                    print(f"<< cue {m['payload']['kind']:<10} pattern={m['payload']['pattern']:<10} ~{lag:.0f} ms after send")
                else:
                    print(f"<< {m['type']}: {json.dumps(m['payload'])}")

        tasks = [asyncio.create_task(x()) for x in (pinger, waver, reader)]
        try:
            if duration > 0:
                await asyncio.sleep(duration)
            else:
                await asyncio.gather(*tasks)
        finally:
            for t in tasks:
                t.cancel()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="ws://localhost:8000/ws")
    ap.add_argument("--role", choices=["phone", "watch", "controller"], default="watch")
    ap.add_argument("--session", default="demo")
    ap.add_argument("--wave-every", type=float, default=0)
    ap.add_argument("--duration", type=float, default=0, help="seconds to run, 0 = forever")
    a = ap.parse_args()
    asyncio.run(run(a.url, a.role, a.session, a.wave_every, a.duration))
