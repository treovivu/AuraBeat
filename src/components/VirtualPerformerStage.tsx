import type { InteractionPhase } from "../lib/interaction";
import type { SectionMood } from "../types/performance";
import CrowdAtmosphere from "./CrowdAtmosphere";
import PerformerCharacter, { type PerformerPose } from "./PerformerCharacter";
import StageLights from "./StageLights";

interface VirtualPerformerStageProps {
  mood: SectionMood;
  /** 0–1 visual energy (the app's section intensity and mood). */
  energy: number;
  /** 0–1 the app's existing light pulse (beat grid + accent cues). */
  beatPulse: number;
  /** 0–1 warm downbeat accent from the app's existing stage look. */
  accent: number;
  /** Continuous beat position from the app's existing clock, or -1 when not playing. */
  beat: number;
  /** The app's interaction phase as shown to the audience. */
  phase: InteractionPhase;
  celebrating: boolean;
  celebrationKey?: number;
  /** Light toggle. */
  lit: boolean;
  reducedMotion: boolean;
}

type Act = "intro" | "verse" | "build" | "prehook" | "hook" | "finale" | "ready" | "wave" | "celebrate";

interface Choreography {
  pose: PerformerPose;
  /** Body sway (deg) across two beats. */
  sway: number;
  /** Bounce (px) on each light pulse. */
  bounce: number;
  /** Free-arm pump on each pulse (deg). */
  pump: number;
  /** Free-arm wave across two beats (deg). */
  wave: number;
}

// Mic arm across the chest, forearm up, so the microphone sits at the mouth.
const MIC_AT_MOUTH: [number, number] = [25, 153];

const ACTS: Record<Act, Choreography> = {
  intro: { pose: { free: [10, 8], mic: MIC_AT_MOUTH, lean: 0, head: 2, stance: 0 }, sway: 1, bounce: 0, pump: 0, wave: 0 },
  verse: { pose: { free: [22, 28], mic: MIC_AT_MOUTH, lean: 0, head: 3, stance: 6 }, sway: 2.5, bounce: 2, pump: 0, wave: 0 },
  build: { pose: { free: [55, 40], mic: MIC_AT_MOUTH, lean: -1.5, head: -2, stance: 10 }, sway: 2, bounce: 4, pump: 4, wave: 0 },
  prehook: { pose: { free: [100, 30], mic: MIC_AT_MOUTH, lean: -2, head: -4, stance: 12 }, sway: 1.5, bounce: 4, pump: 6, wave: 0 },
  hook: { pose: { free: [118, 42], mic: MIC_AT_MOUTH, lean: -2, head: -5, stance: 16 }, sway: 2.5, bounce: 8, pump: 12, wave: 0 },
  finale: { pose: { free: [132, 34], mic: MIC_AT_MOUTH, lean: -3, head: -6, stance: 20 }, sway: 3, bounce: 10, pump: 14, wave: 0 },
  // Signals the audience: free arm up, palm to the crowd.
  ready: { pose: { free: [152, 12], mic: MIC_AT_MOUTH, lean: -2, head: -6, stance: 14 }, sway: 1, bounce: 2, pump: 0, wave: 0 },
  // Invites the crowd to wave: big overhead wave in time with the music.
  wave: { pose: { free: [138, 18], mic: MIC_AT_MOUTH, lean: -2, head: -4, stance: 18 }, sway: 3, bounce: 5, pump: 0, wave: 22 },
  // Hype / victory: both arms up, mic raised.
  celebrate: { pose: { free: [160, 4], mic: [-158, -6], lean: 0, head: -10, stance: 24 }, sway: 0, bounce: 6, pump: 0, wave: 0 },
};

const ACT_BY_MOOD: Record<SectionMood, Act> = {
  restrained: "intro",
  cool: "verse",
  rising: "build",
  anticipation: "prehook",
  peak: "hook",
  finale: "finale",
};

/**
 * The virtual concert: a stylised performer on a lit stage with the audience in the foreground.
 * Everything here is presentation — it reads the app's existing mood, phase, celebration and beat,
 * and never decides when anything happens.
 */
export default function VirtualPerformerStage({
  mood,
  energy,
  beatPulse,
  accent,
  beat,
  phase,
  celebrating,
  celebrationKey,
  lit,
  reducedMotion,
}: VirtualPerformerStageProps) {
  const act: Act = celebrating ? "celebrate" : phase === "wave" ? "wave" : phase === "get-ready" ? "ready" : ACT_BY_MOOD[mood];
  const { pose, sway, bounce, pump, wave } = ACTS[act];
  const moving = !reducedMotion && beat >= 0;
  const pulse = lit ? beatPulse : 0;

  const motion = moving
    ? {
        sway: sway * Math.sin(Math.PI * beat),
        bounce: bounce * pulse,
        freeArm: pump * pulse + wave * Math.cos(Math.PI * beat),
        micArm: act === "verse" ? 2 * Math.sin(Math.PI * beat) : 0,
      }
    : { sway: 0, bounce: 0, freeArm: 0, micArm: 0 };

  const warm = celebrating || act === "ready" || act === "prehook";

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#05070a]">
      {lit ? (
        <StageLights
          tone={warm ? "amber" : "aura"}
          energy={energy}
          beatPulse={pulse}
          accent={accent}
          celebrating={celebrating}
          celebrationKey={celebrationKey}
          reducedMotion={reducedMotion}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,#111a27,#05070a_70%)]" />
      )}

      {/* The performer, standing on the stage line */}
      <div className="absolute bottom-[10%] left-1/2 h-[84%] -translate-x-1/2">
        <PerformerCharacter
          pose={pose}
          motion={motion}
          rim={warm ? "anticipate" : "aura"}
          glow={lit ? Math.min(1, 0.35 + 0.45 * energy + 0.3 * pulse + (celebrating ? 0.3 : 0)) : 0.2}
          animatePose={!reducedMotion}
        />
      </div>

      {/* Audience in the foreground */}
      <CrowdAtmosphere
        variant="stage"
        mood={mood}
        phase={phase}
        celebrating={celebrating}
        celebrationKey={celebrationKey}
        energy={energy}
        beat={moving ? beat : -1}
        lit={lit}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}
