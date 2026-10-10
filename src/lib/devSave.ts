import type { InteractionCue, LyricLine } from "../types/performance";

export type DevSaveRequest =
  | { kind: "beat"; file: string; bpm: number; anchor: number }
  | { kind: "interactions"; file: string; interactions: InteractionCue[] }
  | { kind: "lyrics"; file: string; lyrics: LyricLine[] };

/**
 * DEV only: writes a calibration into a track data file through the dev server
 * (see devCalibrationSave in vite.config.ts). Resolves with the file written; rejects with a reason.
 */
export async function devSave(request: DevSaveRequest): Promise<string> {
  const response = await fetch("/__aurabeat/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const result = (await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }))) as {
    ok: boolean;
    file?: string;
    error?: string;
  };
  if (!result.ok) throw new Error(result.error ?? "Save failed");
  return result.file ?? request.file;
}
