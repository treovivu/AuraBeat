import { memo, type CSSProperties } from "react";
import type { InteractionPhase } from "../lib/interaction";
import InteractionPrompt from "./InteractionPrompt";

interface CinematicInteractionProps {
  /** The app's interaction phase (never decided here). */
  phase: InteractionPhase;
  celebrating: boolean;
  /** Changes on each celebration so the burst replays. */
  celebrationKey?: number;
  /** Light toggle: when off, the backdrop light is skipped and only the text remains. */
  lit: boolean;
  reducedMotion: boolean;
  /**
   * "overlay": staged in the lower-centre of the performance video (tablet, desktop, TV).
   * "inline": a block directly under the video (phones, where the video is too small to overlay).
   */
  variant: "overlay" | "inline";
}

const PARTICLES = Array.from({ length: 16 }, (_, i) => {
  const angle = (i / 16) * Math.PI * 2 + (i % 2 ? 0.2 : 0);
  const distance = 110 + (i % 3) * 50;
  return { dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance * 0.5, warm: i % 3 !== 0, delay: (i % 4) * 40 };
});

/** Three gently flowing sine lines beside the prompt while the audience is invited to wave. */
function WaveLines({ side }: { side: "left" | "right" }) {
  const path = Array.from({ length: 9 }, (_, i) => `${i === 0 ? "M" : "Q"}${i * 40 - 20},${i % 2 ? 4 : 20} ${i * 40},12`).join(" ");
  return (
    <div
      aria-hidden="true"
      className={`absolute top-1/2 hidden h-8 w-[min(9rem,14vw)] -translate-y-1/2 overflow-hidden sm:block ${
        side === "left" ? "right-full mr-6 -scale-x-100" : "left-full ml-6"
      }`}
    >
      <svg className="h-full w-[200%] animate-wave-flow will-change-transform" viewBox="0 0 320 24" preserveAspectRatio="none">
        {[0, 1, 2].map((row) => (
          <path key={row} d={path} fill="none" stroke="var(--color-aura)" strokeWidth={1.2} opacity={0.6 - row * 0.15} transform={`translate(0 ${row * 3 - 3})`} />
        ))}
      </svg>
    </div>
  );
}

/**
 * Stages the interaction moment: anticipation glow for GET READY, flowing aura for WAVE, and a
 * gold/mint burst for the celebration. Reads the app's phase and celebration state only.
 * Memoised: it re-renders when the phase or celebration changes, not on every clock frame.
 */
export default memo(function CinematicInteraction({
  phase,
  celebrating,
  celebrationKey,
  lit,
  reducedMotion,
  variant,
}: CinematicInteractionProps) {
  const state = celebrating ? "celebrate" : phase;
  const active = state !== "idle";
  const motion = lit && !reducedMotion;
  const overlay = variant === "overlay";

  const lights = lit && (
    <div aria-hidden="true" className={`pointer-events-none absolute -z-10 ${overlay ? "-inset-x-[15%] -inset-y-8" : "-inset-x-6 -inset-y-10"}`}>
      {/* GET READY: warm anticipation light */}
      <div
        className="absolute inset-0 bg-[radial-gradient(closest-side,rgba(255,198,109,0.32),transparent)] transition-opacity duration-700"
        style={{ opacity: state === "get-ready" ? 1 : 0 }}
      />
      {/* WAVE: richer aura light */}
      <div
        className="absolute inset-0 bg-[radial-gradient(closest-side,rgba(124,247,212,0.32),transparent)] transition-opacity duration-700"
        style={{ opacity: state === "wave" ? 1 : 0 }}
      />
      {/* CELEBRATE: gold and mint burst */}
      <div
        className="absolute inset-0 bg-[radial-gradient(closest-side,rgba(255,198,109,0.5),rgba(124,247,212,0.2)_55%,transparent)] transition-opacity duration-500"
        style={{ opacity: state === "celebrate" ? 1 : 0 }}
      />
      {state === "celebrate" && motion && (
        <div key={celebrationKey} className="absolute inset-0">
          <div className="absolute inset-0 animate-glow-in bg-[radial-gradient(closest-side,rgba(255,255,255,0.2),transparent_60%)]" />
          {PARTICLES.map((pt, i) => (
            <span
              key={i}
              className={`absolute top-1/2 left-1/2 size-1.5 animate-particle rounded-full ${pt.warm ? "bg-anticipate" : "bg-aura"} shadow-[0_0_8px_2px] ${pt.warm ? "shadow-anticipate/70" : "shadow-aura/70"}`}
              style={{ "--dx": `${pt.dx}px`, "--dy": `${pt.dy}px`, animationDelay: `${pt.delay}ms` } as CSSProperties}
            />
          ))}
        </div>
      )}
    </div>
  );

  const prompt = (
    <div className="relative isolate">
      {lights}
      {state === "wave" && motion && (
        <>
          <WaveLines side="left" />
          <WaveLines side="right" />
        </>
      )}
      <InteractionPrompt phase={phase} celebrating={celebrating} size={overlay ? "stage" : "compact"} />
    </div>
  );

  if (overlay) {
    return (
      // Own compositing layer: the cue is drawn once and blended over the video, instead of being
      // repainted every frame along with the beat-lit frame edges.
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center px-[6%] pb-[6%] text-center will-change-transform">
        {/* Scrim so the cue reads over any footage; only while a cue is showing */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/80 via-black/40 to-transparent transition-opacity duration-700"
          style={{ opacity: active ? 1 : 0 }}
        />
        {prompt}
      </div>
    );
  }

  return <div className="flex min-h-24 items-center justify-center py-3 text-center">{prompt}</div>;
});
