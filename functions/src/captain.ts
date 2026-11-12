// src/captain.ts
// Reine Hilfsfunktionen rund um den Captain-Faktor (Liga-Einstellung, 1–3).

/** Rückfall für alte Ligen ohne gespeicherten Captain-Faktor. */
export const DEFAULT_CAPTAIN_MULTIPLIER = 1.5;

/** Captain-Faktor einer Liga; fehlt er oder ist ungültig, gilt 1.5. */
export function getCaptainMultiplier(
  league: { captainPointMultiplier?: unknown } | null | undefined
): number {
  const value = league?.captainPointMultiplier;
  return typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_CAPTAIN_MULTIPLIER;
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
