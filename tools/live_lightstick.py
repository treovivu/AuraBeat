"""Listen to one laptop microphone and broadcast phone lightstick cues.

Two independent streams come out of the same analysis:
- lighting cues (POST /sessions/<s>/cue), paced for comfortable color changes;
- musical-onset haptic cues (POST /sessions/<s>/haptic), sent as soon as a
  transient is detected, at most one every HAPTIC_MIN_GAP seconds.
"""

import argparse
import json
import queue
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

import numpy as np
import sounddevice as sd


# Haptics: minimum spacing between onset haptics, and the share of spectral
# energy at 40-180 Hz above which an onset counts as "bass".
HAPTIC_MIN_GAP = 0.25
BASS_SHARE = 0.25

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
        default="http://127.0.0.1:8000",
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
    parser.add_argument(
        "--no-haptics",
        action="store_true",
        help="Send lighting cues only, no musical-onset haptics",
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
    haptic_endpoint = f"{base}/sessions/{session}/haptic"

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

        # DEBUG (temporary): what the room-noise calibration measured.
        print(
            "DETECTOR calibration "
            f"noise_floor_rms={noise_floor:.6f} "
            f"({20 * np.log10(noise_floor):.1f} dBFS) "
            f"min={min(noise_samples):.6f} max={max(noise_samples):.6f} "
            f"blocks={len(noise_samples)}"
        )
        print(
            "DETECTOR level = clip((dB above floor - 5) / 30 * sensitivity); "
            "onset needs level > 0.15 "
            f"(= {5 + 0.15 * 30 / args.sensitivity:.1f} dB above floor, "
            f"rms > {noise_floor * 10 ** ((5 + 0.15 * 30 / args.sensitivity) / 20):.6f}) "
            "AND (energy jump OR spectral jump) AND 0.2 s since last onset"
        )
        print("Ready. Play music near the laptop microphone.")
        print("Press Ctrl+C in THIS terminal to stop listening.")

        energy_average = noise_floor
        flux_average = 0.0
        previous_spectrum = None

        last_send = 0.0
        last_onset = 0.0
        last_error = 0.0
        last_haptic = 0.0

        pending_onset = False
        color_index = 0

        # DEBUG (temporary): one DETECTOR summary line per second.
        stats_start = time.monotonic()
        stats = {"blocks": 0, "max_rms": 0.0, "max_level": 0.0,
                 "energy_jumps": 0, "spectral_jumps": 0,
                 "jumps_below_level": 0, "onsets": 0}

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

            # DEBUG (temporary)
            stats["blocks"] += 1
            stats["max_rms"] = max(stats["max_rms"], rms)
            stats["max_level"] = max(stats["max_level"], level)
            stats["energy_jumps"] += int(energy_jump)
            stats["spectral_jumps"] += int(spectral_jump)
            stats["jumps_below_level"] += int(
                (energy_jump or spectral_jump) and level <= 0.15
            )
            stats["onsets"] += int(onset)
            if now - stats_start >= 1.0:
                print(
                    "DETECTOR "
                    f"max_rms={stats['max_rms']:.6f} "
                    f"({20 * np.log10(stats['max_rms'] + 1e-12):.1f} dBFS, "
                    f"{20 * np.log10((stats['max_rms'] + 1e-9) / noise_floor):+.1f} dB vs floor) "
                    f"max_level={stats['max_level']:.2f} "
                    f"energy_jumps={stats['energy_jumps']} "
                    f"spectral_jumps={stats['spectral_jumps']} "
                    f"jumps_blocked_by_level={stats['jumps_below_level']} "
                    f"onsets={stats['onsets']} "
                    f"blocks={stats['blocks']}"
                )
                stats_start = now
                for key in stats:
                    stats[key] = 0 if key != "max_rms" else 0.0

            # Musical-onset haptic: sent right away, independent of the
            # lighting cadence below (which may hold a cue for seconds).
            if (
                onset
                and not args.no_haptics
                and now - last_haptic >= HAPTIC_MIN_GAP
            ):
                last_haptic = now
                bass_share = float(
                    np.sum(spectrum[bass_mask])
                    / (float(np.sum(spectrum)) + 1e-9)
                )
                pattern = "bass" if bass_share > BASS_SHARE else "beat"
                haptic = {
                    "cue_id": uuid.uuid4().hex[:12],
                    "pattern": pattern,
                    "intensity": round(level, 3),
                    "duration_ms": 80 if pattern == "bass" else 45,
                }

                try:
                    result = post_json(haptic_endpoint, haptic)
                    # DEBUG (temporary)
                    print(
                        "HAPTIC SEND "
                        f"cue_id={haptic['cue_id']} "
                        f"pattern={pattern} "
                        f"intensity={haptic['intensity']} "
                        f"duration_ms={haptic['duration_ms']} "
                        f"audio_level={level:.3f} "
                        f"delivered={result.get('delivered', 0)}"
                    )
                except (
                    urllib.error.URLError,
                    OSError,
                    ValueError,
                ) as error:
                    if now - last_error > 3:
                        print(f"Could not send haptic: {error}")
                        last_error = now

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

            from_onset = pending_onset  # DEBUG (temporary)
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
                    # DEBUG (temporary): this is the LIGHTING cue, not a haptic.
                    + (" | LIGHT cue, from onset" if from_onset
                       else " | LIGHT cue, timed (no onset; kind is the default)")
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