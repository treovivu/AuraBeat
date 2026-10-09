interface ScreenHeaderProps {
  label: string;
  onExit: () => void;
}

/** Top bar shared by the concert screens: brand, mode label, and an always-visible exit. */
export default function ScreenHeader({ label, onExit }: ScreenHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4">
      <div>
        <p className="font-display text-xs font-semibold tracking-[0.4em] text-aura">AURABEAT</p>
        <h1 className="mt-1 font-display text-lg font-bold tracking-wide uppercase">{label}</h1>
      </div>
      <button
        type="button"
        onClick={onExit}
        className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/15 px-5 text-sm font-semibold text-ink transition hover:border-white/40 hover:bg-white/5"
      >
        <span aria-hidden="true">←</span>
        Exit
      </button>
    </header>
  );
}
