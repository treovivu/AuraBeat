"""Listen to one laptop microphone and broadcast phone lightstick cues (ambient colour mode).

Pairs with the /lightstick page. For beats on phones AND watches, use scripts/live_audio.py.
    python scripts/live_lightstick.py --backend http://127.0.0.1:8001
"""

import argparse
import json
import queue
import time
import urllib.error
import urllib.parse
import urllib.request

import numpy as np
import sounddevice as sd


PALETTE = [
    "#7CF7D4",
    "#79B8FF",
    "#C7AAFF",
    "#F3B49B",
    "#F4D78B",
]


def post_json(url, payload):
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=2) as response:
        return json.loads(response.read())


def main():
    parser = argparse.ArgumentParser(
        description="Microphone-driven AuraBeat phone lightstick"
    )
    parser.add_argument(
        "--backend",
        default="http://127.0.0.1:8001",
    )
    parser.add_argument("--session", default="demo")
    parser.add_argument(
        "--device",
        type=int,
        default=None,
        help="Input device number from --list-devices",
    )
    parser.add_argument(
        "--sensitivity",
        type=float,
        default=1.0,
        help="Try 1.5 if the response is too weak",
    )
    parser.add_argument(
        "--list-devices",
        action="store_true",
    )
    args = parser.parse_args()

    if args.list_devices:
        print(sd.query_devices())
        return

    if not np.isfinite(args.sensitivity) or args.sensitivity <= 0:
        parser.error("--sensitivity must be positive")

    base = args.backend.rstrip("/")
    session = urllib.parse.quote(args.session, safe="")
    endpoint = f"{base}/sessions/{session}/cue?roles=phone"

    try:
        with urllib.request.urlopen(
            f"{base}/health",
            timeout=2,
        ) as response:
            health = json.loads(response.read())

        if not health.get("ok"):
            raise RuntimeError("Backend health check failed")
    except Exception as error:
        raise SystemExit(
            f"Cannot reach backend at {base}: {error}"
        )

    device_info = sd.query_devices(args.device, "input")
    sample_rate = int(device_info["default_samplerate"])
    block_size = 2048
    blocks = queue.Queue(maxsize=4)

    def audio_callback(indata, frames, time_info, status):
        # Keep capture lightweight and discard backlog rather than replaying it.
        data = indata[:, 0].copy()

        try:
            blocks.put_nowait(data)
        except queue.Full:
            try:
                blocks.get_nowait()
            except queue.Empty:
                pass

            try:
                blocks.put_nowait(data)
            except queue.Full:
                pass

    def latest_block():
        data = blocks.get(timeout=3)

        while True:
            try:
                data = blocks.get_nowait()
            except queue.Empty:
                return data

    window = np.hanning(block_size)
    frequencies = np.fft.rfftfreq(
        block_size,
        d=1.0 / sample_rate,
    )

    bass_mask = (frequencies >= 40) & (frequencies <= 180)

    print(f"Microphone: {device_info['name']}")
    print(f"Backend: {base}")
    print("Keep music paused for 2 seconds while measuring room noise.")

    with sd.InputStream(
        device=args.device,
        channels=1,
        samplerate=sample_rate,
        blocksize=block_size,
        dtype="float32",
        callback=audio_callback,
    ):
        noise_samples = []
        calibration_end = time.monotonic() + 2.0

        while time.monotonic() < calibration_end:
            data = latest_block()
            data = data - float(np.mean(data))
            rms = float(np.sqrt(np.mean(data * data)))
            noise_samples.append(rms)

        noise_floor = max(
            float(np.percentile(noise_samples, 50)),
            0.0001,
        )

        print("Ready. Play music near the laptop microphone.")
        print("Press Ctrl+C in THIS terminal to stop listening.")

        energy_average = noise_floor
        flux_average = 0.0
        previous_spectrum = None

        last_send = 0.0
        last_onset = 0.0
        last_error = 0.0

        pending_onset = False
        color_index = 0

        while True:
            data = latest_block()
            data = data - float(np.mean(data))

            rms = float(np.sqrt(np.mean(data * data)))
            spectrum = np.abs(np.fft.rfft(data * window))

            if previous_spectrum is None:
                flux = 0.0
            else:
                flux = float(
                    np.mean(
                        np.maximum(
                            spectrum - previous_spectrum,
                            0.0,
                        )
                    )
                )

            previous_spectrum = spectrum

            db_above_noise = 20.0 * np.log10(
                (rms + 1e-9) / noise_floor
            )

            level = float(
                np.clip(
                    ((db_above_noise - 5.0) / 30.0)
                    * args.sensitivity,
                    0.0,
                    1.0,
                )
            )

            now = time.monotonic()

            energy_jump = rms > max(
                energy_average * 1.3,
                noise_floor * 2.0,
            )

            spectral_jump = (
                flux > max(flux_average * 1.8, 0.0001)
            )

            onset = (
                level > 0.15
                and (energy_jump or spectral_jump)
                and now - last_onset > 0.2
            )

            energy_average = (
                energy_average * 0.95 + rms * 0.05
            )
            flux_average = (
                flux_average * 0.9 + flux * 0.1
            )

            if onset:
                pending_onset = True
                last_onset = now

            energetic = level > 0.55

            if energetic:
                interval = 1.2
                transition_ms = 0
            else:
                interval = 4.5
                transition_ms = 4000
                pending_onset = False

            due_to_onset = (
                energetic
                and pending_onset
                and now - last_send >= 0.55
            )
            due_to_interval = now - last_send >= interval

            if not (due_to_onset or due_to_interval):
                continue

            total = float(np.sum(spectrum)) + 1e-9
            bass_fraction = float(
                np.sum(spectrum[bass_mask]) / total
            )

            if level > 0.05:
                color_index = (color_index + 1) % len(PALETTE)

            kind = (
                "bass"
                if pending_onset and bass_fraction > 0.25
                else "percussion"
                if pending_onset
                else "beat"
            )

            payload = {
                "kind": kind,
                "at_ms": 0,
                "intensity": round(level, 3),
                "duration_ms": transition_ms,
                "pattern": "none",
                "color": PALETTE[color_index],
                "text": None,
            }

            last_send = now
            pending_onset = False

            try:
                result = post_json(endpoint, payload)
                count = result.get("delivered", 0)
                print(
                    f"Audio level {level:.2f} | "
                    f"{kind:10} | "
                    f"{count} phone(s)"
                )
            except (
                urllib.error.URLError,
                OSError,
                ValueError,
            ) as error:
                if now - last_error > 3:
                    print(f"Could not send cue: {error}")
                    last_error = now


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nMicrophone stopped.")
    except queue.Empty:
        raise SystemExit(
            "No microphone samples received. "
            "Check microphone selection and Windows permissions."
        )
    except sd.PortAudioError as error:
        raise SystemExit(f"Microphone error: {error}")