import ModeCard from "../components/ModeCard";
import type { Screen } from "../types/navigation";

interface HomeProps {
  onSelect: (screen: Screen) => void;
}

export default function Home({ onSelect }: HomeProps) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden">
      {/* Slow-drifting stage light behind the content */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-[-20%] left-[-10%] size-[70vmax] animate-aura-drift rounded-full bg-aura/10 blur-[120px]" />
        <div className="absolute right-[-20%] bottom-[-30%] size-[60vmax] animate-aura-drift rounded-full bg-anticipate/10 blur-[120px] [animation-delay:-9s]" />
      </div>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 pt-12 pb-10 sm:px-8 sm:pt-20">
        <header className="animate-rise">
          <p className="font-display text-sm font-semibold tracking-[0.4em] text-aura">AURABEAT</p>
          <h1 className="mt-6 font-display text-5xl leading-[1.05] font-bold tracking-tight sm:text-7xl">
            Feel the rhythm.
            <br />
            <span className="text-ink-muted">Follow the moment.</span>
          </h1>
        </header>

        <section aria-labelledby="mode-question" className="mt-14 sm:mt-20">
          <h2
            id="mode-question"
            className="animate-rise text-xl font-medium text-ink [animation-delay:150ms] sm:text-2xl"
          >
            How do you want to feel the music?
          </h2>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 sm:gap-6">
            <div className="animate-rise [animation-delay:250ms]">
              <ModeCard
                tone="live"
                eyebrow="Be there"
                title="Live Concert"
                description="Feel a live performance through light + touch."
                onSelect={() => onSelect("live")}
              />
            </div>
            <div className="animate-rise [animation-delay:350ms]">
              <ModeCard
                tone="home"
                eyebrow="Bring it home"
                title="At-home Concert"
                description="Turn a performance into an interactive multisensory experience."
                onSelect={() => onSelect("at-home")}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
