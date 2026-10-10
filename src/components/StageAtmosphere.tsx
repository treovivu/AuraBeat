import { memo, type CSSProperties } from "react";
import type { Act } from "./stageActs";

interface StageAtmosphereProps {
  act: Act;
  finale: boolean;
  /** 0–1 visual energy. */
  energy: number;
  /** 0–1 warm downbeat accent from the app's existing stage look. */
  accent: number;
  reducedMotion: boolean;
}

const BOKEH = Array.from({ length: 9 }, (_, i) => ({
  x: (i * 41.3 + 7) % 100,
  bottom: 18 + ((i * 29.1) % 45),
  size: 6 + ((i * 7) % 12),
  warm: i % 3 === 0,
  duration: 16 + (i % 5) * 4,
  delay: -i * 2.7,
  drift: ((i % 4) - 1.5) * 30,
}));

// Dust caught in the centre beam.
const DUST = Array.from({ length: 10 }, (_, i) => ({ x: 42 + ((i * 17.3) % 16), y: 14 + ((i * 23.9) % 60), delay: -i * 0.45 }));

/**
 * The air of the venue: drifting haze behind the singer, floating bokeh, dust glinting in the
 * centre spotlight, light leaks at the edges and a soft lens glow on strong accents.
 * It makes the stage feel physically present without covering the performer.
 */
export default memo(function StageAtmosphere({ act, finale, energy, accent, reducedMotion }: StageAtmosphereProps) {
  const warm = act === "prehook" || act === "ready" || act === "celebrate";
  const haze = 0.25 + 0.45 * energy + (finale ? 0.15 : 0);
  const motion = !reducedMotion;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Haze behind the performer */}
      {[0, 1].map((i) => (
        <div
          key={i}
          className={`absolute h-[45%] w-[70%] ${motion ? "animate-haze-drift" : ""}`}
          style={{
            left: i ? "35%" : "-5%",
            top: i ? "42%" : "30%",
            animationDelay: `${-i * 14}s`,
            background: `radial-gradient(closest-side, rgba(255,255,255,${0.07 * haze}), transparent)`,
            opacity: 1,
          }}
        />
      ))}

      {/* Dust in the centre beam */}
      {DUST.map((d, i) => (
        <span
          key={i}
          className={`absolute size-[3px] rounded-full bg-white ${i % 2 ? "hidden sm:block" : ""} ${motion ? "animate-twinkle" : ""}`}
          style={{ left: `${d.x}%`, top: `${d.y}%`, animationDelay: `${d.delay}s`, opacity: 0.25 + 0.5 * energy }}
        />
      ))}

      {/* Floating bokeh */}
      {BOKEH.map((b, i) => (
        <span
          key={i}
          className={`absolute rounded-full ${i % 2 ? "hidden sm:block" : ""} ${motion ? "animate-float-slow" : ""}`}
          style={
            {
              left: `${b.x}%`,
              bottom: `${b.bottom}%`,
              width: b.size,
              height: b.size,
              opacity: (0.08 + 0.28 * energy) * (finale ? 1.3 : 1),
              background: `radial-gradient(closest-side, ${b.warm ? "rgba(255,198,109,1)" : "rgba(124,247,212,1)"}, transparent)`,
              animationDuration: `${b.duration}s`,
              animationDelay: `${b.delay}s`,
              "--drift": `${b.drift}px`,
            } as CSSProperties
          }
        />
      ))}

      {/* Light leaks at the stage edges */}
      <div
        className="absolute -top-[20%] -left-[15%] h-[70%] w-[45%] rounded-full blur-3xl transition-[background-color] duration-1000"
        style={{ backgroundColor: warm ? "rgba(255,198,109,0.16)" : "rgba(124,247,212,0.12)", opacity: 0.4 + 0.6 * energy }}
      />
      <div
        className="absolute -right-[15%] -bottom-[25%] h-[70%] w-[45%] rounded-full blur-3xl"
        style={{ backgroundColor: "rgba(255,198,109,0.1)", opacity: 0.3 + 0.7 * energy }}
      />

      {/* Lens glow on strong existing accents */}
      <div
        className="absolute top-[18%] left-1/2 aspect-square h-[30%] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,240,210,0.55),transparent)]"
        style={{ opacity: accent * (act === "hook" || act === "finale" || finale ? 0.8 : 0.35) }}
      />
    </div>
  );
});
