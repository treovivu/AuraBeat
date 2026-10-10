import type { InteractionPhase } from "../lib/interaction";

interface InteractionPromptProps {
  phase: InteractionPhase;
  celebrating: boolean;
}

/** The invitation to move: "Get ready", then "Wave with the music", then a short acknowledgement. */
export default function InteractionPrompt({ phase, celebrating }: InteractionPromptProps) {
  let content: { key: string; title: string; detail: string; tone: string } | null = null;
  if (celebrating) {
    content = { key: "celebrate", title: "You moved with the music.", detail: "", tone: "text-anticipate" };
  } else if (phase === "get-ready") {
    content = { key: "ready", title: "Get ready", detail: "A big moment is coming.", tone: "text-anticipate" };
  } else if (phase === "wave") {
    content = { key: "wave", title: "Wave with the music", detail: "Move your wrist to the beat.", tone: "text-aura" };
  }

  return (
    <div aria-live="assertive" className="min-h-16">
      {content && (
        <div key={content.key} className="animate-rise">
          <p
            className={`font-display font-bold tracking-tight ${content.tone} ${
              content.key === "celebrate" ? "text-2xl" : "text-3xl tracking-[0.08em] uppercase sm:text-4xl"
            }`}
          >
            {content.title}
          </p>
          {content.detail && <p className="mt-1 text-sm text-ink-muted">{content.detail}</p>}
        </div>
      )}
    </div>
  );
}
