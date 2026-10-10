import type { InteractionPhase } from "../lib/interaction";
import type { SectionMood } from "../types/performance";

/**
 * The visual "act" of the virtual show at this moment. Derived only from the app's existing section
 * mood, interaction phase and celebration — never from time — so every stage layer agrees.
 */
export type Act = "intro" | "verse" | "build" | "prehook" | "hook" | "finale" | "ready" | "wave" | "celebrate";

const ACT_BY_MOOD: Record<SectionMood, Act> = {
  restrained: "intro",
  cool: "verse",
  rising: "build",
  anticipation: "prehook",
  peak: "hook",
  finale: "finale",
};

export function actFor(mood: SectionMood, phase: InteractionPhase, celebrating: boolean): Act {
  if (celebrating) return "celebrate";
  if (phase === "wave") return "wave";
  if (phase === "get-ready") return "ready";
  return ACT_BY_MOOD[mood];
}

/** Acts that are warm (amber/gold) rather than mint. */
export const isWarmAct = (act: Act) => act === "prehook" || act === "ready" || act === "celebrate";
