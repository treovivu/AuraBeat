import type { LiveCueKind } from "../../live/liveBridge";

interface LiveCueDisplayProps {
  /** The latest non-beat cue, keyed so a repeat cue replays. */
  cue: { kind: LiveCueKind; id: number } | null;
  /** Count of beats/bass hits received; drives the small beat light. */
  beats: number;
  /** "card" on the controls screen, "stage" over the full-screen lightstick. */
  variant: "card" | "stage";
  reducedMotion: boolean;
}

const LABEL: Record<LiveCueKind, { word: string; hint: string }> = {
  beat: { word: "BEAT", hint: "" },
  bass: { word: "BASS", hint: "Heavy low end" },
  build: { word: "BUILD", hint: "Energy rising" },
  chorus: { word: "CHORUS", hint: "The hook is here" },
  drop: { word: "DROP", hint: "Big moment" },
};

/**
 * Short music cues for people who can't rely on hearing the music. Words, not colour alone,
 * and only what the live analysis reports — never invented captions.
 */
export default function LiveCueDisplay({ cue, beats, variant, reducedMotion }: LiveCueDisplayProps) {
  const label = cue ? LABEL[cue.kind] : null;
  const stage = variant === "stage";

  return (
    <div className={stage ? "text-center" : "rounded-3xl border border-white/10 bg-surface p-5"}>
      {!stage && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-muted">Music cues</p>
          {/* Beat light: flashes on each beat that arrives */}
          <span aria-hidden="true" className="relative size-3">
            <span className="absolute inset-0 rounded-full bg-white/15" />
            {beats > 0 && !reducedMotion && (
              <span key={beats} className="absolute inset-0 animate-live-flash rounded-full bg-aura" style={{ ["--peak" as string]: 1 }} />
            )}
          </span>
        </div>
      )}
      <p aria-live="polite" className={stage ? "" : "mt-3 min-h-16"}>
        {label ? (
          <span key={cue?.id} className={`block ${reducedMotion ? "" : "animate-live-cue"}`}>
            <span
              className={`block font-display font-bold tracking-[0.12em] ${
                stage ? "text-[clamp(3rem,16vw,7rem)] text-ink [text-shadow:0_0_40px_rgba(0,0,0,0.45)]" : "text-4xl text-ink"
              }`}
            >
              {label.word}
            </span>
            <span className={`block ${stage ? "mt-1 text-lg text-ink/80" : "mt-1 text-sm text-ink-muted"}`}>{label.hint}</span>
          </span>
        ) : (
          !stage && <span className="text-sm text-ink-muted">Cues appear here when the live audio reports them.</span>
        )}
      </p>
    </div>
  );
}
