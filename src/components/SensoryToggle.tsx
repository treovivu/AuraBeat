interface SensoryToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}

export default function SensoryToggle({ label, description, checked, onChange, disabled }: SensoryToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className="flex min-h-12 w-full items-center justify-between gap-4 rounded-2xl px-3 py-2 text-left transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span>
        <span className="block font-semibold text-ink">{label}</span>
        <span className="block text-sm text-ink-muted">{description}</span>
      </span>
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-aura" : "bg-white/15"}`}
      >
        <span
          className={`absolute top-1 left-1 size-5 rounded-full bg-ink transition-transform ${checked ? "translate-x-5" : ""}`}
        />
      </span>
    </button>
  );
}
