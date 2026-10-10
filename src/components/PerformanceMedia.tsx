import type { ReactNode, Ref } from "react";
import type { PerformanceMediaSource } from "../types/performance";
import type { StageTone } from "../lib/stage";

interface PerformanceMediaProps {
  /** The performance video. Without one, `placeholder` is shown. */
  media?: PerformanceMediaSource;
  mediaRef?: Ref<HTMLVideoElement>;
  muted?: boolean;
  onMediaError?: () => void;
  /** Shown when no media is configured (e.g. the development mock performance). */
  placeholder?: ReactNode;
  /**
   * A presentation drawn over the performance (e.g. the virtual stage). The media element stays
   * mounted and playing underneath, so it remains the sound and the clock.
   */
  scene?: ReactNode;
  /** Overlaid on top of the performance (title, badges). */
  overlay?: ReactNode;
  /** 0–1 stage-light level around the performance; follows the beat. */
  light: number;
  /** Colour of the stage light. */
  tone?: StageTone;
  /** 0–1 warm downbeat accent. */
  accent?: number;
  /** Anticipation before an interaction: the frame edges dim into a soft vignette. Presentation only. */
  anticipation?: boolean;
  /** True for a moment after the audience moves with the music. */
  activated: boolean;
  /** Changes on each activation so the burst replays. */
  burstKey?: number;
}

/**
 * The visual centre of the concert: the performance itself, framed by stage light.
 * Beat lighting lives only at the edges of the frame so the performance stays fully readable.
 */
export default function PerformanceMedia({
  media,
  mediaRef,
  muted,
  onMediaError,
  placeholder,
  scene,
  overlay,
  light,
  tone = "aura",
  accent = 0,
  anticipation = false,
  activated,
  burstKey,
}: PerformanceMediaProps) {
  const warmBase = tone === "amber" ? light : 0;
  // Edge light inside the frame: aura for ordinary beats, amber for anticipation and downbeat accents.
  const edgeCool = 0.06 + 0.5 * (light - warmBase);
  const edgeWarm = Math.min(0.6, 0.5 * warmBase + 0.45 * accent);

  return (
    <div className="relative isolate mx-auto w-full" style={{ maxWidth: "calc(62dvh * 16 / 9)" }}>
      {/* Stage light spilling around the frame — decorative */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -inset-6 -z-10 rounded-[3rem] blur-3xl transition-[background-color] duration-500 sm:-inset-10 ${
          activated ? "bg-anticipate/60" : tone === "amber" ? "bg-anticipate/40" : "bg-aura/40"
        }`}
        style={{ opacity: activated ? 1 : 0.1 + 0.75 * light }}
      />
      {!activated && accent > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-4 -z-10 rounded-[3rem] bg-anticipate/40 blur-3xl sm:-inset-8"
          style={{ opacity: 0.6 * accent }}
        />
      )}

      <div
        className={`relative aspect-video max-h-[62dvh] w-full overflow-hidden rounded-3xl border bg-black transition-[border-color,box-shadow] duration-500 ${
          activated ? "border-anticipate/70 shadow-[0_0_80px_-10px] shadow-anticipate/60" : "border-white/10"
        }`}
      >
        {media ? (
          <video
            ref={mediaRef}
            src={media.src}
            poster={media.poster}
            muted={muted}
            playsInline
            preload="metadata"
            onError={onMediaError}
            className="absolute inset-0 size-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 bg-surface">{placeholder}</div>
        )}
        {scene}

        {/* Anticipation vignette — edges only, the performer stays clear */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-3xl shadow-[inset_0_0_140px_30px_rgba(0,0,0,0.55)] transition-opacity duration-700"
          style={{ opacity: anticipation && !activated ? 1 : 0 }}
        />

        {/* Beat lighting: light washing in from the frame edges, plus a thin light rig along the top */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-3xl shadow-[inset_0_0_72px_6px_var(--color-aura)] will-change-[opacity]"
          style={{ opacity: edgeCool }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-3xl shadow-[inset_0_0_72px_6px_var(--color-anticipate)] will-change-[opacity]"
          style={{ opacity: edgeWarm }}
        />
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-[8%] top-0 h-0.5 bg-gradient-to-r from-transparent to-transparent ${
            activated || tone === "amber" ? "via-anticipate" : "via-aura"
          }`}
          style={{ opacity: activated ? 1 : 0.15 + 0.85 * light }}
        />

        {/* Activation: gold edge light, a brief wash of light and a burst ring from the centre */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 rounded-3xl shadow-[inset_0_0_96px_10px_var(--color-anticipate)] transition-opacity duration-500 ${
            activated ? "opacity-95" : "opacity-0"
          }`}
        />
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 bg-gradient-to-t from-anticipate/35 via-aura/10 to-transparent transition-opacity duration-700 ${
            activated ? "opacity-100" : "opacity-0"
          }`}
        />
        {activated && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span key={burstKey} className="aspect-square h-3/4 animate-burst rounded-full border-4 border-anticipate/80" />
          </div>
        )}

        {overlay}
      </div>
    </div>
  );
}
