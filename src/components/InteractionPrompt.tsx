import type { InteractionPhase } from "../lib/interaction";

interface InteractionPromptProps {
  phase: InteractionPhase;
  celebrating: boolean;
  /** "stage": large type sized to the viewport for TV / desktop overlays. "compact": phones. */
  size?: "stage" | "compact";
}

const TITLE: Record<"ready" | "wave" | "celebrate", { stage: string; compact: string; tone: string }> = {
  ready: {
    stage: "text-[clamp(2.5rem,6vw,6rem)] tracking-[0.14em] uppercase",
    compact: "text-4xl tracking-[0.12em] uppercase",
    tone: "text-anticipate [text-shadow:0_0_36px_rgba(255,198,109,0.6)]",
  },
  wave: {
    stage: "text-[clamp(2rem,4.6vw,4.75rem)] tracking-[0.06em] uppercase",
    compact: "text-3xl tracking-[0.05em] uppercase",
    tone: "text-aura [text-shadow:0_0_36px_rgba(124,247,212,0.6)]",
  },
  celebrate: {
    stage: "text-[clamp(1.75rem,3.6vw,3.5rem)]",
    compact: "text-2xl",
    tone: "text-anticipate [text-shadow:0_0_32px_rgba(255,198,109,0.65)]",
  },
};

/** The invitation to move: "Get ready", then "Wave with the music", then a short acknowledgement. */
export default function InteractionPrompt({ phase, celebrating, size = "compact" }: InteractionPromptProps) {
  let content: { key: "ready" | "wave" | "celebrate"; title: string; detail: string } | null = null;
  if (celebrating) {
    content = { key: "celebrate", title: "You moved with the music.", detail: "" };
  } else if (phase === "get-ready") {
    content = { key: "ready", title: "Get ready", detail: "The moment is coming." };
  } else if (phase === "wave") {
    content = { key: "wave", title: "Wave with the music", detail: "Move your wrist to the beat." };
  }

  return (
    <div aria-live="assertive">
      {content && (
        <div key={content.key} className="animate-rise">
          <p className={`font-display leading-[1.05] font-bold ${TITLE[content.key][size]} ${TITLE[content.key].tone}`}>
            {content.title}
          </p>
          {content.detail && (
            <p className={`mt-2 text-ink/80 ${size === "stage" ? "text-[clamp(0.95rem,1.4vw,1.35rem)]" : "text-sm"}`}>
              {content.detail}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
