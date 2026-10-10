import { useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, FixedWaveDetector } from "./waveDetectors";

const G = 9.81;

type MotionPermission = { requestPermission?: () => Promise<"granted" | "denied"> };

const LOOK: Record<string, { color: string; label: string; buzz: number | number[] }> = {
  beat: { color: "#7cf7d4", label: "BEAT", buzz: 30 },
  percussion: { color: "#7cf7d4", label: "BEAT", buzz: 30 },
  bass: { color: "#7cf7d4", label: "BASS", buzz: 60 },
  build: { color: "#ffc66d", label: "BUILD", buzz: [40, 80, 40] },
  "get-ready": { color: "#ffc66d", label: "GET READY", buzz: [40, 80, 40] },
  chorus: { color: "#7cf7d4", label: "WAVE", buzz: 120 },
  wave: { color: "#7cf7d4", label: "WAVE", buzz: 120 },
  drop: { color: "#ffd68c", label: "CELEBRATE", buzz: [60, 40, 60, 40, 160] },
  celebrate: { color: "#ffd68c", label: "CELEBRATE", buzz: [60, 40, 60, 40, 160] },
};

/**
 * iPhone Safari has no Vibration API, but flipping an `<input type="checkbox" switch>` plays the system
 * haptic tap (iOS 18+). One tap per "on" segment of the pattern.
 */
function iosHaptic(pattern: number | number[]) {
  const segments = Array.isArray(pattern) ? pattern : [pattern];
  let at = 0;
  segments.forEach((ms, i) => {
    if (i % 2 === 0) {
      window.setTimeout(() => {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.setAttribute("switch", "");
        label.style.display = "none";
        label.appendChild(input);
        document.body.appendChild(label);
        label.click();
        label.remove();
      }, at);
    }
    at += ms;
  });
}

/** Vibrates on Android; falls back to the iOS haptic tap. */
function buzz(pattern: number | number[]) {
  if ("vibrate" in navigator && navigator.vibrate(pattern)) return;
  iosHaptic(pattern);
}

/**
 * DEV: the phone stands in for the Apple Watch. It joins the dev server's watch relay as a watch, runs
 * the same wave detector as watchOS/MotionDetector.swift on the phone's motion, sends movement_detected
 * to the web app, and shows and buzzes the haptic cues it receives.
 */
export default function WatchSim() {
  const [relay, setRelay] = useState<"connecting" | "connected" | "offline">("connecting");
  const [stages, setStages] = useState(0);
  const [running, setRunning] = useState(false);
  const [problem, setProblem] = useState<string | null>(window.isSecureContext ? null : "Open this page over https:// (npm run dev:lab).");
  const [sent, setSent] = useState(0);
  const [haptic, setHaptic] = useState<{ pattern: string; id: number } | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const detector = useRef(new FixedWaveDetector({ ...DEFAULT_SETTINGS }));
  const counter = useRef(0);

  // Relay connection (as a watch), with reconnect.
  useEffect(() => {
    let closed = false;
    let retry: number | undefined;
    const open = () => {
      setRelay("connecting");
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/__aurabeat/relay?role=watch`);
      socket.current = ws;
      ws.onopen = () => setRelay("connected");
      ws.onmessage = (event) => {
        let msg: { type?: string; pattern?: string; stages?: number };
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (msg.type === "relay-status") setStages(msg.stages ?? 0);
        if (msg.type === "stop") {
          if ("vibrate" in navigator) navigator.vibrate(0);
          setHaptic(null);
        }
        if (msg.type === "haptic" && msg.pattern && LOOK[msg.pattern]) {
          setHaptic({ pattern: msg.pattern, id: ++counter.current });
          buzz(LOOK[msg.pattern].buzz);
        }
      };
      ws.onclose = () => {
        setRelay("offline");
        if (!closed) retry = window.setTimeout(open, 2000);
      };
    };
    open();
    return () => {
      closed = true;
      window.clearTimeout(retry);
      socket.current?.close();
    };
  }, []);

  // Motion → wave detection → movement_detected.
  useEffect(() => {
    if (!running) return;
    const onMotion = (e: DeviceMotionEvent) => {
      const u = e.acceleration;
      const roll = e.rotationRate?.gamma ?? 0;
      const accel = Math.hypot(u?.x ?? 0, u?.y ?? 0, u?.z ?? 0) / G;
      if (detector.current.process(roll, accel, performance.now() / 1000) === "wave") {
        setSent((n) => n + 1);
        if (socket.current?.readyState === WebSocket.OPEN) {
          socket.current.send(JSON.stringify({ type: "movement_detected", source: "watch", timestamp: Date.now() }));
        }
      }
    };
    window.addEventListener("devicemotion", onMotion);
    // Keep the screen on while acting as the watch.
    let lock: { release: () => Promise<void> } | null = null;
    (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => {});
    return () => {
      window.removeEventListener("devicemotion", onMotion);
      void lock?.release().catch(() => {});
    };
  }, [running]);

  const start = async () => {
    const ask = (DeviceMotionEvent as unknown as MotionPermission).requestPermission;
    if (ask) {
      try {
        if ((await ask()) !== "granted") return setProblem("Motion access was denied. Allow it in the browser settings and reload.");
      } catch {
        return setProblem("Couldn't ask for motion access. Tap Start again.");
      }
    }
    setRunning(true);
  };

  const look = haptic ? LOOK[haptic.pattern] : null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center gap-5 px-5 py-6 text-center">
      <header>
        <p className="font-display text-xs font-semibold tracking-[0.4em] text-aura">AURABEAT · DEV</p>
        <h1 className="mt-1 font-display text-2xl font-bold">Phone as watch</h1>
        <p className="mt-1 text-sm text-ink-muted">Stands in for the Apple Watch until the watch app is built.</p>
      </header>

      <div className="grid w-full grid-cols-2 gap-2 text-sm">
        <p className="rounded-2xl border border-white/10 bg-surface p-3">
          Relay
          <br />
          <strong className={relay === "connected" ? "text-aura" : "text-anticipate"}>{relay}</strong>
        </p>
        <p className="rounded-2xl border border-white/10 bg-surface p-3">
          Web app
          <br />
          <strong className={stages > 0 ? "text-aura" : "text-anticipate"}>{stages > 0 ? "connected" : "not open"}</strong>
        </p>
      </div>

      {problem && <p className="w-full rounded-2xl border border-alert/50 bg-alert/10 p-3 text-sm">{problem}</p>}

      {/* The "watch face": lights up with each haptic cue it receives */}
      <div className="relative flex aspect-square w-64 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white/15 bg-black">
        {haptic && look && (
          <span
            key={haptic.id}
            aria-hidden="true"
            className="absolute inset-0 animate-live-flash rounded-full"
            style={{ background: `radial-gradient(circle, ${look.color}, transparent 75%)`, ["--peak" as string]: 0.9 }}
          />
        )}
        <div className="relative">
          <p className="font-display text-3xl font-bold">{look?.label ?? (running ? "Ready" : "—")}</p>
          <p className="mt-1 text-sm text-ink-muted">Waves sent: {sent}</p>
        </div>
      </div>

      {!running ? (
        <button type="button" onClick={start} className="min-h-16 w-full rounded-3xl bg-aura font-display text-xl font-bold text-stage">
          Start
        </button>
      ) : (
        <p className="text-sm text-ink-muted">
          Hold the phone <strong className="text-ink">flat, screen up</strong> like a watch face. When the web app shows{" "}
          <strong className="text-aura">WAVE WITH THE MUSIC</strong>, wave!
        </p>
      )}
    </div>
  );
}
