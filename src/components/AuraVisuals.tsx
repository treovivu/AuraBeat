import type { Act } from "./stageActs";

interface AuraVisualsProps {
  act: Act;
  finale: boolean;
  /** 0–1 visual energy. */
  energy: number;
  /** 0–1 the app's existing light pulse. */
  beatPulse: number;
  /** Continuous beat position from the app's existing clock (-1 when not playing). */
  beat: number;
  celebrationKey?: number;
  reducedMotion: boolean;
}

const MINT = "124,247,212";
const AMBER = "255,198,109";

/**
 * AuraBeat's signature light around the performer:
 * - Aura Lift: the glow grows through builds and the pre-hook, pulls inward on GET READY, opens on WAVE.
 * - Aura Pulse: a soft ring on each bar's downbeat in energetic sections.
 * - Aura Bloom + Aura Link: on a successful wave, the aura bursts outward and a column of light runs
 *   from the performer down through the stage and crowd toward the viewer's lightstick.
 */
export default function AuraVisuals({ act, finale, energy, beatPulse, beat, celebrationKey, reducedMotion }: AuraVisualsProps) {
  const warm = act === "prehook" || act === "ready" || act === "celebrate";
  const color = warm ? AMBER : MINT;
  const lift =
    act === "ready" ? 0.7 : act === "wave" ? 1.3 : act === "celebrate" ? 1.45 : act === "intro" ? 0.75 : 0.85 + 0.45 * energy + (finale ? 0.15 : 0);
  const glow = Math.min(1, 0.3 + 0.45 * energy + 0.3 * beatPulse + (act === "celebrate" ? 0.3 : 0));
  // One ring per bar, keyed by the bar number from the existing beat position.
  const bar = beat >= 0 ? Math.floor(beat / 4) : -1;
  const ringing = !reducedMotion && bar >= 0 && (act === "build" || act === "prehook" || act === "hook" || act === "finale" || act === "wave");
  const celebrating = act === "celebrate";

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {/* Aura Lift: the halo behind the performer */}
      <div className="absolute top-[34%] left-1/2 aspect-square h-[85%] -translate-x-1/2 -translate-y-1/2">
        <div
          className="absolute inset-0 rounded-full blur-2xl will-change-[opacity,transform]"
          style={{
            background: `radial-gradient(closest-side, rgba(${color},0.6), rgba(${color},0.14) 55%, transparent)`,
            opacity: glow,
            transform: `scale(${reducedMotion ? 1 : lift})`,
            transition: "transform 1.8s cubic-bezier(0.3, 0.7, 0.2, 1), background 1s ease",
          }}
        />
        {/* Aura Pulse */}
        {ringing && (
          <span
            key={bar}
            className="absolute inset-[18%] animate-aura-ring rounded-full border-2"
            style={{ borderColor: `rgba(${finale && bar % 2 ? AMBER : color},0.6)` }}
          />
        )}
        {/* Aura Bloom */}
        {celebrating && (
          <span
            key={`bloom-${celebrationKey}`}
            className={`absolute inset-[10%] rounded-full ${reducedMotion ? "" : "animate-aura-bloom"}`}
            style={{
              background: `radial-gradient(closest-side, rgba(${AMBER},0.55), rgba(${MINT},0.25) 60%, transparent)`,
              opacity: reducedMotion ? 0.7 : undefined,
            }}
          />
        )}
      </div>

      {/* Aura Link: performer → stage floor → crowd → the viewer */}
      {celebrating && !reducedMotion && (
        <div key={`link-${celebrationKey}`}>
          <div
            className="absolute top-[30%] bottom-0 left-1/2 w-[16%] -translate-x-1/2 origin-top animate-link-draw blur-md"
            style={{
              background: `linear-gradient(to bottom, rgba(${AMBER},0.7), rgba(${MINT},0.45) 60%, rgba(${MINT},0.8))`,
              maskImage: "linear-gradient(to right, transparent, black 30%, black 70%, transparent)",
            }}
          />
          <div
            className="absolute bottom-[12%] left-1/2 h-[6%] w-[60%] animate-floor-wave rounded-[50%] border-2 border-anticipate/80 blur-[1px]"
            style={{ animationDelay: "250ms" }}
          />
          <div
            className="absolute bottom-[2%] left-1/2 h-[5%] w-[90%] animate-floor-wave rounded-[50%] border-2 border-aura/70 blur-[1px]"
            style={{ animationDelay: "550ms" }}
          />
        </div>
      )}
    </div>
  );
}
