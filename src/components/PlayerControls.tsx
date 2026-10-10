import { formatTime } from "../lib/beat";

interface PlayerControlsProps {
  time: number;
  duration: number;
  playing: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
}

export default function PlayerControls({ time, duration, playing, onPlay, onPause, onSeek }: PlayerControlsProps) {
  const ended = !playing && time >= duration;

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={playing ? onPause : onPlay}
        className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-aura text-xl font-bold text-stage transition hover:brightness-110"
        aria-label={playing ? "Pause" : ended ? "Replay" : "Play"}
      >
        <span aria-hidden="true">{playing ? "❚❚" : ended ? "↺" : "▶"}</span>
      </button>
      <div className="flex flex-1 flex-col gap-1">
        <input
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={time}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="Position in performance"
          aria-valuetext={`${formatTime(time)} of ${formatTime(duration)}`}
          className="h-2 w-full cursor-pointer accent-aura"
        />
        <div className="flex justify-between text-xs text-ink-muted tabular-nums">
          <span>{formatTime(time)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}
