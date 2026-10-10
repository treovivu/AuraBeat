import type { CSSProperties } from "react";

interface StageLightsProps {
  tone: "aura" | "amber";
  /** 0–1 how alive the moment is (from the app's intensity and mood). */
  energy: number;
  /** 0–1 the app's existing light pulse (beat grid and accent cues). */
  beatPulse: number;
  /** 0–1 warm downbeat accent from the app's existing stage look. */
  accent: number;
  celebrating: boolean;
  celebrationKey?: number;
  reducedMotion: boolean;
}

// Static shape of the LED wall bars, so the wall reads as a designed screen rather than noise.
const BARS = Array.from({ length: 14 }, (_, i) => 0.35 + 0.65 * Math.abs(Math.sin(i * 1.7 + 0.6)));

const SPOTS = [
  { x: 18, from: -14, to: 10, delay: 0, mobile: false },
  { x: 50, from: -6, to: 6, delay: -2.5, mobile: true },
  { x: 82, from: -10, to: 14, delay: -5, mobile: true },
];

/** The stage behind the performer: LED wall, truss spotlights, backlight halo, haze and floor glow. */
export default function StageLights({ tone, energy, beatPulse, accent, celebrating, celebrationKey, reducedMotion }: StageLightsProps) {
  const warm = celebrating || tone === "amber";
  const color = warm ? "255,198,109" : "124,247,212";
  const motion = !reducedMotion;
  const spot = Math.min(1, 0.18 + 0.5 * energy + 0.3 * beatPulse + (celebrating ? 0.4 : 0));

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_50%_35%,#132033_0%,#090d14_55%,#05070a_100%)]">
      {/* LED wall */}
      <div className="absolute inset-x-[6%] top-[8%] flex h-[52%] items-end gap-[0.8%] opacity-70">
        {BARS.map((shape, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-sm"
            style={{
              height: `${Math.min(100, (0.25 + 0.55 * energy) * shape * 100 + (motion ? beatPulse * shape * 22 : 0))}%`,
              background: `linear-gradient(to top, rgba(${color},${0.22 + 0.3 * energy}), rgba(${color},0))`,
            }}
          />
        ))}
      </div>
      {/* Scanlines so the wall reads as a screen */}
      <div className="absolute inset-x-[6%] top-[8%] h-[52%] bg-[repeating-linear-gradient(to_bottom,rgba(5,7,10,0.55)_0,rgba(5,7,10,0.55)_2px,transparent_2px,transparent_6px)]" />
      <div className="absolute inset-x-[6%] top-[60%] h-px bg-white/10" />

      {/* Truss with lamps */}
      <div className="absolute inset-x-[4%] top-[3%] h-[3px] rounded-full bg-white/10" />
      {SPOTS.map((s) => (
        <span key={`lamp-${s.x}`} className="absolute top-[2%] size-2 -translate-x-1/2 rounded-full bg-white/70" style={{ left: `${s.x}%`, opacity: spot }} />
      ))}

      {/* Spotlights from the truss */}
      {SPOTS.map((s) => (
        <div
          key={`spot-${s.x}`}
          className={`absolute top-[3%] h-[95%] w-[26%] origin-top -translate-x-1/2 ${s.mobile ? "" : "hidden sm:block"} ${motion ? "animate-spot-sweep" : ""}`}
          style={
            {
              left: `${s.x}%`,
              "--from": `${s.from}deg`,
              "--to": `${s.to}deg`,
              animationDelay: `${s.delay}s`,
              opacity: s.x === 50 ? Math.min(1, spot + 0.2 * accent) : spot * 0.75,
              clipPath: "polygon(46% 0, 54% 0, 100% 100%, 0 100%)",
              background: `linear-gradient(to bottom, rgba(${s.x === 50 && warm ? "255,198,109" : color},0.55), rgba(${color},0.04) 85%, transparent)`,
              filter: "blur(2px)",
            } as CSSProperties
          }
        />
      ))}

      {/* Backlight halo behind the performer */}
      <div
        className="absolute top-[12%] left-1/2 aspect-square h-[78%] -translate-x-1/2 rounded-full blur-2xl"
        style={{
          background: `radial-gradient(closest-side, rgba(${color},0.55), rgba(${color},0.12) 60%, transparent)`,
          opacity: Math.min(1, 0.25 + 0.5 * energy + 0.35 * beatPulse + (celebrating ? 0.3 : 0)),
        }}
      />
      {/* Downbeat accent: a brief warm wash */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(255,198,109,0.22),transparent_60%)]" style={{ opacity: accent }} />

      {/* Celebration: rays opening outward from behind the performer */}
      {celebrating && motion && (
        <div key={celebrationKey} className="absolute inset-0">
          {[-50, -25, 0, 25, 50].map((a) => (
            <div
              key={a}
              className="absolute bottom-[14%] left-1/2 h-[95%] w-[10%] origin-bottom animate-beam-open bg-gradient-to-t from-anticipate/60 to-transparent blur-md"
              style={{ "--from": `${a * 0.3}deg`, "--to": `${a}deg`, marginLeft: "-5%" } as CSSProperties}
            />
          ))}
        </div>
      )}

      {/* Haze */}
      <div className="absolute inset-x-0 bottom-[10%] h-[35%] bg-gradient-to-t from-white/[0.05] to-transparent blur-xl" />

      {/* Stage floor */}
      <div className="absolute inset-x-0 bottom-0 h-[16%] bg-gradient-to-b from-[#0c121b] to-[#06090d]" />
      <div className="absolute inset-x-[8%] bottom-[16%] h-px" style={{ background: `linear-gradient(to right, transparent, rgba(${color},${0.4 + 0.5 * energy}), transparent)` }} />
      <div
        className="absolute bottom-[9%] left-1/2 h-[12%] w-[46%] -translate-x-1/2 rounded-[50%] blur-xl"
        style={{ background: `rgba(${color},${0.18 + 0.3 * energy + 0.2 * beatPulse})` }}
      />
    </div>
  );
}
