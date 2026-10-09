import ScreenHeader from "../components/ScreenHeader";

interface LiveConcertProps {
  onExit: () => void;
}

// Phase 1 shell — status, haptics, lightstick and cue display arrive in Phase 6.
export default function LiveConcert({ onExit }: LiveConcertProps) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 py-6 sm:px-8">
      <ScreenHeader label="Live Concert" onExit={onExit} />
      <p className="mt-16 text-lg text-ink-muted">Keep your eyes on the stage. AuraBeat stays in your pocket.</p>
    </div>
  );
}
