import type { CSSProperties } from "react";
import type { Act } from "./stageActs";

interface StageLightsProps {
  act: Act;
  /** True when the underlying section is the finale. */
  finale: boolean;
  /** 0–1 how alive the moment is (from the app's intensity and mood). */
  energy: number;
  /** 0–1 the app's existing light pulse (beat grid and accent cues). */
  beatPulse: number;
  /** 0–1 warm downbeat accent from the app's existing stage look. */
  accent: number;
  celebrating: boolean;
  reducedMotion: boolean;
}

/** Truss positions (% of width), in the order beams switch on: centre first, then outward. */
const TRUSS = [50, 36, 64, 23, 77, 10, 90];

interface Rig {
  /** Beams in use. */
  count: number;
  /** Where beams aim on the floor: 0 = all converge on the performer, 1 = straight down, >1 = fanned out. */
  fan: number;
  /** Beam width, % of the stage. */
  width: number;
  /** Slow sweep amplitude (deg); 0 = still. */
  sweep: number;
  warm: boolean;
}

const RIGS: Record<Act, Rig> = {
  intro: { count: 1, fan: 1, width: 14, sweep: 0, warm: false },
  verse: { count: 3, fan: 1, width: 13, sweep: 4, warm: false },
  build: { count: 5, fan: 1.3, width: 17, sweep: 5, warm: false },
  prehook: { count: 5, fan: 0, width: 12, sweep: 0, warm: true },
  ready: { count: 5, fan: 0, width: 10, sweep: 0, warm: true },
  hook: { count: 5, fan: 2.2, width: 20, sweep: 7, warm: false },
  wave: { count: 7, fan: 1.8, width: 20, sweep: 12, warm: false },
  celebrate: { count: 7, fan: 3, width: 24, sweep: 0, warm: true },
  finale: { count: 7, fan: 2.6, width: 24, sweep: 8, warm: false },
};

const MINT = "124,247,212";
const AMBER = "255,198,109";
const STAGE_ASPECT = 16 / 9;

/**
 * Spotlight choreography on the truss: one beam in the intro, beams opening through the verse and
 * build, converging amber on the performer before the hook, fanning out in the hook, sweeping toward
 * the audience during WAVE, and a dramatic fan-out on success. Beams move smoothly — never strobe.
 */
export default function StageLights({ act, finale, energy, beatPulse, accent, celebrating, reducedMotion }: StageLightsProps) {
  const rig = finale && (act === "hook" || act === "finale") ? RIGS.finale : RIGS[act];
  // Beams follow the section's energy (eased); the per-beat pulse lives in the backdrop, aura and floor.
  const intensity = Math.min(1, 0.3 + 0.55 * energy + (celebrating ? 0.35 : 0) + (finale ? 0.1 : 0));

  return (
    <div aria-hidden="true" className="absolute inset-0">
      {/* Truss */}
      <div className="absolute inset-x-[4%] top-[3%] h-[3px] rounded-full bg-white/10" />

      {TRUSS.map((x, order) => {
        const on = order < rig.count;
        const aimX = 50 + (x - 50) * rig.fan;
        // Rotate the beam (pivoting at the lamp) so it lands on aimX at the floor.
        const angle = (-Math.atan((((aimX - x) / 100) * STAGE_ASPECT) / 0.95) * 180) / Math.PI;
        const centre = x === 50;
        // The finale alternates gold and mint beams; elsewhere amber is kept for warm acts and accents.
        const color = rig.warm || (centre && accent > 0.3) || (finale && order % 2 === 1) ? AMBER : MINT;
        return (
          <div key={x}>
            <span
              className="absolute top-[2%] size-2 -translate-x-1/2 rounded-full bg-white transition-opacity duration-1000"
              style={{ left: `${x}%`, opacity: on ? 0.4 + 0.6 * intensity : 0.08 }}
            />
            <div
              className={`absolute top-[3%] h-[95%] origin-top -translate-x-1/2 ${order > 2 ? "hidden sm:block" : ""}`}
              style={{
                left: `${x}%`,
                width: `${rig.width}%`,
                opacity: on ? (centre ? intensity : intensity * 0.8) : 0,
                transform: `translateX(-50%) rotate(${angle}deg)`,
                transition: "transform 1.6s cubic-bezier(0.3, 0.7, 0.2, 1), opacity 1.2s ease, width 1.6s ease",
              }}
            >
              <div
                className={`absolute inset-0 origin-top ${!reducedMotion && rig.sweep ? "animate-beam-sweep" : ""}`}
                style={
                  {
                    animationDuration: `${5 + order * 0.7}s`,
                    animationDelay: `${-order * 1.3}s`,
                    clipPath: "polygon(46% 0, 54% 0, 100% 100%, 0 100%)",
                    background: `linear-gradient(to bottom, rgba(${color},0.6), rgba(${color},0.06) 80%, transparent)`,
                    scale: rig.sweep ? `${1 + rig.sweep / 200}` : undefined,
                  } as CSSProperties
                }
              />
            </div>
          </div>
        );
      })}

      {/* Stage floor */}
      <div className="absolute inset-x-0 bottom-0 h-[16%] bg-gradient-to-b from-[#0c121b] to-[#05080c]" />
      <div
        className="absolute inset-x-[6%] bottom-[16%] h-px transition-opacity duration-1000"
        style={{ background: `linear-gradient(to right, transparent, rgba(${rig.warm ? AMBER : MINT},0.9), transparent)`, opacity: 0.35 + 0.6 * energy }}
      />
      <div
        className="absolute bottom-[8%] left-1/2 h-[13%] -translate-x-1/2 rounded-[50%] blur-xl will-change-[opacity] transition-[width] duration-1000"
        style={{
          width: `${36 + 30 * energy + (finale ? 10 : 0)}%`,
          background: `rgba(${rig.warm ? AMBER : MINT},0.62)`,
          opacity: 0.26 + 0.45 * energy + 0.29 * beatPulse,
        }}
      />
    </div>
  );
}
