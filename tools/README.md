# Live lightstick (microphone → phones)

`live_lightstick.py` listens to the music through the laptop microphone and sends **two independent
streams** from the same analysis:

- **Lighting cues**: `POST /sessions/<s>/cue`, paced for comfortable color changes (≤ 2 per second, slow blends when soft).
- **Musical-onset haptics**: `POST /sessions/<s>/haptic`. A cue is sent as soon as a transient is detected
  (an energy or spectral jump above the room-noise floor), at most one every 0.25 s.
  It is `bass` when most energy is at 40–180 Hz, otherwise `beat`. This is onset detection, not instrument recognition.

The dev server forwards both streams to every phone that has the lightstick open: `public/lightstick.html`
and the Live Concert screen. See `liveLightstickHub` in `vite.config.ts` for the protocol. Turn haptics off with `--no-haptics`.

## Haptic message (server → phone)

```json
{ "v": 1, "type": "haptic", "session": "demo", "sent_at": 1791664920045,
  "payload": { "cue_id": "<uuid>", "pattern": "beat|bass|build|chorus|drop|none", "intensity": 0.8, "duration_ms": 80 } }
```

The phone vibrates only when all of these hold:
- "Phone vibrations" is ticked and the lightstick is on;
- the page is connected, playing and visible;
- the cue is new (dedupe on `cue_id`);
- `sent_at` is within −100…+500 ms of the server clock and after the last stop/reset;
- at least 250 ms have passed since the last vibration.

Each vibration lasts 30–100 ms. Haptic messages never change the lighting, and lighting cues never vibrate.

## Run

1. Start the web app (`npm run dev` or `npm run dev:lab`). It also opens the backend for the script at
   `http://127.0.0.1:8000` (on this Mac only).
2. One time, set up Python:
   ```sh
   python3 -m venv .venv && .venv/bin/pip install -r tools/requirements.txt
   ```
3. Start listening. Keep the music paused for the first 2 seconds while it measures the room noise:
   ```sh
   .venv/bin/python tools/live_lightstick.py            # --list-devices / --device N / --sensitivity 1.5
   ```
4. On a phone, open Live Concert → **Shared lightstick** (or `/lightstick.html`) and tap **Turn lightstick on**.
   You can also tap **Start live mode** on the Live Concert screen; it reacts to the same cues.

If two dev servers run at once, port 8000 belongs to whichever started first; `npm run dev:watch` never takes it.

macOS must allow the app you run the script from (Terminal, VS Code…) to use the microphone:
System Settings → Privacy & Security → Microphone. Without it the script runs but every level reads 0.00.

## Testing phone vibrations on a real Android phone (e.g. Motorola)

Only a person holding the phone can confirm a vibration. The browser reports only that it accepted the request.

1. Open `/lightstick.html` on the phone in Chrome. Use `npm run dev:lab` (https); the phone and laptop must be on a
   network that lets devices reach each other. Keep the page visible.
2. Tap **Test phone vibration**. Write down whether you physically felt three short pulses.
3. Tick **Phone vibrations — optional**, then tap **Turn lightstick on**.
4. On the laptop, run `live_lightstick.py` and play music near the microphone.
5. Check:
   - the light keeps changing;
   - short pulses arrive on the beats, also when the color isn't changing;
   - **Turn lightstick off**, unticking the box, or switching apps stops the vibration at once.

iPhone Safari has no `navigator.vibrate`, so the checkbox there is disabled with a message, and lighting still works.
