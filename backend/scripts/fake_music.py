"""Fake music: sends a beat-accurate stream of cues to every connected phone and watch.

No extra packages needed (standard library only). Run it in a second terminal
while the server is running:

    python scripts/fake_music.py                   # 120 BPM groove, loops forever
    python scripts/fake_music.py --bpm 90          # slower
    python scripts/fake_music.py --bars 8          # stop after 8 bars
    python scripts/fake_music.py --pattern bass    # only bass hits (easy to feel on the watch)
    python scripts/fake_music.py --pattern wave    # GET READY -> WAVE prompt cycle
    python scripts/fake_music.py --url http://172.20.10.2:8001

Patterns
  groove : bass on beats 1 and 3, percussion on 2 and 4, a DROP every 4th bar
  bass   : one bass hit per beat
  wave   : 2 bars of beats, GET READY, 2 bars, WAVE WITH THE MUSIC, repeat
  all    : cycles through every cue kind once per bar (good for checking each one renders)

Ctrl+C sends a "stop" so devices stop vibrating.
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.request

PINK, BLUE, GOLD, WHITE = "#FF3EA5", "#3EA5FF", "#FFC83E", "#FFFFFF"


def cue(kind, intensity, pattern, duration_ms, color=None, text=None):
    return {"kind": kind, "intensity": intensity, "pattern": pattern,
            "duration_ms": duration_ms, "color": color, "text": text}


def beat_cues(pattern, bar, beat):
    """Cues to send on this beat (beat is 0..3)."""
    if pattern == "bass":
        return [cue("bass", 1.0, "pulse", 180, PINK)]

    if pattern == "wave":
        phase = bar % 4
        if phase == 1 and beat == 0:
            return [cue("get_ready", 0.6, "double_tap", 250, GOLD, "GET READY")]
        if phase == 2 and beat == 0:
            return [cue("wave", 0.9, "long", 1500, WHITE, "WAVE WITH THE MUSIC")]
        return [cue("beat", 0.5, "tap", 80, BLUE)]

    if pattern == "all":
        kinds = [
            cue("beat", 0.5, "tap", 80, BLUE),
            cue("bass", 1.0, "pulse", 180, PINK),
            cue("percussion", 0.6, "double_tap", 60, WHITE),
            cue("drop", 1.0, "ramp", 600, GOLD),
            cue("lyric", 0.0, "none", 0, None, "Lyric line test"),
            cue("get_ready", 0.6, "double_tap", 250, GOLD, "GET READY"),
            cue("wave", 0.9, "long", 1500, WHITE, "WAVE WITH THE MUSIC"),
        ]
        return [kinds[(bar * 4 + beat) % len(kinds)]]

    # groove
    if bar % 4 == 3 and beat == 0:
        return [cue("drop", 1.0, "ramp", 600, GOLD)]
    if beat in (0, 2):
        return [cue("bass", 1.0, "pulse", 180, PINK)]
    return [cue("percussion", 0.6, "tap", 60, WHITE)]


def post(url, body):
    req = urllib.request.Request(
        url, data=json.dumps(body).encode(), headers={"content-type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=2) as r:
        return json.loads(r.read())


def main():
    ap = argparse.ArgumentParser(description="Send fake music cues to the backend.")
    ap.add_argument("--url", default="http://localhost:8001", help="backend base URL")
    ap.add_argument("--session", default="demo")
    ap.add_argument("--bpm", type=float, default=120)
    ap.add_argument("--bars", type=int, default=0, help="number of 4-beat bars, 0 = forever")
    ap.add_argument("--pattern", choices=["groove", "bass", "wave", "all"], default="groove")
    a = ap.parse_args()

    base = a.url.rstrip("/")
    cues_url = f"{base}/sessions/{a.session}/cues"
    control_url = f"{base}/sessions/{a.session}/control"

    try:
        with urllib.request.urlopen(f"{base}/health", timeout=2):
            pass
    except (urllib.error.URLError, OSError):
        sys.exit(f"Can't reach the server at {base}. Is uvicorn running, and is the port right?")

    beat_s = 60.0 / a.bpm
    start = time.monotonic()
    n = 0
    print(f"Sending '{a.pattern}' at {a.bpm:g} BPM to session '{a.session}'. Ctrl+C to stop.")
    try:
        while a.bars == 0 or n < a.bars * 4:
            bar, beat = divmod(n, 4)
            cues = beat_cues(a.pattern, bar, beat)
            pos_ms = int(n * beat_s * 1000)
            for c in cues:
                c["at_ms"] = pos_ms
            try:
                r = post(cues_url, cues)
                kinds = ",".join(c["kind"] for c in cues)
                marker = "*" if beat == 0 else " "
                print(f"bar {bar + 1:>3} beat {beat + 1}{marker} {kinds:<12} -> {r['deliveries']} device(s)")
            except (urllib.error.URLError, OSError) as e:
                print(f"bar {bar + 1:>3} beat {beat + 1}  send failed: {e}")

            n += 1
            # Schedule against the start time so timing doesn't drift over a long run.
            time.sleep(max(0.0, start + n * beat_s - time.monotonic()))
    except KeyboardInterrupt:
        pass
    finally:
        try:
            post(control_url, {"action": "stop"})
            print("\nSent stop.")
        except (urllib.error.URLError, OSError):
            pass


if __name__ == "__main__":
    main()
