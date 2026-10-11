/**
 * Nova's four client tools (configured on the ElevenLabs agent with exactly these names and parameters).
 * Every handler only changes presentation or the user's sensory preferences — never the music timeline.
 */

/** Visual and performative energy of the stage. Presentation only: timing, BPM and haptics are untouched. */
export type EnergyMode = "calm" | "immersive" | "hype";
export const ENERGY_MODES: readonly EnergyMode[] = ["calm", "immersive", "hype"];

/** A short, visual-only moment Nova can trigger. */
export type NovaMomentKind = "bloom" | "light-wave" | "encore";
export const NOVA_MOMENTS: readonly NovaMomentKind[] = ["bloom", "light-wave", "encore"];
export interface NovaMoment {
  kind: NovaMomentKind;
  /** Changes on every trigger so the same moment can replay. */
  key: number;
}

/** How long each Nova moment lasts on stage, in ms. */
export const NOVA_MOMENT_MS: Record<NovaMomentKind, number> = { bloom: 2600, "light-wave": 8000, encore: 12000 };

export type SensoryPreference = "light" | "watchHaptics" | "lyrics" | "reduceMotion";

export interface NovaToolHandlers {
  setConcertEnergy: (parameters: Record<string, unknown>) => string;
  triggerAuraMoment: (parameters: Record<string, unknown>) => string;
  setSensoryPreference: (parameters: Record<string, unknown>) => string;
  /** Blocking on the agent: the returned JSON is what Nova reasons about. */
  getConcertStatus: () => string;
}

export interface NovaToolDeps {
  setEnergyMode: (mode: EnergyMode) => void;
  triggerMoment: (kind: NovaMomentKind) => void;
  setPreference: (preference: SensoryPreference, value: boolean) => void;
  /** Real, current concert state. */
  status: () => Record<string, unknown>;
}

const PREFERENCES: readonly SensoryPreference[] = ["light", "watchHaptics", "lyrics", "reduceMotion"];

export function createNovaTools(deps: NovaToolDeps): NovaToolHandlers {
  return {
    setConcertEnergy: ({ level }) => {
      if (!ENERGY_MODES.includes(level as EnergyMode)) return `Unknown energy level: ${String(level)}`;
      deps.setEnergyMode(level as EnergyMode);
      return `Concert energy set to ${String(level)}.`;
    },
    triggerAuraMoment: ({ moment }) => {
      if (!NOVA_MOMENTS.includes(moment as NovaMomentKind)) return `Unknown moment: ${String(moment)}`;
      deps.triggerMoment(moment as NovaMomentKind);
      return `${String(moment)} moment started.`;
    },
    setSensoryPreference: (parameters) => {
      const changed = PREFERENCES.filter((p) => typeof parameters[p] === "boolean");
      changed.forEach((p) => deps.setPreference(p, parameters[p] as boolean));
      return changed.length ? `Updated: ${changed.map((p) => `${p}=${parameters[p]}`).join(", ")}.` : "No preference changed.";
    },
    getConcertStatus: () => JSON.stringify(deps.status()),
  };
}
