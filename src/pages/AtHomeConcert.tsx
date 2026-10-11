import { lazy, Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import ScreenHeader from "../components/ScreenHeader";
import PerformanceMedia from "../components/PerformanceMedia";
import AuraStage from "../components/AuraStage";
import LyricsDisplay from "../components/LyricsDisplay";
import Lightstick from "../components/Lightstick";
import PlayerControls from "../components/PlayerControls";
import SensoryToggle from "../components/SensoryToggle";
import DevControls, { type BeatTiming } from "../components/DevControls";
import BeatIndicator from "../components/BeatIndicator";
import LyricSync from "../components/LyricSync";
import InteractionTiming from "../components/InteractionTiming";
import CrowdAtmosphere from "../components/CrowdAtmosphere";
import AuraEnergy from "../components/AuraEnergy";
import CinematicInteraction from "../components/CinematicInteraction";
import VirtualPerformerStage from "../components/VirtualPerformerStage";
import { createNovaTools, NOVA_MOMENT_MS, type EnergyMode, type NovaMoment, type NovaToolHandlers, type SensoryPreference } from "../nova/tools";
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
import type { InteractionCue, LyricLine, SectionMood } from "../types/performance";

interface AtHomeConcertProps {
  onExit: () => void;
}

/** Presentation only: how much each mood adds to the visible energy of the concert. */
const MOOD_ENERGY: Record<SectionMood, number> = {
  restrained: 0.75,
  cool: 0.85,
  rising: 0.95,
  anticipation: 0.95,
  peak: 0.9,
  finale: 1,
};

/**
 * How the performance is presented. Both use the same media element as sound and clock:
 * "virtual" draws a stylised performer on stage over it, "video" shows the concert video itself.
 */
type PerformanceView = "virtual" | "video";
const VIEW_KEY = "aurabeat.view";

function initialView(): PerformanceView {
  const fromUrl = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("view") : null;
  if (fromUrl === "virtual" || fromUrl === "video") return fromUrl;
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === "virtual" || saved === "video") return saved;
  } catch {
    // Storage unavailable: fall through to the default.
  }
  return "virtual";
}

/**
 * Nova's concert energy, presentation only: which mood the stage *looks* like and how strongly it glows.
 * The real section (timing, haptics, beat subdivision, lyrics) is never changed.
 */
const ENERGY_SCALE: Record<EnergyMode, number> = { calm: 0.6, immersive: 1, hype: 1.25 };
const HYPE_MOOD: Record<SectionMood, SectionMood> = {
  restrained: "rising",
  cool: "peak",
  rising: "peak",
  anticipation: "peak",
  peak: "finale",
  finale: "finale",
};
const CALM_MOOD: Record<SectionMood, SectionMood> = {
  restrained: "restrained",
  cool: "cool",
  rising: "cool",
  anticipation: "cool",
  peak: "cool",
  finale: "cool",
};

/** Nova's settings names → AuraBeat's existing sensory settings. */
const PREFERENCE_SETTING = { light: "visuals", watchHaptics: "watchHaptics", lyrics: "lyrics", reduceMotion: "reducedMotion" } as const;

/** Nova's voice SDK (WebRTC) is large, so it loads only when the At-home concert opens. */
const NovaControl = lazy(() => import("../nova/NovaControl"));

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
  const { settings, toggle, set } = useSettings();
  const watchStatus = useWatchStatus();
  // Nova (presentation only): the stage's energy and short visual moments. Never touches the clock.
  const [energyMode, setEnergyMode] = useState<EnergyMode>("immersive");
  const [novaMoment, setNovaMoment] = useState<NovaMoment | null>(null);
  useEffect(() => {
    if (!novaMoment) return;
    const timer = window.setTimeout(() => setNovaMoment(null), NOVA_MOMENT_MS[novaMoment.kind]);
    return () => window.clearTimeout(timer);
  }, [novaMoment]);
  const sensesId = useId();
  const [sensesOpen, setSensesOpen] = useState(false);
  const [view, setView] = useState<PerformanceView>(initialView);
  const chooseView = (next: PerformanceView) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Not persisted; the choice still applies for this visit.
    }
  };

  // Stage mode for TVs: the whole concert screen (not just the video) goes full screen, so the cue,
  // lyrics and lighting stay with the performance.
  const stageRef = useRef<HTMLDivElement>(null);
  const canFullscreen = typeof document !== "undefined" && document.fullscreenEnabled;
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen();
  };

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
  // What the stage looks like: the real section, unless Nova changed the energy or plays an encore.
  const stageMood: SectionMood =
    novaMoment?.kind === "encore"
      ? "finale"
      : energyMode === "hype"
        ? HYPE_MOOD[section.mood]
        : energyMode === "calm"
          ? CALM_MOOD[section.mood]
          : section.mood;
  const stageIntensity = Math.min(1, intensity * ENERGY_SCALE[energyMode]);
  const look = stageLook(stageMood, stageIntensity, beatPulse, visual.downbeat);

  // Activation after a valid wrist wave.
  const [celebration, setCelebration] = useState<number | null>(null);
  const celebrationCount = useRef(0);
  useEffect(() => {
    if (celebration === null) return;
    const timer = window.setTimeout(() => setCelebration(null), CELEBRATE_MS);
    return () => window.clearTimeout(timer);
  }, [celebration]);
  const celebrating = celebration !== null;
  // Nova's moments, shown only on the stage visuals and only when no real interaction is happening.
  const novaFree = !celebrating && promptPhase === "idle";
  const novaBloom = novaFree && novaMoment?.kind === "bloom";
  const stageCelebrating = celebrating || novaBloom;
  const stageCelebrationKey = celebrating ? (celebration ?? undefined) : novaBloom ? -novaMoment.key : undefined;
  const stagePhase = novaFree && novaMoment?.kind === "light-wave" ? "wave" : promptPhase;

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
    : stageCelebrating
      ? "celebrate"
      : stagePhase === "wave"
        ? "wave"
        : promptPhase === "get-ready"
          ? "ready"
          : playing && isHighEnergy(stageMood)
            ? "pulse"
            : "idle";

  // Presentation only — derived from existing state, never used for timing decisions.
  const energy =
    Math.round(
      Math.min(1, Math.max(energyMode === "hype" ? 0.8 : 0, stageIntensity * MOOD_ENERGY[stageMood])) * (playing ? 1 : 0.6) * 50,
    ) / 50;
  const crowdBeat =
    // The crowd only needs the beat while its lightsticks sway (wave, celebration, hooks).
    playing &&
    beatIndex >= 0 &&
    !settings.reducedMotion &&
    (stagePhase === "wave" || stageCelebrating || isHighEnergy(stageMood))
      ? beatIndex + beatPhase
      : -1;

  // Nova's tools read the latest concert state through this ref, so the control never re-renders per frame.
  const novaToolsRef = useRef<NovaToolHandlers | null>(null);
  const novaTools = createNovaTools({
    setEnergyMode,
    triggerMoment: (kind) => setNovaMoment((current) => ({ kind, key: (current?.key ?? 0) + 1 })),
    setPreference: (preference: SensoryPreference, value: boolean) => set(PREFERENCE_SETTING[preference], value),
    status: () => ({
      mode: "at-home",
      isPlaying: playing,
      currentSection: section.label,
      positionSeconds: Math.round(time),
      watchConnected: watchStatus === "connected",
      energy: energyMode,
      lyricsEnabled: settings.lyrics,
      watchHapticsEnabled: settings.watchHaptics,
      lightEnabled: settings.visuals,
      reduceMotion: settings.reducedMotion,
    }),
  });
  useLayoutEffect(() => {
    novaToolsRef.current = novaTools;
  });
  const getNovaTools = useCallback(() => novaToolsRef.current!, []);

  return (
    <div
      ref={stageRef}
      className={`relative isolate mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 pt-6 pb-[18vh] sm:px-8 sm:pb-[24vh] xl:max-w-7xl ${
        fullscreen ? "overflow-y-auto bg-stage" : ""
      }`}
    >
      {view === "video" && (
      <CrowdAtmosphere
        mood={stageMood}
        phase={stagePhase}
        celebrating={stageCelebrating}
        celebrationKey={stageCelebrationKey}
        energy={energy}
        beat={crowdBeat}
        lit={settings.visuals}
        reducedMotion={settings.reducedMotion}
      />
      )}
      <ScreenHeader label="At-home Concert" onExit={onExit} />

      {/* 1. The performance, with the interaction cue staged on it (tablet, desktop, TV) */}
      <div className="mt-4">
        <PerformanceMedia
          media={hasMedia ? track.media : undefined}
          mediaRef={videoRef}
          muted={!settings.sound}
          onMediaError={() => setMediaFailed(true)}
          light={settings.visuals ? look.level : 0}
          tone={promptPhase === "get-ready" ? "amber" : look.tone}
          accent={settings.visuals ? look.accent : 0}
          anticipation={settings.visuals && promptPhase === "get-ready"}
          activated={settings.visuals && stageCelebrating}
          burstKey={stageCelebrationKey}
          scene={
            view === "virtual" ? (
              <VirtualPerformerStage
                mood={stageMood}
                energy={energy}
                beatPulse={beatPulse}
                accent={settings.visuals ? look.accent : 0}
                beat={playing && beatIndex >= 0 ? beatIndex + beatPhase : -1}
                phase={stagePhase}
                celebrating={stageCelebrating}
                celebrationKey={stageCelebrationKey}
                lit={settings.visuals}
                reducedMotion={settings.reducedMotion}
              />
            ) : undefined
          }
          placeholder={
            view === "virtual" ? undefined : (
            <AuraStage
              beatIndex={beatIndex}
              phase={beatPhase}
              intensity={intensity}
              amber={stageMood === "anticipation"}
              playing={playing}
              enabled={settings.visuals}
              reducedMotion={settings.reducedMotion}
            />
            )
          }
          overlay={
            <>
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 bg-gradient-to-b from-black/60 to-transparent p-4 sm:p-5">
              <div className="min-w-0">
                <p className="truncate font-display text-base font-bold sm:text-xl">{track.title}</p>
                <p className="truncate text-xs text-ink-muted sm:text-sm">{track.artist}</p>
              </div>
              {view === "video" && !hasMedia && (
                <span className="shrink-0 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs whitespace-nowrap text-ink-muted">
                  {track.media
                    ? "Video unavailable · mock clock"
                    : track.isMock
                      ? "Mock performance"
                      : <>No video<span className="hidden sm:inline"> configured · timeline preview</span></>}
                </span>
              )}
            </div>
            {/* Stage cue: GET READY / WAVE / success in the lower centre of the performance */}
            <div className="hidden sm:contents">
              <CinematicInteraction
                variant="overlay"
                phase={promptPhase}
                celebrating={celebrating}
                celebrationKey={celebration ?? undefined}
                lit={settings.visuals}
                reducedMotion={settings.reducedMotion}
              />
            </div>
            </>
          }
        />
      </div>

      {/* 2. Interaction cue under the video on phones, where the video is too small to overlay */}
      <div className="sm:hidden">
        <CinematicInteraction
          variant="inline"
          phase={promptPhase}
          celebrating={celebrating}
          celebrationKey={celebration ?? undefined}
          lit={settings.visuals}
          reducedMotion={settings.reducedMotion}
        />
      </div>

      {/* 3. Lyrics and musical context */}
      <div className="mt-3 sm:mt-5">
        <p className="text-center text-xs font-semibold tracking-[0.3em] text-ink-muted uppercase">{section.label}</p>
        {settings.lyrics && lyrics.length > 0 && (
          <div className="mt-1">
            <LyricsDisplay lyrics={lyrics} time={time} energetic={playing && isHighEnergy(stageMood)} />
          </div>
        )}
      </div>

      {/* 4. Stage floor: the Aura Energy ribbon with the phone lightstick standing on it, and the bar count */}
      <div className="relative mt-1 flex flex-col items-center">
        {settings.visuals && (
          <div className="absolute inset-x-0 top-12">
            <AuraEnergy
              energy={energy}
              celebrating={stageCelebrating}
              celebrationKey={stageCelebrationKey}
              reducedMotion={settings.reducedMotion}
            />
          </div>
        )}
        <Lightstick
          state={lightstickState}
          pulse={pulse}
          beat={playing && beatIndex >= 0 ? beatIndex + beatPhase : -1}
          reducedMotion={settings.reducedMotion}
        />
        {settings.visuals && (
          <div className="mt-2">
            <BeatIndicator beatIndex={beatIndex} playing={playing} />
          </div>
        )}
      </div>

      {/* 5. Controls — on a soft backing so the crowd behind never competes with them */}
      <div className="relative z-10 -mx-3 mt-6 flex flex-col gap-4 rounded-3xl bg-stage/90 p-3">
        <PlayerControls
          time={time}
          duration={duration}
          playing={playing}
          onPlay={handlePlay}
          onPause={clock.pause}
          onSeek={clock.seek}
        />

        <div>
          <div className="flex flex-wrap items-center gap-3">
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
          <div role="group" aria-label="Performance view" className="inline-flex min-h-12 items-center rounded-full border border-white/15 p-1">
            {(
              [
                ["virtual", "Virtual stage"],
                ["video", "Concert video"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => chooseView(value)}
                className={`min-h-10 rounded-full px-4 text-sm font-semibold transition ${
                  view === value ? "bg-white/10 text-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {canFullscreen && (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-pressed={fullscreen}
              className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/15 px-5 text-sm font-semibold text-ink transition hover:border-white/40 hover:bg-white/5"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                {fullscreen ? (
                  <path d="M8 3v5H3M12 3v5h5M8 17v-5H3M12 17v-5h5" strokeLinecap="round" strokeLinejoin="round" />
                ) : (
                  <path d="M3 8V3h5M17 8V3h-5M3 12v5h5M17 12v5h-5" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </svg>
              {fullscreen ? "Exit full screen" : "Full screen"}
            </button>
          )}
          <Suspense fallback={null}>
            <NovaControl getTools={getNovaTools} />
          </Suspense>
          </div>

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
