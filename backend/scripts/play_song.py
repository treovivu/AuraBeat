"""Play a real song on this laptop's speakers and send its beats to every phone and watch, in sync.

    python scripts/play_song.py                      # Grateful, from the start
    python scripts/play_song.py --from 60            # start at 1:00 (right before the first drop)
    python scripts/play_song.py --silent             # cues only, no sound (someone else plays the music)
    python scripts/play_song.py --nudge 80           # cues arrive 80 ms later (if they feel early)
    python scripts/play_song.py --url http://172.20.10.2:8001

Ctrl+C stops the music and the cues.
"""

import argparse
import json
import platform
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def post(url, body=None):
    req = urllib.request.Request(url, data=json.dumps(body or {}).encode(),
                                 headers={"content-type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.loads(r.read())


def player_cmd(path: Path, start: float):
    if platform.system() == "Darwin" and start == 0 and shutil.which("afplay"):
        return ["afplay", str(path)]
    if shutil.which("ffplay"):
        return ["ffplay", "-nodisp", "-autoexit", "-loglevel", "quiet", "-ss", str(start), str(path)]
    if platform.system() == "Darwin" and shutil.which("afplay"):
        sys.exit("To start mid-song on a Mac, install ffmpeg (brew install ffmpeg), or use --from 0.")
    sys.exit("No audio player found. Install ffmpeg (it includes ffplay), or use --silent.")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--song", default="grateful", help="timelines/<song>.json and media/<song>.mp3")
    ap.add_argument("--url", default="http://localhost:8001")
    ap.add_argument("--session", default="demo")
    ap.add_argument("--from", dest="start", type=float, default=0.0, help="start position in seconds")
    ap.add_argument("--nudge", type=int, default=0, help="delay cues by this many ms (speaker latency)")
    ap.add_argument("--silent", action="store_true", help="don't play audio here")
    a = ap.parse_args()

    base = a.url.rstrip("/")
    try:
        urllib.request.urlopen(f"{base}/health", timeout=3).read()
    except (urllib.error.URLError, OSError):
        sys.exit(f"Can't reach the server at {base}. Is uvicorn running?")

    proc = None
    if not a.silent:
        audio = next((p for p in (ROOT / "media").glob(f"{a.song}.*")), None)
        if not audio:
            sys.exit(f"No audio at media/{a.song}.mp3 (or use --silent)")
        proc = subprocess.Popen(player_cmd(audio, a.start))
        time.sleep(0.05)  # let the player open the device

    try:
        state = post(f"{base}/sessions/{a.session}/timeline/start",
                     {"name": a.song, "offset_s": a.start, "lead_ms": max(0, a.nudge)})
    except urllib.error.HTTPError as e:
        if proc:
            proc.terminate()
        sys.exit(f"Server said {e.code}: {e.read().decode()}")
    print(f"Playing {state.get('title')} from {a.start:.0f}s. Ctrl+C to stop.")

    try:
        while True:
            time.sleep(1)
            st = json.loads(urllib.request.urlopen(f"{base}/sessions/{a.session}/timeline", timeout=3).read())
            if not st.get("playing"):
                break
            pos = st["position_ms"] / 1000
            print(f"\r  {int(pos // 60)}:{int(pos % 60):02d} / {int(st['duration'] // 60)}:{int(st['duration'] % 60):02d}"
                  f"   cues sent: {st['cues_sent']}   ", end="", flush=True)
            if proc and proc.poll() is not None:
                break
    except KeyboardInterrupt:
        pass
    finally:
        try:
            post(f"{base}/sessions/{a.session}/timeline/stop")
            post(f"{base}/sessions/{a.session}/control", {"action": "stop"})
        except (urllib.error.URLError, OSError):
            pass
        if proc and proc.poll() is None:
            proc.terminate()
        print("\nStopped.")


if __name__ == "__main__":
    main()
