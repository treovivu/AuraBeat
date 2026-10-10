"""Listen to real music through the laptop mic and send beats to every phone and watch, live.

This is Live mode for a real venue: no prepared timeline, whatever the speakers play.

    pip install sounddevice numpy
    python scripts/live_audio.py                         # default mic
    python scripts/live_audio.py --list                  # show input devices
    python scripts/live_audio.py --device 2 --sensitivity 1.3
    python scripts/live_audio.py --file media/grateful.mp3 --dry-run   # test the detector on a file

What it sends:
  bass / percussion  each punchy hit (kick vs snare), strength from how hard it hit
  drop               a big jump to the loudest point in the last 30 s (after 20 s of music)
  chorus             3 s after a drop, so the lightstick settles into pulse
  status             "listening" while it hears music, "lost" after 3 s of silence

Mac: the first run asks for microphone permission for your terminal / VS Code. Say yes.
"""

from __future__ import annotations

import argparse
import collections
import json
import queue
import sys
import time
import urllib.request

import numpy as np

SR = 22050
BLOCK = 512  # ~23 ms per analysis step


class Detector:
    """Streaming onset + section detector. Feed it blocks of mono float audio."""

    def __init__(self, sr: int = SR, block: int = BLOCK, sensitivity: float = 1.0):
        self.sr, self.block = sr, block
        self.sens = sensitivity
        self.window = np.hanning(block * 2)
        self.prev_mag = None
        self.buf = np.zeros(block * 2, dtype=np.float32)
        freqs = np.fft.rfftfreq(block * 2, 1 / sr)
        self.low = freqs < 150
        steps_per_s = sr / block
        self.flux_hist = collections.deque(maxlen=int(2.0 * steps_per_s))
        self.peak_hist = collections.deque(maxlen=int(6.0 * steps_per_s))
        self.rms_fast = collections.deque(maxlen=int(2.0 * steps_per_s))
        self.rms_slow = collections.deque(maxlen=int(8.0 * steps_per_s))
        self.loud_hist = collections.deque(maxlen=int(30.0 * steps_per_s / 5))
        self.music_since = None
        self.pending_chorus = None
        self.t = 0.0
        self.last_hit = -1.0
        self.last_drop = -60.0
        self.last_sound = -60.0
        self.low_share_med = collections.deque(maxlen=int(10 * steps_per_s))
        self.noise_floor = 0.0
        self.min_rms = 0.004  # raised by set_noise_floor() after measuring the room

    def feed(self, block: np.ndarray) -> list[dict]:
        out: list[dict] = []
        self.buf = np.concatenate([self.buf[len(block):], block.astype(np.float32)])
        self.t += len(block) / self.sr
        mag = np.abs(np.fft.rfft(self.buf * self.window))
        rms = float(np.sqrt(np.mean(block ** 2)) + 1e-12)
        self.rms_fast.append(rms)
        self.rms_slow.append(rms)
        if rms > max(0.005, self.min_rms):
            self.last_sound = self.t

        if self.prev_mag is None:
            self.prev_mag = mag
            return out
        flux = float(np.sum(np.maximum(0.0, mag - self.prev_mag)))
        self.prev_mag = mag
        low_share = float(mag[self.low].sum() / max(mag.sum(), 1e-9))
        self.low_share_med.append(low_share)
        self.flux_hist.append(flux)

        # --- hits -----------------------------------------------------------------------
        if len(self.flux_hist) > 20:
            arr = np.array(self.flux_hist)
            thresh = arr.mean() + (1.6 / self.sens) * arr.std()
            if flux > thresh and self.t - self.last_hit > 0.15 and rms > self.min_rms:
                self.peak_hist.append(flux)
                strength = min(1.0, flux / max(max(self.peak_hist), 1e-9))
                if strength >= 0.4:
                    self.last_hit = self.t
                    typical = float(np.median(self.low_share_med))
                    kind = "bass" if low_share >= typical * 1.15 else "percussion"
                    out.append({"kind": kind, "intensity": round(max(0.5, strength), 2),
                                "pattern": "pulse" if kind == "bass" else "tap",
                                "duration_ms": 160 if kind == "bass" else 60,
                                "color": "#FF3EA5" if kind == "bass" else "#FFFFFF"})

        # --- drops (checked a few times a second) ------------------------------------------
        # A drop = 2 s loudness jumps above the last 8 s AND clearly above the usual loud level of
        # the last 30 s. Skips the first 20 s of music (intros/verses entering aren't drops).
        steps = int(self.t * self.sr / self.block)
        if steps % 5 == 0 and len(self.rms_slow) == self.rms_slow.maxlen:
            fast = float(np.mean(self.rms_fast))
            slow = float(np.mean(self.rms_slow))
            # Typical loud level over the last 30 s, ignoring the last 4 s (the jump itself).
            older = list(self.loud_hist)[: max(0, len(self.loud_hist) - int(4 * self.sr / self.block / 5))]
            recent_max = float(np.percentile(older, 90)) if older else 0.0
            self.loud_hist.append(fast)
            if self.music_since is None and fast > 0.01:
                self.music_since = self.t
            warmed = self.music_since is not None and self.t - self.music_since > 20
            if (warmed and fast > slow * 1.2 and fast >= recent_max * 1.12 and fast > 0.03
                    and self.t - self.last_drop > 10):
                self.last_drop = self.t
                self.pending_chorus = self.t + 3.0
                out.append({"kind": "drop", "intensity": 1.0, "pattern": "long", "duration_ms": 600,
                            "color": "#FFC83E", "text": "DROP"})
        if self.pending_chorus is not None and self.t >= self.pending_chorus:
            self.pending_chorus = None
            out.append({"kind": "chorus", "intensity": 0.8, "pattern": "double_tap", "duration_ms": 200,
                        "color": "#FF3EA5", "text": "CHORUS"})
        for c in out:
            c["at_ms"] = 0
        return out

    def hearing_music(self) -> bool:
        return self.t - self.last_sound < 3.0

    def set_noise_floor(self, rms: float) -> None:
        self.noise_floor = max(rms, 1e-4)
        self.min_rms = max(0.004, self.noise_floor * 2.5)


def post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"content-type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=2) as r:
        return json.loads(r.read())


def run_file(path: str, sensitivity: float):
    import librosa

    y, _ = librosa.load(path, sr=SR, mono=True)
    det = Detector(sensitivity=sensitivity)
    events = []
    for i in range(0, len(y) - BLOCK, BLOCK):
        for c in det.feed(y[i:i + BLOCK]):
            events.append((round(det.t, 2), c["kind"]))
    kinds = collections.Counter(k for _, k in events)
    print(f"{len(events)} cues over {len(y) / SR:.0f}s ({len(events) / (len(y) / SR):.1f}/s): {dict(kinds)}")
    print("builds/drops at:", [(t, k) for t, k in events if k in ("build", "drop")])
    return events


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default="http://localhost:8001")
    ap.add_argument("--session", default="demo")
    ap.add_argument("--device", type=int, help="input device index (see --list)")
    ap.add_argument("--sensitivity", type=float, default=1.0, help=">1 = more hits, <1 = fewer")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--file", help="analyze an audio file instead of the mic")
    ap.add_argument("--dry-run", action="store_true", help="print cues, don't send")
    a = ap.parse_args()

    if a.file:
        run_file(a.file, a.sensitivity)
        return

    try:
        import sounddevice as sd
    except ImportError:
        sys.exit("Run: pip install sounddevice")
    if a.list:
        print(sd.query_devices())
        return

    base = a.url.rstrip("/")
    cues_url = f"{base}/sessions/{a.session}/cues"
    status_url = f"{base}/sessions/{a.session}/status"
    q: queue.Queue = queue.Queue()

    def callback(indata, frames, t, status):
        q.put(indata[:, 0].copy())

    det = Detector(sensitivity=a.sensitivity)
    listening = None
    sent = 0
    last_beat = 0.0
    try:
        with sd.InputStream(samplerate=SR, blocksize=BLOCK, channels=1, dtype="float32",
                            device=a.device, callback=callback):
            # Measure the room first, so silence and crowd chatter never buzz anyone's wrist.
            print("Measuring room noise for 2 s. Keep the music off…")
            noise = []
            t_end = time.monotonic() + 2.0
            while time.monotonic() < t_end:
                b = q.get()
                noise.append(float(np.sqrt(np.mean(b ** 2))))
            det.set_noise_floor(float(np.percentile(noise, 50)))
            print(f"Room noise {det.noise_floor:.4f}. Listening… play some music. Ctrl+C to stop.")
            while True:
                block = q.get()
                cues = det.feed(block)
                now_listening = det.hearing_music()
                beat_due = time.monotonic() - last_beat > 2.0
                if now_listening != listening or beat_due:
                    last_beat = time.monotonic()
                    if now_listening != listening:
                        print("\n[music]" if now_listening else "\n[silence]")
                    listening = now_listening
                    if not a.dry_run:
                        # Also a heartbeat: if this stops, phones show "Audio source unavailable".
                        try:
                            post(status_url, {"audio": "listening" if listening else "lost", "source": "mic"})
                        except OSError:
                            pass
                if cues:
                    sent += len(cues)
                    kinds = ",".join(c["kind"] for c in cues)
                    if a.dry_run:
                        print(f"{det.t:7.2f}s  {kinds}")
                    else:
                        try:
                            r = post(cues_url, cues)
                            print(f"\r{det.t:7.2f}s  {kinds:<12} -> {r['deliveries']} device(s)   sent {sent}  ",
                                  end="", flush=True)
                        except OSError as e:
                            print(f"\nsend failed: {e}")
    except KeyboardInterrupt:
        pass
    finally:
        if not a.dry_run:
            try:
                post(status_url, {"audio": "idle", "source": "mic"})
                post(f"{base}/sessions/{a.session}/control", {"action": "stop"})
            except OSError:
                pass
        print("\nStopped.")


if __name__ == "__main__":
    main()
