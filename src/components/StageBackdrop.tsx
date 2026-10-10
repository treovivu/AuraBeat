import { memo, type CSSProperties } from "react";
import type { Act } from "./stageActs";

interface StageBackdropProps {
  act: Act;
  /** True when the underlying section is the finale (stays true through its interaction moments). */
  finale: boolean;
  /** 0–1 visual energy. */
  energy: number;
  reducedMotion: boolean;
}

/**
 * How much of each visual language the LED wall shows per act. The wall cross-fades between them,
 * so the stage visibly evolves through the song instead of looping one pattern.
 */
type Layer = "rings" | "flow" | "bars" | "converge" | "burst" | "strips" | "aurora" | "stars";
const MIX: Record<Act, Record<Layer, number>> = {
  intro: { rings: 0.8, flow: 0.1, bars: 0, converge: 0, burst: 0, strips: 0, aurora: 0, stars: 0.15 },
  verse: { rings: 0.2, flow: 0.9, bars: 0.1, converge: 0, burst: 0, strips: 0, aurora: 0, stars: 0.35 },
  build: { rings: 0.15, flow: 0.3, bars: 0.9, converge: 0, burst: 0.1, strips: 0.15, aurora: 0, stars: 0.35 },
  prehook: { rings: 0, flow: 0, bars: 0.45, converge: 1, burst: 0, strips: 0.15, aurora: 0, stars: 0.2 },
  ready: { rings: 0, flow: 0, bars: 0.25, converge: 1, burst: 0, strips: 0, aurora: 0, stars: 0.15 },
  hook: { rings: 0.1, flow: 0.15, bars: 0.6, converge: 0, burst: 0.9, strips: 0.85, aurora: 0.1, stars: 0.45 },
  wave: { rings: 0.1, flow: 0.4, bars: 0.55, converge: 0, burst: 0.7, strips: 1, aurora: 0.2, stars: 0.5 },
  celebrate: { rings: 0.3, flow: 0.2, bars: 0.7, converge: 0, burst: 1, strips: 1, aurora: 0.4, stars: 0.7 },
  finale: { rings: 0.15, flow: 0.3, bars: 0.4, converge: 0, burst: 1, strips: 0.8, aurora: 1, stars: 1 },
};

const BARS = Array.from({ length: 13 }, (_, i) => 0.3 + 0.7 * Math.abs(Math.sin(i * 1.3 + 0.4)));
const STARS = Array.from({ length: 18 }, (_, i) => ({
  x: (i * 37.3) % 100,
  y: (i * 23.7) % 58,
  delay: -(i % 7) * 0.6,
  size: i % 4 === 0 ? 3 : 2,
}));

const MINT = "124,247,212";
const AMBER = "255,198,109";

/**
 * The LED wall behind the performer. Abstract and section-aware: dark rings in the intro, flowing
 * waves in verses, rising bars in builds, a contracting heartbeat in the pre-hook, radial bursts and
 * light strips in hooks, and aurora + stars in the final hook. Not an equaliser — it never pretends to
 * analyse the audio; it reads the app's existing act and energy.
 */
export default memo(function StageBackdrop({ act, finale, energy, reducedMotion }: StageBackdropProps) {
  // The final hook keeps its dream layers (aurora, stars, radial geometry) even through its interaction moments.
  const base = MIX[act];
  const mix = finale
    ? { ...base, aurora: Math.max(base.aurora, 1), stars: Math.max(base.stars, 1), burst: Math.max(base.burst, 0.6), bars: Math.min(base.bars, 0.4) }
    : base;
  const warm = act === "prehook" || act === "ready";
  const tone = warm ? AMBER : MINT;
  const anim = (name: string) => (reducedMotion ? "" : name);
  const layer = (key: Layer, extra = 1): CSSProperties => ({ opacity: Math.min(1, mix[key] * extra), transition: "opacity 1.4s ease" });
  const level = 0.55 + 0.45 * energy;

  return (
    <div aria-hidden="true" className="absolute -inset-[4%] overflow-hidden">
      {/* Depth: deep navy fading to black at the edges */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,#14233a_0%,#0a0f18_48%,#04060a_100%)]" />

      {/* Stars (dream layer, strongest in the final hook) */}
      <div className="absolute inset-0" style={layer("stars")}>
        {STARS.map((s, i) => (
          <span
            key={i}
            className={`absolute rounded-full bg-white ${i % 3 === 2 ? "hidden sm:block" : ""} ${anim("animate-twinkle")}`}
            style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, animationDelay: `${s.delay}s`, opacity: 0.7 }}
          />
        ))}
      </div>

      {/* Aurora ribbons (final hook) */}
      <div className="absolute inset-x-0 top-[6%] h-[45%]" style={layer("aurora")}>
        <div
          className={`absolute inset-x-[-10%] top-[10%] h-[45%] ${anim("animate-aurora")}`}
          style={{
            background: `linear-gradient(90deg, transparent, rgba(${MINT},0.55), rgba(${AMBER},0.45), rgba(${MINT},0.5), transparent)`,
            maskImage: "radial-gradient(closest-side, black, transparent)",
          }}
        />
        <div
          className={`absolute inset-x-[-10%] top-[35%] h-[35%] ${anim("animate-aurora")}`}
          style={{
            background: `linear-gradient(90deg, transparent, rgba(255,122,133,0.3), rgba(${MINT},0.42), transparent)`,
            maskImage: "radial-gradient(closest-side, black, transparent)",
            animationDelay: "-7s",
          }}
        />
      </div>

      {/* Intro: slow expanding rings */}
      <div className="absolute inset-0 flex items-center justify-center" style={layer("rings")}>
        {[0, 2, 4].map((d) => (
          <span
            key={d}
            className={`absolute aspect-square h-[80%] rounded-full border border-aura/40 ${anim("animate-ring-out")}`}
            style={{ animationDelay: `${-d}s`, opacity: reducedMotion ? 0.25 : undefined, transform: reducedMotion ? `scale(${0.5 + d * 0.15})` : undefined }}
          />
        ))}
      </div>

      {/* Verse: flowing gradient waves */}
      <div className="absolute inset-x-0 top-[12%] h-[50%]" style={layer("flow", level)}>
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            className={`absolute h-[30%] w-[200%] blur-xl ${anim("animate-flow-x")}`}
            style={{
              top: `${row * 30}%`,
              animationDuration: `${26 + row * 8}s`,
              animationDirection: row % 2 ? "reverse" : "normal",
              background: `repeating-linear-gradient(90deg, rgba(${MINT},0) 0%, rgba(${MINT},${0.22 - row * 0.05}) 12%, rgba(${MINT},0) 25%)`,
            }}
          />
        ))}
      </div>

      {/* Build / hook: rising light bars */}
      <div className="absolute inset-x-[6%] top-[8%] flex h-[55%] items-end gap-[1%]" style={layer("bars", level)}>
        {BARS.map((shape, i) => (
          <div
            key={i}
            className={`relative flex-1 overflow-hidden rounded-t-sm ${i % 2 ? "hidden sm:block" : ""}`}
            style={{
              height: `${(0.3 + 0.6 * energy) * shape * 100}%`,
              transition: "height 1.6s ease",
              backgroundImage: `linear-gradient(to top, rgba(${tone},0.5), rgba(${tone},0))`,
            }}
          >
            {/* Rising scan stripes, moved by transform so the GPU handles it */}
            <div
              className={`absolute inset-x-0 top-0 -bottom-4 ${anim("animate-rise-stripes")}`}
              style={{
                backgroundImage: "repeating-linear-gradient(to bottom, rgba(5,7,10,0.6) 0 3px, transparent 3px 8px)",
                animationDelay: `${-i * 0.07}s`,
              }}
            />
          </div>
        ))}
      </div>

      {/* Pre-hook / get ready: amber heartbeat contracting toward the performer */}
      <div className="absolute inset-0 flex items-center justify-center" style={layer("converge")}>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,transparent_20%,rgba(4,6,10,0.75)_70%)]" />
        {[0, 1.07, 2.13].map((d) => (
          <span
            key={d}
            className={`absolute aspect-square h-[90%] rounded-full border-2 border-anticipate/50 ${anim("animate-ring-in")}`}
            style={{ animationDelay: `${-d}s`, opacity: reducedMotion ? 0.3 : undefined, transform: reducedMotion ? `scale(${0.55 + d * 0.15})` : undefined }}
          />
        ))}
      </div>

      {/* Hook: large rotating radial geometry */}
      <div className="absolute inset-0 flex items-center justify-center" style={layer("burst", level)}>
        <svg viewBox="-100 -100 200 200" className={`absolute aspect-square h-[150%] ${anim("animate-rotate-slow")}`}>
          {Array.from({ length: 16 }, (_, i) => (
            <polygon
              key={i}
              points="0,0 -6,-100 6,-100"
              transform={`rotate(${i * 22.5})`}
              fill={i % 2 ? `rgba(${AMBER},0.10)` : `rgba(${MINT},0.13)`}
            />
          ))}
        </svg>
        <div className="absolute aspect-square h-[55%] rounded-full border border-aura/30" />
        <div className="absolute aspect-square h-[75%] rounded-full border border-anticipate/20" />
      </div>

      {/* Hook / wave: moving diagonal light strips */}
      <div className="absolute inset-0" style={layer("strips", level)}>
        {[18, 42, 66].map((x, i) => (
          <div
            key={x}
            className={`absolute top-[-10%] h-[80%] w-[7%] ${i === 1 ? "" : "hidden sm:block"} ${anim("animate-strip-move")}`}
            style={{
              left: `${x}%`,
              animationDelay: `${-i * 2.3}s`,
              background: `linear-gradient(to bottom, transparent, rgba(${i === 1 ? AMBER : MINT},0.28), transparent)`,
              maskImage: "linear-gradient(to right, transparent, black 35%, black 65%, transparent)",
              transform: "skewX(-18deg)",
            }}
          />
        ))}
      </div>

      {/* LED scanlines over the whole wall */}
      <div className="absolute inset-0 bg-[repeating-linear-gradient(to_bottom,rgba(4,6,10,0.35)_0,rgba(4,6,10,0.35)_1px,transparent_1px,transparent_4px)]" />
    </div>
  );
});
