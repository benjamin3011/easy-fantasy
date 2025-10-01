// Game locking utility functions
import type { SelectableEntity } from '../types/lineup';

/**
 * Check if a specific entity's game is locked (started or finished)
 * This should match the backend logic in lineupProcessing.ts
 */
export function isEntityGameLocked(entity: SelectableEntity): boolean {
  // If no game time available, default to not locked
  if (!entity.gameTimeEpochForWeek && !entity.gameTimeEpoch) {
    return false;
  }
  
  // Use week-specific game time if available, otherwise fall back to general game time
  const gameTimeEpoch = entity.gameTimeEpochForWeek || entity.gameTimeEpoch;
  
  if (!gameTimeEpoch) {
    return false;
  }
  
  // Game is locked if it has started (current time >= game time)
  const nowEpoch = Math.floor(Date.now() / 1000); // Convert to seconds
  const gameTimeSeconds = typeof gameTimeEpoch === 'string' 
    ? parseInt(gameTimeEpoch, 10) 
    : gameTimeEpoch;
    
  return gameTimeSeconds <= nowEpoch;
}

/**
 * Get a user-friendly message explaining why a lineup slot is locked
 */
export function getGameLockMessage(entity: SelectableEntity): string {
  if (!isEntityGameLocked(entity)) {
    return '';
  }
  
  const gameTimeEpoch = entity.gameTimeEpochForWeek || entity.gameTimeEpoch;
  if (!gameTimeEpoch) {
    return 'This game has started and lineup changes are locked.';
  }
  
  const gameTimeSeconds = typeof gameTimeEpoch === 'string' 
    ? parseInt(gameTimeEpoch, 10) 
    : gameTimeEpoch;
  const gameDate = new Date(gameTimeSeconds * 1000);
  
  return `This game started at ${gameDate.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    month: 'short', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false
  })} and lineup changes are locked.`;
}

/**
 * Check if captain selection should be locked
 * @deprecated Use getCaptainLockStatus instead for more detailed logic
 * Captain is locked if ANY player's game has started
 */
export function isCaptainSelectionLocked(lineup: Record<string, SelectableEntity | undefined>): boolean {
  // Get all player entities (not team entities)
  const playerEntities = Object.values(lineup).filter(entity => 
    entity && entity.entityType === 'player'
  ) as SelectableEntity[];
  
  // If any player's game is locked, captain selection is locked
  return playerEntities.some(entity => isEntityGameLocked(entity));
}

/**
 * Get lock status for captain selection with reason
 * Captain selection is locked if:
 * 1. No captain selected: Only show global lock if ALL players' games have started
 * 2. Captain selected: The captain's own game has started
 */
export function getCaptainLockStatus(
  lineup: Record<string, SelectableEntity | undefined>,
  currentCaptainSlotKey?: string | null
): {
  isLocked: boolean;
  message: string;
} {
  const playerEntities = Object.values(lineup).filter(entity => 
    entity && entity.entityType === 'player'
  ) as SelectableEntity[];
  
  // If no captain is currently selected, only lock if ALL players' games have started
  if (!currentCaptainSlotKey) {
    const lockedPlayers = playerEntities.filter(entity => isEntityGameLocked(entity));
    const availablePlayers = playerEntities.filter(entity => !isEntityGameLocked(entity));
    
    // Only lock captain selection if NO players are available (all games started)
    if (availablePlayers.length === 0 && lockedPlayers.length > 0) {
      return {
        isLocked: true,
        message: `Captain selection is locked because all players' games have started.`
      };
    }
    
    // If some players are still available, allow captain selection
    return {
      isLocked: false,
      message: ''
    };
  }
  
  // If a captain IS selected, only lock when the captain's game starts
  const captainEntity = lineup[currentCaptainSlotKey];
  if (captainEntity && captainEntity.entityType === 'player' && isEntityGameLocked(captainEntity)) {
    return {
      isLocked: true,
      message: `Captain selection is locked because your captain ${captainEntity.name}'s game has started.`
    };
  }
  
  return {
    isLocked: false,
    message: ''
  };
}
