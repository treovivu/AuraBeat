import { useEffect, useId, useMemo, useRef, useState } from "react";
import ScreenHeader from "../components/ScreenHeader";
import PerformanceMedia from "../components/PerformanceMedia";
import AuraStage from "../components/AuraStage";
import LyricsDisplay from "../components/LyricsDisplay";
import InteractionPrompt from "../components/InteractionPrompt";
import Lightstick from "../components/Lightstick";
import PlayerControls from "../components/PlayerControls";
import SensoryToggle from "../components/SensoryToggle";
import DevControls, { type BeatTiming } from "../components/DevControls";
import BeatIndicator from "../components/BeatIndicator";
import LyricSync from "../components/LyricSync";
import InteractionTiming from "../components/InteractionTiming";
import { activePerformance, activePerformanceId, performances } from "../data/performance";
import { beatPosition, firstBeatFromAnchor, intensityAt, sectionAt } from "../lib/beat";
import { isHighEnergy, stageLook, visualPulse } from "../lib/stage";
import { interactionAt } from "../lib/interaction";
import { unlockAudio } from "../lib/audio";
import { emitMovement, onMovement, phoneCanVibrate, sendHaptic, stopHaptics, type WatchStatus } from "../lib/watchBridge";
import { usePlayback } from "../hooks/usePlayback";
import { useMediaClock } from "../hooks/useMediaClock";
import { useSettings } from "../hooks/useSettings";
import { useBeatSound } from "../hooks/useBeatSound";
import { useWatchStatus } from "../hooks/useWatchStatus";
import type { LightstickState } from "../types/concert";
import type { InteractionCue, LyricLine } from "../types/performance";

interface AtHomeConcertProps {
  onExit: () => void;
}

/** How long the concert stays "activated" after the audience moves with the music. */
const CELEBRATE_MS = 2600;
/** DEV jumps land this many seconds before "Get ready", so the music leading into it is heard. */
const JUMP_LEAD_IN = 5;

function watchHapticsDescription(status: WatchStatus): string {
  const fallback = phoneCanVibrate ? " Your phone vibrates instead." : "";
  if (status === "connected") return "Watch connected.";
  if (status === "simulated") return `Simulated (development mode). No watch connected.${fallback}`;
  return `Watch disconnected.${fallback}`;
}

export default function AtHomeConcert({ onExit }: AtHomeConcertProps) {
  // Beat grid = BPM + a known downbeat, from the track config. DEV calibration can override it for the session.
  const configuredTiming: BeatTiming = {
    bpm: activePerformance.bpm,
    anchor: activePerformance.downbeatAnchor ?? activePerformance.firstBeat,
  };
  const [timing, setTiming] = useState<BeatTiming>(configuredTiming);
  // Interaction timings from the track config. DEV calibration can override them for the session.
  const [interactions, setInteractions] = useState<InteractionCue[]>(activePerformance.interactions);
  const track = useMemo(
    () => ({
      ...activePerformance,
      bpm: timing.bpm,
      firstBeat: firstBeatFromAnchor(timing.bpm, timing.anchor),
      interactions,
    }),
    [timing, interactions],
  );
  // DEV: compare the prepared accent cues against the plain grid.
  const [cuesOn, setCuesOn] = useState(true);
  const [metronome, setMetronome] = useState(false);
  // DEV lyric sync shows lines as they are timed, in place of the configured lyrics.
  const [previewLyrics, setPreviewLyrics] = useState<LyricLine[] | null>(null);
  const lyrics = previewLyrics ?? activePerformance.lyrics;
  const { settings, toggle } = useSettings();
  const watchStatus = useWatchStatus();
  const sensesId = useId();
  const [sensesOpen, setSensesOpen] = useState(false);

  // Clock: a real performance video is the source of truth; the mock timer runs only without one.
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mediaFailed, setMediaFailed] = useState(false);
  const hasMedia = Boolean(track.media) && !mediaFailed;
  const mediaClock = useMediaClock(videoRef, hasMedia, track.duration);
  const mockClock = usePlayback(track.duration);
  const clock = hasMedia ? mediaClock : { ...mockClock, duration: track.duration };
  const { time, playing, duration, getTime } = clock;

  // Generated beat: the mock performance's music, or a DEV metronome over the real one.
  useBeatSound(track, settings.sound && !hasMedia && !(import.meta.env.DEV && metronome), playing, getTime);
  useBeatSound(track, import.meta.env.DEV && metronome, playing, getTime, "metronome");

  const { index: beatIndex, phase: beatPhase } = beatPosition(track, time);
  const section = sectionAt(track, time);
  const intensity = intensityAt(track, time);
  const { phase } = interactionAt(track, time);
  const prompting = settings.playAlong && playing;
  const promptPhase = prompting ? phase : "idle";
  const pulseOptions = { gentle: settings.reducedMotion, cues: cuesOn };
  const visual = visualPulse(track, section, time, pulseOptions);
  const beatPulse = playing ? visual.value : 0;
  const pulse = beatPulse * intensity;
  const look = stageLook(section.mood, intensity, beatPulse, visual.downbeat);

  // Activation after a valid wrist wave.
  const [celebration, setCelebration] = useState<number | null>(null);
  const celebrationCount = useRef(0);
  useEffect(() => {
    if (celebration === null) return;
    const timer = window.setTimeout(() => setCelebration(null), CELEBRATE_MS);
    return () => window.clearTimeout(timer);
  }, [celebration]);
  const celebrating = celebration !== null;

  const [lastMovement, setLastMovement] = useState<string | null>(null);
  const ignoreReason = !settings.playAlong
    ? "Play Along is off"
    : !playing
      ? "performance not playing"
      : phase !== "wave"
        ? "not a wave moment"
        : celebrating
          ? "already celebrating"
          : null;

  useEffect(
    () =>
      onMovement((event) => {
        if (ignoreReason) {
          if (import.meta.env.DEV) setLastMovement(`ignored (${ignoreReason})`);
          return;
        }
        if (import.meta.env.DEV) setLastMovement(`accepted (${event.source})`);
        setCelebration(++celebrationCount.current);
        if (settings.watchHaptics) sendHaptic({ type: "celebrate" });
      }),
    [ignoreReason, settings.watchHaptics],
  );

  // Haptic cues follow the same clock as everything else.
  // One cue per visual pulse (half-beats too in double-time sections), weaker off the beat.
  const pulseIndex = visual.index;
  useEffect(() => {
    if (!settings.watchHaptics || !playing || pulseIndex < 0) return;
    // Read the moment itself so a ramp doesn't re-send cues between pulses.
    const now = getTime();
    const { onBeat, downbeat } = visualPulse(track, sectionAt(track, now), now, { gentle: false, cues: false });
    sendHaptic({ type: "beat", strength: intensityAt(track, now) * (onBeat ? 1 : 0.6), downbeat });
  }, [pulseIndex, playing, settings.watchHaptics, track, getTime]);

  useEffect(() => {
    if (!settings.watchHaptics || promptPhase === "idle") return;
    sendHaptic({ type: promptPhase });
  }, [promptPhase, settings.watchHaptics]);

  useEffect(() => () => stopHaptics(), []);

  const handlePlay = () => {
    if (!hasMedia) unlockAudio();
    clock.play();
  };

  const jumpToCue = (cue: InteractionCue) => {
    clock.seek(Math.max(0, cue.readyAt - JUMP_LEAD_IN));
    if (!playing) handlePlay();
  };

  const lightstickState: LightstickState = !settings.visuals
    ? "off"
    : celebrating
      ? "celebrate"
      : promptPhase === "wave"
        ? "wave"
        : promptPhase === "get-ready"
          ? "ready"
          : playing && isHighEnergy(section.mood)
            ? "pulse"
            : "idle";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 py-6 sm:px-8">
      <ScreenHeader label="At-home Concert" onExit={onExit} />

      {/* 1. The performance */}
      <div className="mt-6">
        <PerformanceMedia
          media={hasMedia ? track.media : undefined}
          mediaRef={videoRef}
          muted={!settings.sound}
          onMediaError={() => setMediaFailed(true)}
          light={settings.visuals ? look.level : 0}
          tone={look.tone}
          accent={settings.visuals ? look.accent : 0}
          activated={settings.visuals && celebrating}
          burstKey={celebration ?? undefined}
          placeholder={
            <AuraStage
              beatIndex={beatIndex}
              phase={beatPhase}
              intensity={intensity}
              amber={section.mood === "anticipation"}
              playing={playing}
              enabled={settings.visuals}
              reducedMotion={settings.reducedMotion}
            />
          }
          overlay={
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 bg-gradient-to-b from-black/60 to-transparent p-4 sm:p-5">
              <div className="min-w-0">
                <p className="truncate font-display text-base font-bold sm:text-xl">{track.title}</p>
                <p className="truncate text-xs text-ink-muted sm:text-sm">{track.artist}</p>
              </div>
              {!hasMedia && (
                <span className="shrink-0 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs whitespace-nowrap text-ink-muted">
                  {track.media
                    ? "Video unavailable · mock clock"
                    : track.isMock
                      ? "Mock performance"
                      : <>No video<span className="hidden sm:inline"> configured · timeline preview</span></>}
                </span>
              )}
            </div>
          }
        />
      </div>

      {/* 2. Lyrics and musical context */}
      <div className="mt-4">
        {settings.visuals && <BeatIndicator beatIndex={beatIndex} playing={playing} />}
        <p className="mt-3 text-center text-xs font-semibold tracking-[0.3em] text-ink-muted uppercase">{section.label}</p>
        {settings.lyrics && lyrics.length > 0 && (
          <div className="mt-2">
            <LyricsDisplay lyrics={lyrics} time={time} />
          </div>
        )}
      </div>

      {/* 3. Interaction prompt, with the phone lightstick */}
      <div className="mt-4 flex items-center justify-center gap-5 text-center">
        <Lightstick
          state={lightstickState}
          pulse={pulse}
          beat={playing && beatIndex >= 0 ? beatIndex + beatPhase : -1}
          reducedMotion={settings.reducedMotion}
        />
        <div className="min-w-0 flex-1 text-left sm:flex-none sm:min-w-80">
          <InteractionPrompt phase={promptPhase} celebrating={celebrating} />
        </div>
      </div>

      {/* 4. Controls */}
      <div className="mt-6 flex flex-col gap-4 pb-6">
        <PlayerControls
          time={time}
          duration={duration}
          playing={playing}
          onPlay={handlePlay}
          onPause={clock.pause}
          onSeek={clock.seek}
        />

        <div>
          <button
            type="button"
            aria-expanded={sensesOpen}
            aria-controls={sensesId}
            onClick={() => setSensesOpen((open) => !open)}
            className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/15 px-5 text-sm font-semibold text-ink transition hover:border-white/40 hover:bg-white/5"
          >
            Your senses
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className={`size-4 transition-transform ${sensesOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m5 8 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {sensesOpen && (
            <section
              id={sensesId}
              aria-label="Your senses"
              className="mt-3 rounded-3xl border border-white/10 bg-surface p-3 sm:p-4"
            >
              <p className="px-3 pt-1 text-sm text-ink-muted">Choose how the music reaches you.</p>
              <div className="mt-2 grid gap-1 sm:grid-cols-2">
                <SensoryToggle
                  label="Light"
                  description="Stage light and lightstick follow the music."
                  checked={settings.visuals}
                  onChange={() => toggle("visuals")}
                />
                <SensoryToggle
                  label="Sound"
                  description="Hear the performance."
                  checked={settings.sound}
                  onChange={() => toggle("sound")}
                />
                <SensoryToggle
                  label="Watch Haptics"
                  description={watchHapticsDescription(watchStatus)}
                  checked={settings.watchHaptics}
                  onChange={() => toggle("watchHaptics")}
                />
                <SensoryToggle
                  label="Lyrics"
                  description="Show live lyrics as they're sung."
                  checked={settings.lyrics}
                  onChange={() => toggle("lyrics")}
                />
                <SensoryToggle
                  label="Play Along"
                  description="Wave your wrist with the music at highlighted moments."
                  checked={settings.playAlong}
                  onChange={() => toggle("playAlong")}
                />
                <SensoryToggle
                  label="Reduce Motion"
                  description="Keep the light but stop it moving."
                  checked={settings.reducedMotion}
                  onChange={() => toggle("reducedMotion")}
                />
              </div>
            </section>
          )}
        </div>
      </div>

      {import.meta.env.DEV && (
        <DevControls
          performanceTitle={track.title}
          switchTo={Object.entries(performances)
            .filter(([id]) => id !== activePerformanceId)
            .map(([id, other]) => ({ label: `Switch to ${other.title}`, href: `?performance=${id}` }))}
          phase={phase}
          watchStatus={watchStatus}
          lastMovement={lastMovement}
          cues={track.interactions}
          notices={
            track.lyrics.length === 0 && track.lyricsFile && !previewLyrics
              ? [`No lyric data. Use Lyric sync, then paste into ${track.lyricsFile}`]
              : []
          }
          jumpLeadIn={JUMP_LEAD_IN}
          onJumpToCue={jumpToCue}
          calibration={{
            timing,
            configured: configuredTiming,
            onChange: setTiming,
            getTime,
            time,
            beatIndex,
            subdivision: settings.reducedMotion ? 1 : (section.visualSubdivision ?? 1),
            metronome,
            onMetronomeChange: setMetronome,
            hasCues: Boolean(track.visualCues?.length),
            cues: cuesOn,
            onCuesChange: setCuesOn,
            saveFile: track.configFile,
          }}
          onSimulateWave={() => emitMovement("simulated")}
        >
          <InteractionTiming
            cues={interactions}
            saved={activePerformance.interactions}
            onChange={setInteractions}
            getTime={getTime}
            time={time}
            saveFile={track.configFile}
          />
          {track.lyricDraft && track.lyricDraftFile && track.lyricsFile && (
            <LyricSync
              lines={track.lyricDraft}
              draftFile={track.lyricDraftFile}
              targetFile={track.lyricsFile}
              getTime={getTime}
              duration={duration}
              onPreview={setPreviewLyrics}
            />
          )}
        </DevControls>
      )}
    </div>
  );
}
