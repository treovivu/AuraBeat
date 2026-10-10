import { useEffect, useRef, type CSSProperties } from "react";
import type { InteractionPhase } from "../lib/interaction";
import type { SectionMood } from "../types/performance";
import AuraVisuals from "./AuraVisuals";
import CrowdAtmosphere from "./CrowdAtmosphere";
import PerformerCharacter, { type PerformerPose } from "./PerformerCharacter";
import StageAtmosphere from "./StageAtmosphere";
import StageBackdrop from "./StageBackdrop";
import StageLights from "./StageLights";
import { actFor, isWarmAct, type Act } from "./stageActs";

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
  /** Weight shift between the feet across four beats (px). */
  shift: number;
  /** Head motion on the beat (deg). */
  nod: number;
  /** Mic-hand movement (deg). */
  mic: number;
}

// Mic arm across the chest, forearm up, so the microphone sits at the mouth.
const MIC_AT_MOUTH: [number, number] = [25, 153];

const ACTS: Record<Act, Choreography> = {
  intro: { pose: { free: [10, 8], mic: MIC_AT_MOUTH, lean: 0, head: 2, stance: 0 }, sway: 1, bounce: 0, pump: 0, wave: 0, shift: 2, nod: 1.5, mic: 1 },
  verse: { pose: { free: [22, 28], mic: MIC_AT_MOUTH, lean: 0, head: 3, stance: 6 }, sway: 2.5, bounce: 2, pump: 0, wave: 0, shift: 6, nod: 2.5, mic: 3 },
  build: { pose: { free: [55, 40], mic: MIC_AT_MOUTH, lean: -1.5, head: -2, stance: 12 }, sway: 3.5, bounce: 4, pump: 5, wave: 0, shift: 5, nod: 3, mic: 3 },
  // Looks and reaches toward the crowd, raised hand.
  prehook: { pose: { free: [108, 30], mic: MIC_AT_MOUTH, lean: -2.5, head: -6, stance: 12 }, sway: 1.5, bounce: 4, pump: 6, wave: 0, shift: 2, nod: 2, mic: 1 },
  hook: { pose: { free: [118, 42], mic: MIC_AT_MOUTH, lean: -2, head: -5, stance: 16 }, sway: 3, bounce: 9, pump: 13, wave: 0, shift: 6, nod: 4, mic: 2 },
  finale: { pose: { free: [134, 32], mic: MIC_AT_MOUTH, lean: -3, head: -7, stance: 20 }, sway: 3.5, bounce: 11, pump: 15, wave: 0, shift: 7, nod: 5, mic: 2 },
  // Signals the audience: free arm up, palm to the crowd.
  ready: { pose: { free: [152, 12], mic: MIC_AT_MOUTH, lean: -2, head: -6, stance: 14 }, sway: 1, bounce: 2, pump: 0, wave: 0, shift: 0, nod: 1, mic: 0 },
  // Leads the crowd: big overhead wave in time with the music.
  wave: { pose: { free: [138, 18], mic: MIC_AT_MOUTH, lean: -2, head: -4, stance: 18 }, sway: 3, bounce: 5, pump: 0, wave: 24, shift: 5, nod: 3, mic: 0 },
  // Hype / victory: both arms up, mic raised.
  celebrate: { pose: { free: [160, 4], mic: [-158, -6], lean: 0, head: -10, stance: 24 }, sway: 0, bounce: 6, pump: 0, wave: 0, shift: 0, nod: 0, mic: 0 },
};

/**
 * "Camera" framing per act — a 2D stage, so this is only scale and a little vertical travel:
 * slow drift in verses, a push-in through the build, focus on the performer before the hook,
 * a little wider in the final hook, and a small impact on success. Disabled under Reduce Motion.
 */
const CAMERA: Record<Act, { scale: number; rise: number; drift: boolean }> = {
  intro: { scale: 1.0, rise: 0, drift: false },
  verse: { scale: 1.025, rise: 0, drift: true },
  build: { scale: 1.05, rise: -1, drift: false },
  prehook: { scale: 1.08, rise: -2, drift: false },
  ready: { scale: 1.09, rise: -2.5, drift: false },
  hook: { scale: 1.035, rise: -0.5, drift: false },
  wave: { scale: 1.02, rise: 0, drift: false },
  celebrate: { scale: 1.04, rise: -0.5, drift: false },
  finale: { scale: 1.0, rise: 0, drift: false },
};

/** Parallax: how strongly each depth layer follows the camera. */
const DEPTH = { back: 0.35, mid: 0.7, center: 1, front: 1.6 };

/**
 * The virtual concert: an evolving LED stage, choreographed lights, haze and aura around a stylised
 * performer, with the audience in the foreground. Pure presentation — it reads the app's existing mood,
 * phase, celebration and beat, and never decides when anything happens.
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
  const act = actFor(mood, phase, celebrating);
  const finale = mood === "finale";
  const { pose, sway, bounce, pump, wave, shift, nod, mic } = ACTS[act];
  const moving = !reducedMotion && beat >= 0;
  const pulse = lit ? beatPulse : 0;
  const warm = isWarmAct(act);

  const motion = moving
    ? {
        sway: sway * Math.sin(Math.PI * beat),
        bounce: bounce * pulse,
        freeArm: pump * pulse + wave * Math.cos(Math.PI * beat),
        micArm: mic * Math.sin(Math.PI * beat),
        shift: shift * Math.sin((Math.PI * beat) / 2),
        head: nod * Math.sin(Math.PI * beat + 0.6),
      }
    : { sway: 0, bounce: 0, freeArm: 0, micArm: 0 };

  // Camera: per-act framing (smoothly eased), plus a gentle punch on strong pulses in the hooks.
  const cam = reducedMotion ? { scale: 1, rise: 0, drift: false } : CAMERA[act];
  // Punch-in once per bar on the hook's downbeat (bar number from the existing beat position).
  // A CSS animation keyed per bar — composited, so the stage is not re-rasterised every frame.
  const punchBar = moving && lit && (act === "hook" || act === "finale") ? Math.floor(beat / 4) : null;
  // Punch and impact run as compositor animations on the existing layers (no re-mounting, no per-frame
  // scaling), triggered when the bar number or the celebration changes.
  const punchRef = useRef<HTMLDivElement>(null);
  const impactRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (punchBar === null) return;
    punchRef.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.012)", offset: 0.2 }, { transform: "scale(1)" }], {
      duration: 650,
      easing: "cubic-bezier(0.2, 0.7, 0.2, 1)",
    });
  }, [punchBar]);
  useEffect(() => {
    if (!celebrating || reducedMotion) return;
    impactRef.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.03)", offset: 0.3 }, { transform: "scale(1)" }], {
      duration: 700,
      easing: "cubic-bezier(0.2, 0.7, 0.2, 1)",
    });
  }, [celebrating, celebrationKey, reducedMotion]);

  const framed = (depth: number): CSSProperties => ({
    transform: `translateY(${cam.rise * depth}%) scale(${1 + (cam.scale - 1) * depth})`,
    transition: "transform 2.6s cubic-bezier(0.3, 0.6, 0.2, 1)",
  });

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#04060a]">
      <div className={`absolute inset-0 ${cam.drift ? "animate-camera-drift" : ""}`}>
        <div ref={impactRef} className="absolute inset-0">
          {/* BACKGROUND: LED wall */}
          <div className="absolute inset-0 will-change-transform" style={framed(DEPTH.back)}>
            {lit ? (
              <StageBackdrop act={act} finale={finale} energy={energy} reducedMotion={reducedMotion} />
            ) : (
              <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,#111a27,#05070a_70%)]" />
            )}
          </div>

          {/* MID: haze, bokeh, dust, light leaks */}
          {lit && (
            <div className="absolute inset-0 will-change-transform" style={framed(DEPTH.mid)}>
              <StageAtmosphere act={act} finale={finale} energy={energy} accent={accent} reducedMotion={reducedMotion} />
            </div>
          )}

          {/* CENTRE: spotlights, aura and the performer */}
          <div className="absolute inset-0" style={framed(DEPTH.center)}>
            <div ref={punchRef} className="absolute inset-0">
              {lit && (
                <StageLights
                  act={act}
                  finale={finale}
                  energy={energy}
                  beatPulse={pulse}
                  accent={accent}
                  celebrating={celebrating}
                  reducedMotion={reducedMotion}
                />
              )}
              {lit && (
                <AuraVisuals
                  act={act}
                  finale={finale}
                  energy={energy}
                  beatPulse={pulse}
                  beat={moving ? beat : -1}
                  celebrationKey={celebrationKey}
                  reducedMotion={reducedMotion}
                />
              )}
              <div className="absolute bottom-[10%] left-1/2 h-[84%] -translate-x-1/2">
                <PerformerCharacter
                  pose={pose}
                  motion={motion}
                  rim={warm ? "anticipate" : "aura"}
                  glow={lit ? Math.min(1, 0.35 + 0.45 * energy + 0.3 * pulse + (celebrating ? 0.3 : 0) + (finale ? 0.15 : 0)) : 0.2}
                  animatePose={!reducedMotion}
                />
              </div>
            </div>
          </div>

          {/* FOREGROUND: the audience (moves most, for depth) */}
          <div className="absolute inset-0 will-change-transform" style={framed(DEPTH.front)}>
            <CrowdAtmosphere
              variant="stage"
              mood={mood}
              phase={phase}
              celebrating={celebrating}
              celebrationKey={celebrationKey}
              energy={Math.min(1, energy + (finale ? 0.1 : 0))}
              beat={moving ? beat : -1}
              lit={lit}
              reducedMotion={reducedMotion}
            />
            {/* Aura Link, continued: the light runs on through the audience toward the viewer */}
            {celebrating && lit && !reducedMotion && (
              <div
                key={`link-${celebrationKey}`}
                aria-hidden="true"
                className="absolute top-[72%] bottom-0 left-1/2 w-[10%] -translate-x-1/2 origin-top animate-link-draw blur-sm"
                style={{
                  animationDelay: "250ms",
                  background: "linear-gradient(to bottom, rgba(124,247,212,0.7), rgba(255,198,109,0.9))",
                  maskImage: "linear-gradient(to right, transparent, black 35%, black 65%, transparent)",
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
