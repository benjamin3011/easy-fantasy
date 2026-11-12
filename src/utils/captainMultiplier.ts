/**
 * Captain-Faktor einer Liga (Liga-Einstellung, 1–3), wie in der Punkteberechnung
 * (functions/src/lineupProcessing.ts, Helfer functions/src/captain.ts):
 * - `enableCaptainFeature` nicht `true` → 1.0
 * - `captainPointMultiplier` fehlt oder ist keine endliche Zahl → 1.0
 * - sonst der Liga-Wert
 */
export const NO_CAPTAIN_MULTIPLIER = 1.0;

export function getCaptainMultiplier(
  league: { enableCaptainFeature?: boolean | null; captainPointMultiplier?: number | null } | null | undefined
): number {
  if (league?.enableCaptainFeature !== true) return NO_CAPTAIN_MULTIPLIER;
  const value = league.captainPointMultiplier;
  return typeof value === 'number' && Number.isFinite(value) ? value : NO_CAPTAIN_MULTIPLIER;
}
