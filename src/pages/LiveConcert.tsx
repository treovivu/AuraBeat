import { useEffect, useState } from "react";
import ScreenHeader from "../components/ScreenHeader";
import SensoryToggle from "../components/SensoryToggle";
import LiveStatusPanel from "../components/live/LiveStatusPanel";
import LiveCueDisplay from "../components/live/LiveCueDisplay";
import LiveLightstickView from "../components/live/LiveLightstickView";
import LiveDevControls from "../components/live/LiveDevControls";
import { connectLiveBackend } from "../live/liveBridge";
import { useLiveConnection } from "../live/useLiveConnection";
import { useLiveSession, useLiveSettings } from "../live/useLiveSession";
import { useWatchStatus } from "../hooks/useWatchStatus";
import { useSettings } from "../hooks/useSettings";

interface LiveConcertProps {
  onExit: () => void;
}

/**
 * The backend's live event WebSocket (see liveBridge.ts for the message format). In development the dev
 * server hosts the lightstick hub itself, fed by tools/live_lightstick.py.
 */
const liveWsUrl = (): string | undefined =>
  (import.meta.env.VITE_LIVE_WS_URL as string | undefined) ??
  (import.meta.env.DEV ? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws?role=app&session=demo` : undefined);

/**
 * Live Concert: the real stage is the show, so the phone stays minimal — a synchronized lightstick,
 * watch haptics, short accessibility cues, connection status, and an always-available Stop.
 */
export default function LiveConcert({ onExit }: LiveConcertProps) {
  const { settings, toggle } = useLiveSettings();
  const { settings: shared } = useSettings(); // shared accessibility preference (Reduce Motion)
  const reducedMotion = shared.reducedMotion;
  const connection = useLiveConnection();
  const watch = useWatchStatus();
  const [watchMock, setWatchMock] = useState(false);
  const session = useLiveSession(settings);
  const [lightstickOpen, setLightstickOpen] = useState(false);

  useEffect(() => {
    const url = liveWsUrl();
    return url ? connectLiveBackend(url) : undefined;
  }, []);

  const start = () => {
    session.start();
    if (settings.lightstick) setLightstickOpen(true);
  };

  const stop = () => {
    session.stop();
    setLightstickOpen(false);
  };

  const exit = () => {
    stop();
    onExit();
  };

  const statusLine = [
    connection.backend === "connected" ? "Live" : "Offline",
    watch === "connected" ? "Watch on" : "No watch",
  ].join(" · ");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 py-6 sm:px-8">
      <ScreenHeader label="Live Concert" onExit={exit} />

      <p className="mt-6 text-lg text-ink-muted">Keep your eyes on the stage. AuraBeat stays in your pocket.</p>

      {/* Primary action */}
      <div className="mt-6">
        {!session.active ? (
          <button
            type="button"
            onClick={start}
            className="flex min-h-20 w-full flex-col items-center justify-center rounded-3xl bg-aura text-stage transition hover:brightness-110"
          >
            <span className="font-display text-2xl font-bold">Start live mode</span>
            <span className="text-sm font-semibold opacity-80">
              {settings.lightstick ? "Your screen becomes a lightstick" : "Haptics and cues only"}
            </span>
          </button>
        ) : (
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <button
              type="button"
              onClick={() => setLightstickOpen(true)}
              disabled={!settings.lightstick}
              className="min-h-20 rounded-3xl border border-aura/60 bg-aura/15 font-display text-xl font-bold text-aura disabled:border-white/10 disabled:bg-transparent disabled:text-ink-muted"
            >
              {settings.lightstick ? "Open lightstick" : "Lightstick off"}
            </button>
            <button type="button" onClick={stop} className="min-h-20 rounded-3xl bg-alert px-8 font-display text-xl font-bold text-stage">
              Stop
            </button>
          </div>
        )}
        {session.active && (
          <p className="mt-2 text-center text-sm text-ink-muted">
            Live mode is on{settings.watchHaptics ? " · haptics on" : ""}. Stop ends it immediately.
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <LiveStatusPanel connection={connection} watch={watch} watchMock={watchMock} />

        {settings.cues && session.active && (
          <LiveCueDisplay cue={session.lastCue} beats={session.beats} variant="card" reducedMotion={reducedMotion} />
        )}

        <section aria-label="Live settings" className="rounded-3xl border border-white/10 bg-surface p-3">
          <SensoryToggle
            label="Lightstick"
            description="Your screen glows with the music."
            checked={settings.lightstick}
            onChange={() => toggle("lightstick")}
          />
          <SensoryToggle
            label="Watch Haptics"
            description={
              watch === "connected"
                ? "Feel the beat and big moments on your watch."
                : "No watch connected — your phone vibrates instead where supported."
            }
            checked={settings.watchHaptics}
            onChange={() => toggle("watchHaptics")}
          />
          <SensoryToggle
            label="Music cues"
            description="Short words like BASS, BUILD, CHORUS, DROP."
            checked={settings.cues}
            onChange={() => toggle("cues")}
          />
        </section>

        {/* Standalone lightstick page (public/lightstick.html) that follows the backend's shared cues */}
        <a
          href={`${import.meta.env.BASE_URL}lightstick.html`}
          className="flex min-h-16 items-center justify-between gap-3 rounded-3xl border border-white/10 bg-surface px-5 py-3 transition hover:border-aura/60"
        >
          <span>
            <span className="block font-display text-lg font-bold">Shared lightstick</span>
            <span className="block text-sm text-ink-muted">Connect to the venue backend and glow with the crowd.</span>
          </span>
          <span aria-hidden="true" className="text-2xl text-aura">
            →
          </span>
        </a>
      </div>

      {lightstickOpen && session.active && (
        <LiveLightstickView
          mode={session.mode}
          tone={session.tone}
          flash={session.flash}
          reducedMotion={reducedMotion}
          status={statusLine}
          cue={
            settings.cues ? (
              <LiveCueDisplay cue={session.lastCue} beats={session.beats} variant="stage" reducedMotion={reducedMotion} />
            ) : undefined
          }
          onExit={() => setLightstickOpen(false)}
          onStop={stop}
        />
      )}

      {import.meta.env.DEV && (
        <LiveDevControls
          backendConnected={connection.backend === "connected"}
          watchMock={watchMock}
          onWatchMockChange={setWatchMock}
          realWatchConnected={watch === "connected" && !watchMock}
        />
      )}
    </div>
  );
}
