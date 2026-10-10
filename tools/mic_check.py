"""Standalone microphone check, independent of the AuraBeat pipeline.

Prints RMS and peak (linear and dBFS) every 0.25 s for a few seconds, so you can
compare silence vs. music:

    .venv/bin/python tools/mic_check.py               # default input, 10 s
    .venv/bin/python tools/mic_check.py --device 0 --seconds 20

Rough guide: digital silence (all zeros) usually means the app running this
script has no microphone permission. A quiet room is around -60 to -45 dBFS;
music near the laptop is typically -35 to -15 dBFS.
"""

import argparse

import numpy as np
import sounddevice as sd


def dbfs(value):
    return 20 * np.log10(max(value, 1e-12))


def main():
    parser = argparse.ArgumentParser(description="Microphone RMS/peak meter")
    parser.add_argument("--device", type=int, default=None)
    parser.add_argument("--seconds", type=float, default=10.0)
    args = parser.parse_args()

    info = sd.query_devices(args.device, "input")
    rate = int(info["default_samplerate"])
    chunk = int(rate * 0.25)
    print(f"Input: {info['name']} @ {rate} Hz")

    all_zero = True
    with sd.InputStream(device=args.device, channels=1, samplerate=rate,
                        dtype="float32") as stream:
        for _ in range(int(args.seconds / 0.25)):
            data, overflowed = stream.read(chunk)
            x = data[:, 0].astype(np.float64)
            x -= x.mean()
            rms = float(np.sqrt(np.mean(x * x)))
            peak = float(np.max(np.abs(x)))
            all_zero = all_zero and peak == 0.0
            bar = "#" * int(max(0.0, dbfs(rms) + 80) / 2)
            print(f"rms={rms:.6f} ({dbfs(rms):6.1f} dBFS)  "
                  f"peak={peak:.6f} ({dbfs(peak):6.1f} dBFS)"
                  f"{'  OVERFLOW' if overflowed else ''}  {bar}")

    if all_zero:
        print("Every sample was exactly 0: check System Settings → Privacy & "
              "Security → Microphone for the app running this script.")


if __name__ == "__main__":
    main()
