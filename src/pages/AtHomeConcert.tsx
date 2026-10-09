import ScreenHeader from "../components/ScreenHeader";

interface AtHomeConcertProps {
  onExit: () => void;
}

// Phase 1 shell — player, lyrics, toggles and Play Along arrive in Phase 2.
export default function AtHomeConcert({ onExit }: AtHomeConcertProps) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 py-6 sm:px-8">
      <ScreenHeader label="At-home Concert" onExit={onExit} />
      <p className="mt-16 text-lg text-ink-muted">The performance is coming to you.</p>
    </div>
  );
}
