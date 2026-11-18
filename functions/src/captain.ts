// src/captain.ts
// Reine Hilfsfunktionen rund um den Captain-Faktor (Liga-Einstellung, 1–3).

/** Faktor, wenn der Captain aus ist oder die Liga keinen gültigen Wert hat. */
export const NO_CAPTAIN_MULTIPLIER = 1.0;

/**
 * Captain-Faktor einer Liga, wie in der Punkteberechnung (lineupProcessing.ts):
 * - `enableCaptainFeature` nicht `true` → 1.0
 * - `captainPointMultiplier` fehlt oder ist keine endliche Zahl → 1.0
 * - sonst der Liga-Wert
 */
export function getCaptainMultiplier(
  league: { enableCaptainFeature?: unknown; captainPointMultiplier?: unknown } | null | undefined
): number {
  if (league?.enableCaptainFeature !== true) return NO_CAPTAIN_MULTIPLIER;
  const value = league.captainPointMultiplier;
  return typeof value === "number" && Number.isFinite(value) ? value : NO_CAPTAIN_MULTIPLIER;
}

/**
 * Prüft, ob gespeicherte Captain-Punkte zum Faktor der Liga passen.
 * Toleranz 0.1 wegen Rundung auf zwei Nachkommastellen.
 */
export function isCaptainPointsConsistent(
  captainBasePoints: number,
  captainMultipliedPoints: number,
  captainMultiplier: number
): boolean {
  const expectedMultiplied = captainBasePoints * captainMultiplier;
  return Math.abs(captainMultipliedPoints - expectedMultiplied) <= 0.1;
}
