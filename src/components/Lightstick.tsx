import type { LightstickState } from "../types/concert";

interface LightstickProps {
  state: LightstickState;
  /** 0–1 beat pulse, already scaled by section intensity. */
  pulse: number;
  /** Continuous position in beats (beat number + phase), or -1 when not playing. Drives the wave. */
  beat: number;
  reducedMotion: boolean;
}

const headStyle: Record<LightstickState, string> = {
  off: "bg-white/10",
  idle: "bg-aura",
  pulse: "bg-aura",
  ready: "bg-anticipate",
  wave: "bg-aura",
  celebrate: "bg-gradient-to-b from-ink via-anticipate to-alert",
};

/** The phone lightstick. Reusable on the Live Concert screen. All motion follows the music's beat. */
export default function Lightstick({ state, pulse, beat, reducedMotion }: LightstickProps) {
  const lit = state !== "off";
  const glowOpacity =
    state === "idle"
      ? 0.25 + 0.6 * pulse
      : state === "pulse"
        ? 0.2 + 0.8 * pulse
        : state === "celebrate"
          ? 1
          : state === "off"
            ? 0
            : 0.4 + 0.6 * pulse;
  const headOpacity =
    state === "idle" ? 0.45 + 0.55 * pulse : state === "pulse" || state === "ready" ? 0.5 + 0.5 * pulse : undefined;
  // Waving: one swing per beat, reaching each side exactly on the beat.
  const swing = state === "wave" && !reducedMotion && beat >= 0 ? 14 * Math.cos(Math.PI * beat) : 0;

  return (
    <div aria-hidden="true" className="relative flex h-24 w-10 shrink-0 items-end justify-center">
      <div className="flex origin-bottom flex-col items-center" style={{ transform: `rotate(${swing}deg)` }}>
        <div className="relative">
          {lit && (
            <div
              className={`absolute -inset-4 rounded-full blur-xl ${state === "celebrate" ? "bg-anticipate" : state === "ready" ? "bg-anticipate/70" : "bg-aura/70"}`}
              style={{ opacity: glowOpacity }}
            />
          )}
          <div
            className={`relative h-14 w-5 rounded-full ${headStyle[state]}`}
            style={headOpacity === undefined ? undefined : { opacity: headOpacity }}
          />
        </div>
        <div className="h-7 w-3 rounded-b-md bg-surface-raised" />
      </div>
    </div>
  );
}
