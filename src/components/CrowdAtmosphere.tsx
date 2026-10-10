import { memo, type CSSProperties } from "react";
import type { InteractionPhase } from "../lib/interaction";
import type { SectionMood } from "../types/performance";

interface CrowdAtmosphereProps {
  mood: SectionMood;
  /** The app's interaction phase (never decided here). */
  phase: InteractionPhase;
  celebrating: boolean;
  /** Changes on each celebration so the crowd light wave replays. */
  celebrationKey?: number;
  /** 0–1 visual energy of the moment. */
  energy: number;
  /** Continuous beat position from the app's existing clock, or -1 when not playing or not swaying. */
  beat: number;
  /** Light toggle: when off, only the silhouettes remain. */
  lit: boolean;
  reducedMotion: boolean;
  /**
   * "page": a fixed band along the bottom of the screen (behind the content).
   * "stage": the foreground audience inside the virtual stage, with raised hands.
   */
  variant?: "page" | "stage";
}

// Deterministic layout so the crowd never jumps between renders.
const rand = (seed: number) => {
  const x = Math.sin(seed * 999.13) * 43758.5453;
  return x - Math.floor(x);
};

const STICKS = Array.from({ length: 26 }, (_, i) => ({
  x: 3 + (i / 25) * 94 + (rand(i + 1) - 0.5) * 3,
  lift: rand(i + 7) * 22,
  warm: rand(i + 13) > 0.72,
  tall: rand(i + 19) > 0.5,
  phase: rand(i + 23) * 0.9,
  // Order in which sticks light up as energy rises, so the crowd fills in naturally.
  rank: rand(i + 31),
}));
const STICK_ORDER = [...STICKS].sort((a, b) => a.rank - b.rank);

const BOKEH = Array.from({ length: 12 }, (_, i) => ({
  x: rand(i + 41) * 100,
  bottom: rand(i + 47) * 30,
  size: 4 + rand(i + 53) * 10,
  warm: rand(i + 59) > 0.6,
  duration: 12 + rand(i + 61) * 10,
  delay: -rand(i + 67) * 20,
  drift: (rand(i + 71) - 0.5) * 60,
}));

/** Head-and-shoulder silhouettes as one SVG path per row. */
function crowdPath(seed: number, scale: number): string {
  let d = "";
  for (let x = -20, i = 0; x < 1220; i++) {
    const w = (24 + rand(seed + i) * 14) * scale;
    const r = (9 + rand(seed + i + 100) * 4) * scale;
    const top = 120 - (46 + rand(seed + i + 200) * 18) * scale;
    const cx = x + w;
    d += `M${cx - w},120 Q${cx - w},${top + r * 2.2} ${cx},${top + r * 2} Q${cx + w},${top + r * 2.2} ${cx + w},120 Z `;
    d += `M${cx - r},${top} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0 Z `;
    x += w * 2 - 6 * scale;
  }
  return d;
}
const BACK_ROW = crowdPath(1, 0.75);
const FRONT_ROW = crowdPath(500, 1);

const VISIBLE_BY_MOOD: Record<SectionMood, number> = {
  restrained: 5,
  cool: 9,
  rising: 14,
  anticipation: 18,
  peak: 22,
  finale: 26,
};

/**
 * Stylised audience at the bottom of the screen: silhouettes, lightsticks, bokeh, haze and soft beams.
 * Purely decorative — it reads the app's mood, interaction phase and beat; it never decides timing.
 * Memoised: between beats-driven sways it only re-renders when the moment changes.
 */
export default memo(function CrowdAtmosphere({
  mood,
  phase,
  celebrating,
  celebrationKey,
  energy,
  beat,
  lit,
  reducedMotion,
  variant = "page",
}: CrowdAtmosphereProps) {
  const stage = variant === "stage";
  const engaged = phase === "wave" || celebrating;
  const visible = celebrating ? STICKS.length : Math.max(VISIBLE_BY_MOOD[mood], engaged ? 22 : phase === "get-ready" ? 18 : 0);
  const litSet = new Set(STICK_ORDER.slice(0, visible));
  // Sway follows the app's beat position; amplitude grows with the moment. Off under Reduce Motion.
  const swayAmp = reducedMotion || beat < 0 ? 0 : engaged ? 13 : mood === "peak" || mood === "finale" ? 5 : 0;
  const glow = 0.35 + 0.55 * energy;

  return (
    <div
      aria-hidden="true"
      className={
        stage
          ? "pointer-events-none absolute inset-x-0 bottom-0 h-[30%] overflow-hidden"
          : "pointer-events-none fixed inset-x-0 bottom-0 -z-10 h-[20vh] overflow-hidden sm:h-[28vh]"
      }
    >
      {lit && !stage && (
        <>
          {/* Haze rising from the crowd */}
          <div
            className={`absolute inset-0 bg-gradient-to-t to-transparent transition-opacity duration-1000 ${
              celebrating ? "from-anticipate/15" : phase === "get-ready" ? "from-anticipate/10" : "from-aura/10"
            }`}
            style={{ opacity: 0.4 + 0.6 * energy }}
          />

          {/* Soft stage beams; they open outward on a celebration */}
          {[-18, 0, 18].map((angle) => (
            <div
              key={`beam-${angle}`}
              className="absolute bottom-0 left-1/2 h-[90%] w-24 origin-bottom bg-gradient-to-t from-aura/25 to-transparent blur-xl transition-opacity duration-1000 sm:w-40"
              style={{ transform: `translateX(-50%) rotate(${angle}deg)`, opacity: (engaged ? 0.55 : 0.18) * energy }}
            />
          ))}
          {celebrating && !reducedMotion && (
            <div key={`open-${celebrationKey}`}>
              {[-1, 1].map((side) => (
                <div
                  key={side}
                  className="absolute bottom-0 left-1/2 h-full w-32 origin-bottom animate-beam-open bg-gradient-to-t from-anticipate/50 to-transparent blur-lg"
                  style={{ "--from": `${side * 4}deg`, "--to": `${side * 38}deg`, marginLeft: -64 } as CSSProperties}
                />
              ))}
            </div>
          )}

          {/* Floating bokeh */}
          {BOKEH.map((b, i) => (
            <span
              key={`bokeh-${i}`}
              className={`absolute rounded-full blur-[2px] ${b.warm ? "bg-anticipate" : "bg-aura"} ${reducedMotion ? "" : "animate-float-up"}`}
              style={
                {
                  left: `${b.x}%`,
                  bottom: `${b.bottom}%`,
                  width: b.size,
                  height: b.size,
                  opacity: (0.12 + 0.3 * energy) * (reducedMotion ? 0.6 : 1),
                  animationDuration: `${b.duration}s`,
                  animationDelay: `${b.delay}s`,
                  "--drift": `${b.drift}px`,
                } as CSSProperties
              }
            />
          ))}
        </>
      )}

      {/* Silhouettes */}
      <svg className={`absolute inset-x-0 bottom-0 w-full ${stage ? "h-[60%]" : "h-[34%]"}`} viewBox="0 0 1200 120" preserveAspectRatio="none">
        <path d={BACK_ROW} fill="#0b1016" transform="translate(0 -14)" />
        <path d={FRONT_ROW} fill="#05070a" />
      </svg>

      {/* Lightsticks held up above the crowd */}
      {lit &&
        STICKS.map((stick, i) => {
          const on = litSet.has(stick);
          const angle = swayAmp ? swayAmp * Math.cos(Math.PI * (beat + stick.phase)) : 0;
          const phone = stage && stick.rank > 0.82;
          return (
            <div
              key={`stick-${i}`}
              className={`absolute flex origin-bottom flex-col items-center transition-opacity duration-700 ${i % 2 ? "hidden sm:flex" : ""}`}
              style={{
                left: `${stick.x}%`,
                bottom: stage ? `calc(34% + ${stick.lift * 0.3}px)` : `calc(26% + ${stick.lift * 0.6}px)`,
                opacity: on ? Math.min(1, glow) : 0,
                transform: `rotate(${angle}deg)`,
              }}
            >
              <span
                key={celebrating && !reducedMotion ? `ripple-${celebrationKey}` : "still"}
                className={`block ${phone ? "h-2.5 w-1.5 rounded-[2px] bg-white/90 shadow-[0_0_8px_2px] shadow-white/50" : `rounded-full ${stick.tall ? "h-4 w-1" : "h-3 w-1"} ${
                  celebrating || stick.warm ? "bg-anticipate shadow-[0_0_10px_2px] shadow-anticipate/70" : "bg-aura shadow-[0_0_10px_2px] shadow-aura/70"
                }`} ${celebrating && !reducedMotion ? "animate-crowd-ripple" : ""}`}
                style={celebrating && !reducedMotion ? { animationDelay: `${stick.x * 7}ms` } : undefined}
              />
              {/* Raised hand holding the light (stage view) */}
              {stage && <span className="mt-0.5 block h-2.5 w-[2px] rounded-full bg-[#05070a] sm:h-7 sm:w-[3px]" />}
            </div>
          );
        })}
    </div>
  );
});
