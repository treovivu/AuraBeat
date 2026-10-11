import { memo, useEffect, useState } from "react";
import {
  ConversationProvider,
  useConversationClientTool,
  useConversationControls,
  useConversationMode,
  useConversationStatus,
} from "@elevenlabs/react";
import type { NovaToolHandlers } from "./tools";

interface NovaControlProps {
  /** Returns the current tool handlers (read at call time, so they always see the latest concert state). */
  getTools: () => NovaToolHandlers;
}

/** Asks for the microphone up front so a denial can be explained, then releases it (the SDK opens its own). */
async function checkMicrophone(): Promise<string | null> {
  if (!navigator.mediaDevices?.getUserMedia) return "This browser can't use a microphone here.";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return null;
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    return name === "NotAllowedError" || name === "SecurityError"
      ? "Microphone access is blocked. Allow it in the browser to talk to Nova."
      : "No microphone found.";
  }
}

/** A short-lived WebRTC conversation token from the dev server (the API key never leaves the server). */
async function fetchToken(): Promise<string> {
  const response = await fetch("/__aurabeat/nova/token");
  const body = (await response.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!response.ok || !body.token) throw new Error(body.error ?? "Nova isn't available right now.");
  return body.token;
}

function NovaButton({ getTools }: NovaControlProps) {
  useConversationClientTool("setConcertEnergy", (parameters) => getTools().setConcertEnergy(parameters));
  useConversationClientTool("triggerAuraMoment", (parameters) => getTools().triggerAuraMoment(parameters));
  useConversationClientTool("setSensoryPreference", (parameters) => getTools().setSensoryPreference(parameters));
  useConversationClientTool("getConcertStatus", () => getTools().getConcertStatus());

  const { status, message } = useConversationStatus();
  const { isSpeaking } = useConversationMode();
  const { startSession, endSession } = useConversationControls();
  const [preparing, setPreparing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Leaving the concert ends the conversation and releases the microphone.
  useEffect(() => () => endSession(), [endSession]);

  const connected = status === "connected";
  const busy = preparing || status === "connecting";

  const start = async () => {
    setProblem(null);
    setPreparing(true);
    try {
      const micProblem = await checkMicrophone();
      if (micProblem) return setProblem(micProblem);
      startSession({ conversationToken: await fetchToken(), connectionType: "webrtc" });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Couldn't reach Nova.");
    } finally {
      setPreparing(false);
    }
  };

  const label = busy ? "Connecting…" : connected ? (isSpeaking ? "Nova is speaking…" : "Nova is listening…") : "Talk to Nova";
  const error = problem ?? (status === "error" ? (message ?? "Nova disconnected.") : null);

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={connected ? () => endSession() : () => void start()}
        disabled={busy}
        aria-pressed={connected}
        className={`inline-flex min-h-12 items-center gap-2 rounded-full border px-5 text-sm font-semibold transition disabled:opacity-70 ${
          connected
            ? "border-anticipate/60 bg-anticipate/15 text-anticipate hover:bg-anticipate/25"
            : "border-white/15 text-ink hover:border-white/40 hover:bg-white/5"
        }`}
      >
        <span aria-hidden="true" className={connected && isSpeaking ? "animate-pulse" : ""}>
          ✦
        </span>
        <span aria-live="polite">{label}</span>
        {connected && <span className="text-xs font-normal text-ink-muted">· End</span>}
      </button>
      {error && (
        <p role="alert" className="text-xs text-alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * "Talk to Nova": AuraBeat's virtual performer and host, an ElevenLabs voice agent. Nova can change the
 * stage's energy, trigger visual moments and adjust sensory preferences through client tools; she never
 * touches the music timeline. Memoised so the concert's per-frame renders don't re-render it.
 */
export default memo(function NovaControl({ getTools }: NovaControlProps) {
  return (
    <ConversationProvider>
      <NovaButton getTools={getTools} />
    </ConversationProvider>
  );
});
