import { SelectableEntity, PositionKey } from '../types/lineup';

/**
 * Get the appropriate points to display for an entity
 * @param entity - The selectable entity (player or team)
 * @param hasGameStarted - Whether any game has started for the current week  
 * @param actualPoints - Actual points for this entity (if available)
 * @param currentSlotKey - The position key this entity is in
 * @param captainSlotKey - The designated captain slot key
 * @param captainMultiplier - The captain point multiplier
 * @returns Object with points value and display type
 */
export function getEntityDisplayPoints(
  entity: SelectableEntity,
  hasGameStarted: boolean,
  actualPoints?: number,
  currentSlotKey?: PositionKey,
  captainSlotKey?: PositionKey | null,
  captainMultiplier?: number
): {
  points: number;
  type: 'ppg' | 'actual';
  label: string;
  isCaptain: boolean;
} {
  const isCaptain = !!(currentSlotKey && captainSlotKey && currentSlotKey === captainSlotKey && entity.entityType === 'player');
  
  let basePoints: number;
  let type: 'ppg' | 'actual';
  let label: string;
  
  if (hasGameStarted) {
    basePoints = actualPoints || 0;
    type = 'actual';
    label = 'PTS';
  } else {
    basePoints = entity.actualPPG || 0;
    type = 'ppg';
    label = 'PPG';
  }
  
  // Apply captain multiplier if this entity is the captain
  const finalPoints = isCaptain && captainMultiplier ? basePoints * captainMultiplier : basePoints;
  
  return {
    points: finalPoints,
    type,
    label: isCaptain ? `${label} (⭐${captainMultiplier || 1.5}x)` : label,
    isCaptain,
  };
}

/**
 * Calculate captain bonus points
 * @param basePoints - Base points (PPG or actual)
 * @param captainMultiplier - Captain point multiplier (e.g., 1.5)
 * @returns Captain bonus points
 */
export function getCaptainBonusPoints(
  basePoints: number,
  captainMultiplier: number
): number {
  return basePoints * (captainMultiplier - 1);
}

/**
 * Get formatted display string for points with appropriate label
 * @param points - Points value
 * @param type - Display type ('ppg' or 'actual')
 * @param decimals - Number of decimal places (default 1)
 * @returns Formatted string like "12.5 PPG" or "8.0 PTS"
 */
export function formatPointsDisplay(
  points: number,
  type: 'ppg' | 'actual',
  decimals: number = 1
): string {
  const label = type === 'ppg' ? 'PPG' : 'PTS';
  return `${points.toFixed(decimals)} ${label}`;
}
