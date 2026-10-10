import { useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, FixedWaveDetector, OriginalWaveDetector, type FixedDetectorSettings } from "./waveDetectors";

const G = 9.81;
const WINDOW_S = 4;

/** Rotation axis of the phone: x (beta), y (gamma — forearm roll when held like a watch face), z (alpha). */
type Axis = "x" | "y" | "z";
const ROTATION_FIELD: Record<Axis, "beta" | "gamma" | "alpha"> = { x: "beta", y: "gamma", z: "alpha" };
interface Sample {
  t: number;
  /** Wrist roll rate on the chosen axis (°/s). */
  roll: number;
}
interface Mark {
  t: number;
  kind: "swing" | "wave" | "original";
}

const TRIALS = [
  { id: "wave", label: "Waving", wantWave: true, hint: "Wave side to side, like greeting someone far away." },
  { id: "gentle", label: "Gentle wave", wantWave: true, hint: "A small, relaxed wave." },
  { id: "walk", label: "Walking", wantWave: false, hint: "Walk around holding the phone at your side." },
  { id: "bounce", label: "Bouncing", wantWave: false, hint: "Bounce / jump to the beat." },
  { id: "clap", label: "Clapping", wantWave: false, hint: "Clap with the phone in one hand (gently!)." },
  { id: "raise", label: "Arm raise", wantWave: false, hint: "Raise your arm once and hold it up." },
  { id: "still", label: "Resting", wantWave: false, hint: "Keep your hand still." },
] as const;
type TrialId = (typeof TRIALS)[number]["id"];

/** One raw motion sample, recorded during a trial: user accel (g), accel incl. gravity (g), rotation (°/s). */
type RawSample = [t: number, ax: number, ay: number, az: number, gx: number, gy: number, gz: number, ra: number, rb: number, rg: number];

interface TrialResult {
  id: TrialId;
  fixed: number;
  original: number;
}

type MotionPermission = { requestPermission?: () => Promise<"granted" | "denied"> };

const SLIDERS: { key: keyof FixedDetectorSettings; label: string; min: number; max: number; step: number; unit: string }[] = [
  { key: "rotationThreshold", label: "Rotation threshold", min: 40, max: 250, step: 10, unit: "°/s" },
  { key: "minSwingDuration", label: "Min swing length", min: 0.02, max: 0.15, step: 0.01, unit: "s" },
  { key: "swingsForWave", label: "Swings per wave", min: 2, max: 5, step: 1, unit: "" },
  { key: "waveWindow", label: "Wave window", min: 0.6, max: 2, step: 0.1, unit: "s" },
  { key: "waveCooldown", label: "Cooldown", min: 0.2, max: 1.5, step: 0.1, unit: "s" },
  { key: "bounceGate", label: "Bounce gate", min: 0.4, max: 1.6, step: 0.1, unit: "g" },
];

/**
 * DEV-only Wave Lab: tries the watch's wave detection with real motion on a phone.
 * Hold the phone flat, screen up, like a watch face on your wrist, and move.
 */
export default function WaveLab() {
  const [running, setRunning] = useState(false);
  const [problem, setProblem] = useState<string | null>(
    window.isSecureContext ? null : "Motion sensors need HTTPS. Start the dev server with `npm run dev:lab` and open the https:// address.",
  );
  const [axis, setAxis] = useState<Axis>("y");
  const [settings, setSettings] = useState<FixedDetectorSettings>(DEFAULT_SETTINGS);
  const [counts, setCounts] = useState({ fixed: 0, original: 0 });
  const [flash, setFlash] = useState(0);
  const [rate, setRate] = useState(0);
  const [trial, setTrial] = useState<{ id: TrialId; endsAt: number; start: { fixed: number; original: number } } | null>(null);
  const [results, setResults] = useState<TrialResult[]>([]);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(0);
  const [saved, setSaved] = useState<{ count: number; last: string | null; error: string | null }>({ count: 0, last: null, error: null });
  const recording = useRef<RawSample[] | null>(null);

  const samples = useRef<Sample[]>([]);
  const marks = useRef<Mark[]>([]);
  const fixed = useRef(new FixedWaveDetector(DEFAULT_SETTINGS));
  const original = useRef(new OriginalWaveDetector());
  const totals = useRef({ fixed: 0, original: 0 });
  const canvas = useRef<HTMLCanvasElement>(null);
  const axisRef = useRef<Axis>(axis);
  const eventsThisSecond = useRef(0);

  useEffect(() => {
    axisRef.current = axis;
    fixed.current.reset();
  }, [axis]);

  useEffect(() => {
    fixed.current.settings = settings;
  }, [settings]);

  // Sensor listener
  useEffect(() => {
    if (!running) return;
    const onMotion = (e: DeviceMotionEvent) => {
      const t = performance.now() / 1000;
      eventsThisSecond.current++;
      const user = e.acceleration;
      const raw = e.accelerationIncludingGravity;
      if (!raw) return;
      const rot = e.rotationRate;
      recording.current?.push([
        +t.toFixed(4),
        +((user?.x ?? 0) / G).toFixed(4),
        +((user?.y ?? 0) / G).toFixed(4),
        +((user?.z ?? 0) / G).toFixed(4),
        +((raw.x ?? 0) / G).toFixed(4),
        +((raw.y ?? 0) / G).toFixed(4),
        +((raw.z ?? 0) / G).toFixed(4),
        +(rot?.alpha ?? 0).toFixed(2),
        +(rot?.beta ?? 0).toFixed(2),
        +(rot?.gamma ?? 0).toFixed(2),
      ]);

      // Original detector: raw acceleration including gravity.
      if (original.current.process((raw.x ?? 0) / G, (raw.y ?? 0) / G, (raw.z ?? 0) / G, t)) {
        totals.current.original++;
        marks.current.push({ t, kind: "original" });
        setCounts({ ...totals.current });
      }

      // Fixed detector: gravity-free acceleration on the chosen axis.
      // New detector: wrist roll (rotation rate) plus a whole-body bounce gate.
      const roll = rot?.[ROTATION_FIELD[axisRef.current]] ?? 0;
      const accelMagnitude = Math.hypot(user?.x ?? 0, user?.y ?? 0, user?.z ?? 0) / G;
      samples.current.push({ t, roll });
      const result = fixed.current.process(roll, accelMagnitude, t);
      if (result === "swing" || result === "wave") marks.current.push({ t, kind: result });
      if (result === "wave") {
        totals.current.fixed++;
        setCounts({ ...totals.current });
        setFlash((f) => f + 1);
        if ("vibrate" in navigator) navigator.vibrate(80);
      }
      const cutoff = t - WINDOW_S;
      while (samples.current.length && samples.current[0].t < cutoff) samples.current.shift();
      while (marks.current.length && marks.current[0].t < cutoff) marks.current.shift();
    };
    window.addEventListener("devicemotion", onMotion);
    const rateTimer = window.setInterval(() => {
      setRate(eventsThisSecond.current);
      if (eventsThisSecond.current === 0) setProblem("No motion data yet. Is this a phone, and was motion access allowed?");
      else setProblem(null);
      eventsThisSecond.current = 0;
    }, 1000);
    return () => {
      window.removeEventListener("devicemotion", onMotion);
      window.clearInterval(rateTimer);
    };
  }, [running]);

  // Chart
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    const draw = () => {
      const c = canvas.current;
      const ctx = c?.getContext("2d");
      if (c && ctx) {
        const w = (c.width = c.clientWidth * devicePixelRatio);
        const h = (c.height = c.clientHeight * devicePixelRatio);
        const t1 = performance.now() / 1000;
        const x = (t: number) => ((t - (t1 - WINDOW_S)) / WINDOW_S) * w;
        const scale = h / 2 / 400; // ±400 °/s fills the chart
        const y = (v: number) => h / 2 - v * scale;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(0, h / 2, w, 1);
        ctx.strokeStyle = "rgba(255,198,109,0.6)";
        ctx.setLineDash([6 * devicePixelRatio, 6 * devicePixelRatio]);
        for (const g of [settings.rotationThreshold, -settings.rotationThreshold]) {
          ctx.beginPath();
          ctx.moveTo(0, y(g));
          ctx.lineTo(w, y(g));
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.strokeStyle = "#7cf7d4";
        ctx.lineWidth = 2 * devicePixelRatio;
        ctx.beginPath();
        samples.current.forEach((s, i) => (i ? ctx.lineTo(x(s.t), y(s.roll)) : ctx.moveTo(x(s.t), y(s.roll))));
        ctx.stroke();
        for (const m of marks.current) {
          if (m.kind === "wave") {
            ctx.fillStyle = "rgba(255,198,109,0.9)";
            ctx.fillRect(x(m.t) - devicePixelRatio, 0, 3 * devicePixelRatio, h);
          } else if (m.kind === "original") {
            ctx.fillStyle = "#ff7a85";
            ctx.fillRect(x(m.t) - devicePixelRatio, h - 14 * devicePixelRatio, 3 * devicePixelRatio, 14 * devicePixelRatio);
          } else {
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(x(m.t), y(0), 4 * devicePixelRatio, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [running, settings.rotationThreshold]);

  // Trial countdown
  useEffect(() => {
    if (!trial) return;
    const id = window.setInterval(() => {
      const t = performance.now() / 1000;
      setNow(t);
      if (t >= trial.endsAt) {
        const result = { id: trial.id, fixed: totals.current.fixed - trial.start.fixed, original: totals.current.original - trial.start.original };
        setResults((r) => [result, ...r.filter((x) => x.id !== trial.id)]);
        setTrial(null);
        // Send the raw motion of this trial to the dev server (lab-data/ on the Mac) for tuning.
        const samples = recording.current ?? [];
        recording.current = null;
        fetch("/__aurabeat/lab-recording", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trial: trial.id,
            result,
            settings: fixed.current.settings,
            axis: axisRef.current,
            userAgent: navigator.userAgent,
            columns: ["t", "ax", "ay", "az", "gx", "gy", "gz", "rotAlpha", "rotBeta", "rotGamma"],
            samples,
          }),
        })
          .then((r) => r.json())
          .then((r: { ok: boolean; file?: string; error?: string }) =>
            setSaved((s) => (r.ok ? { count: s.count + 1, last: r.file ?? null, error: null } : { ...s, error: r.error ?? "Save failed" })),
          )
          .catch(() => setSaved((s) => ({ ...s, error: "Couldn't reach the Mac — is `npm run dev:lab` running?" })));
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [trial]);

  const start = async () => {
    const permission = (DeviceMotionEvent as unknown as MotionPermission).requestPermission;
    if (permission) {
      try {
        if ((await permission()) !== "granted") return setProblem("Motion access was denied. Allow it in the browser settings and reload.");
      } catch {
        return setProblem("Couldn't ask for motion access. Tap Start again.");
      }
    }
    setRunning(true);
  };

  // The click's timeStamp uses the same clock as performance.now().
  const runTrial = (id: TrialId, clickedAt: number) => {
    fixed.current.reset();
    recording.current = [];
    const t = clickedAt / 1000;
    setNow(t);
    setTrial({ id, endsAt: t + 5, start: { ...totals.current } });
  };

  const swift = `rotationThreshold = ${((settings.rotationThreshold * Math.PI) / 180).toFixed(2)}  // rad/s (= ${settings.rotationThreshold} °/s)
minSwingDuration = ${settings.minSwingDuration}  // s
swingsForWave = ${settings.swingsForWave}
waveWindow = ${settings.waveWindow}
waveCooldown = ${settings.waveCooldown}
bounceGate = ${settings.bounceGate}  // g, RMS of userAcceleration over 0.5 s`;

  const trialInfo = trial ? TRIALS.find((x) => x.id === trial.id) : null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-4 py-5">
      <header>
        <p className="font-display text-xs font-semibold tracking-[0.4em] text-aura">AURABEAT · DEV</p>
        <h1 className="mt-1 font-display text-2xl font-bold">Wave Lab</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Try the watch's wave detection with real motion. Hold the phone <strong className="text-ink">flat, screen up</strong>, like a watch
          face on your wrist.
        </p>
      </header>

      {problem && <p className="rounded-2xl border border-alert/50 bg-alert/10 p-3 text-sm text-ink">{problem}</p>}

      {!running ? (
        <button type="button" onClick={start} className="min-h-16 rounded-3xl bg-aura font-display text-xl font-bold text-stage">
          Start sensors
        </button>
      ) : (
        <>
          {/* Live result */}
          <section className="grid grid-cols-2 gap-3">
            <div className="relative overflow-hidden rounded-3xl border border-aura/40 bg-surface p-4 text-center">
              {flash > 0 && <span key={flash} aria-hidden="true" className="absolute inset-0 animate-live-flash bg-anticipate/60" />}
              <p className="relative text-xs tracking-widest text-ink-muted uppercase">Fixed detector</p>
              <p className="relative font-display text-4xl font-bold text-aura">{counts.fixed}</p>
              <p className="relative text-xs text-ink-muted">waves</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-surface p-4 text-center">
              <p className="text-xs tracking-widest text-ink-muted uppercase">Original</p>
              <p className="font-display text-4xl font-bold text-alert">{counts.original}</p>
              <p className="text-xs text-ink-muted">waves</p>
            </div>
          </section>

          {/* Chart */}
          <section className="rounded-3xl border border-white/10 bg-surface p-3">
            <div className="flex items-center justify-between text-xs text-ink-muted">
              <span>
                Wrist roll (°/s) · {rate} samples/s
              </span>
              <span className="flex gap-1">
                {(["x", "y", "z"] as Axis[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAxis(a)}
                    className={`min-h-8 min-w-8 rounded-lg font-semibold ${axis === a ? "bg-aura/20 text-aura" : "text-ink-muted"}`}
                  >
                    {a}
                  </button>
                ))}
              </span>
            </div>
            <canvas ref={canvas} className="mt-2 h-40 w-full" />
            <p className="mt-1 text-[11px] text-ink-muted">
              Mint line = wrist roll · dashed = threshold · white dots = swings · gold bars = waves (fixed) · red ticks = original
              detector
            </p>
          </section>

          {/* Trials */}
          <section className="rounded-3xl border border-white/10 bg-surface p-4">
            <p className="font-semibold text-ink">Trials (5 s each)</p>
            {trial && trialInfo ? (
              <div className="mt-2 rounded-2xl bg-aura/10 p-3 text-center">
                <p className="font-display text-xl font-bold text-aura">
                  {trialInfo.label} · {Math.max(0, Math.ceil(trial.endsAt - now))}
                </p>
                <p className="text-sm text-ink-muted">{trialInfo.hint}</p>
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {TRIALS.map((t) => (
                  <button key={t.id} type="button" onClick={(e) => runTrial(t.id, e.timeStamp)} className="min-h-11 rounded-xl border border-white/15 text-sm font-semibold text-ink">
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            {(saved.count > 0 || saved.error) && (
              <p className={`mt-2 text-xs ${saved.error ? "text-alert" : "text-aura"}`}>
                {saved.error ?? `Recorded ${saved.count} trial${saved.count === 1 ? "" : "s"} to the Mac ✓`}
              </p>
            )}
            {results.length > 0 && (
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-muted">
                    <th className="font-normal">Trial</th>
                    <th className="font-normal">Fixed</th>
                    <th className="font-normal">Original</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => {
                    const want = TRIALS.find((t) => t.id === r.id)!.wantWave;
                    const ok = (n: number) => (want ? n > 0 : n === 0);
                    return (
                      <tr key={r.id} className="border-t border-white/10">
                        <td className="py-1.5">{TRIALS.find((t) => t.id === r.id)!.label}</td>
                        <td>
                          {ok(r.fixed) ? "✅" : "❌"} {r.fixed}
                        </td>
                        <td>
                          {ok(r.original) ? "✅" : "❌"} {r.original}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          {/* Tuning */}
          <section className="rounded-3xl border border-white/10 bg-surface p-4">
            <p className="font-semibold text-ink">Tune the fixed detector</p>
            {SLIDERS.map((s) => (
              <label key={s.key} className="mt-3 block text-sm">
                <span className="flex justify-between text-ink-muted">
                  {s.label}
                  <span className="text-ink tabular-nums">
                    {settings[s.key]}
                    {s.unit}
                  </span>
                </span>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={settings[s.key]}
                  onChange={(e) => setSettings({ ...settings, [s.key]: Number(e.target.value) })}
                  className="w-full accent-aura"
                />
              </label>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setSettings(DEFAULT_SETTINGS)} className="min-h-11 rounded-xl border border-white/15 text-sm font-semibold text-ink">
                Reset
              </button>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(swift).then(() => setCopied(true))}
                className="min-h-11 rounded-xl bg-aura/20 text-sm font-semibold text-aura"
              >
                {copied ? "Copied" : "Copy for Pramit"}
              </button>
            </div>
            <pre className="mt-2 overflow-x-auto rounded-xl bg-black/40 p-2 text-[11px] text-ink-muted">{swift}</pre>
          </section>
        </>
      )}
    </div>
  );
}
