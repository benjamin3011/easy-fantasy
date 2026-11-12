/**
 * Captain-Faktor einer Liga (Liga-Einstellung, 1–3).
 * Alte Ligen ohne gespeicherten Wert fallen auf 1.5 zurück.
 */
export const DEFAULT_CAPTAIN_MULTIPLIER = 1.5;

export function getCaptainMultiplier(
  league: { captainPointMultiplier?: number | null } | null | undefined
): number {
  const value = league?.captainPointMultiplier;
  return typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_CAPTAIN_MULTIPLIER;
}
