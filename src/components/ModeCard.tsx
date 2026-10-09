type ModeCardTone = "live" | "home";

interface ModeCardProps {
  eyebrow: string;
  title: string;
  description: string;
  tone: ModeCardTone;
  onSelect: () => void;
}

const toneStyles: Record<ModeCardTone, { glow: string; ring: string; accent: string; orb: string }> = {
  live: {
    glow: "from-anticipate/25 via-alert/10 to-transparent",
    ring: "hover:border-anticipate/60 focus-visible:border-anticipate",
    accent: "text-anticipate",
    orb: "bg-anticipate/40",
  },
  home: {
    glow: "from-aura/25 via-sky-400/10 to-transparent",
    ring: "hover:border-aura/60 focus-visible:border-aura",
    accent: "text-aura",
    orb: "bg-aura/40",
  },
};

export default function ModeCard({ eyebrow, title, description, tone, onSelect }: ModeCardProps) {
  const style = toneStyles[tone];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative isolate flex min-h-56 w-full flex-col justify-end overflow-hidden rounded-3xl border border-white/10 bg-surface p-6 text-left transition duration-300 hover:-translate-y-1 sm:min-h-72 sm:p-8 ${style.ring}`}
    >
      {/* Ambient light that intensifies on hover — decorative only */}
      <span
        aria-hidden="true"
        className={`absolute inset-0 -z-10 bg-gradient-to-br opacity-70 transition-opacity duration-500 group-hover:opacity-100 ${style.glow}`}
      />
      <span
        aria-hidden="true"
        className={`absolute -top-16 -right-16 -z-10 size-48 rounded-full blur-3xl transition-transform duration-700 group-hover:scale-125 ${style.orb}`}
      />

      <span className={`font-display text-sm font-semibold tracking-[0.25em] uppercase ${style.accent}`}>
        {eyebrow}
      </span>
      <span className="mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">{title}</span>
      <span className="mt-3 max-w-sm text-base leading-relaxed text-ink-muted">{description}</span>
      <span className={`mt-6 inline-flex items-center gap-2 text-sm font-semibold ${style.accent}`}>
        Enter
        <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">
          →
        </span>
      </span>
    </button>
  );
}
