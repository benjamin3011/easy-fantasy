/**
 * Lineup Visibility Service
 * 
 * Handles the progressive reveal logic for viewing other league members' lineups.
 * Players/teams are revealed as their individual games start (kickoff time).
 * 
 * Progressive Reveal Rules:
 * - Before game starts: Show position + "🔒 Hidden until kickoff"
 * - After game starts: Show player/team name + live scoring
 * - Captain picks are highlighted with multiplier
 * - Usage counts are always visible
 */

// Import from services since types/lineup doesn't have these exports
// These types are defined in the lineupFetchingService
export interface FirestoreWeeklySchedule {
  season: number;
  week: number;
  games: GameInfoForWeek[];
  lastUpdated: Date;
}

export interface GameInfoForWeek {
  gameID: string;
  seasonType?: string;
  week?: string;
  gameDate?: string;
  gameTime_epoch?: string;
  teamIDHome: string;
  teamIDAway: string;
  home?: string;
  away?: string;
}

export interface LineupVisibilityResult {
  isVisible: boolean;
  reason: 'not_started' | 'game_started' | 'no_game_info';
  gameStartTime?: number; // epoch seconds
  timeUntilReveal?: number; // seconds until visible
}

export interface VisibleLineupSlot {
  position: string;
  isVisible: boolean;
  entity?: {
    id: string;
    name: string;
    type: 'player' | 'team';
    teamAbbreviation: string;
    actualPoints?: number;
    usageCount: number;
  };
  isCaptain: boolean;
  gameStartTime?: number;
  timeUntilReveal?: number;
}

export interface MemberLineupVisibility {
  userId: string;
  userName: string;
  teamName: string;
  slots: VisibleLineupSlot[];
  totalVisiblePoints: number;
  totalPossiblePoints: number; // If all slots were visible
  completionPercentage: number; // 0-100, how much of lineup is set
  lastUpdated?: Date;
}

/**
 * Check if a specific player/team should be visible based on their game start time
 */
export function checkEntityVisibility(
  _entityId: string, // Prefixed with underscore to indicate intentionally unused
  _entityType: 'player' | 'team', // Prefixed with underscore to indicate intentionally unused
  gameId?: string,
  weeklySchedule?: FirestoreWeeklySchedule | null,
  currentTime: number = Math.floor(Date.now() / 1000)
): LineupVisibilityResult {
  // If no game info available, default to not visible
  if (!weeklySchedule || !gameId) {
    return {
      isVisible: false,
      reason: 'no_game_info'
    };
  }

  // Find the specific game for this entity
  const game = weeklySchedule.games.find((g: GameInfoForWeek) => g.gameID === gameId);
  
  if (!game || !game.gameTime_epoch) {
    return {
      isVisible: false,
      reason: 'no_game_info'
    };
  }

  const gameStartTime = parseInt(game.gameTime_epoch);
  const timeUntilReveal = gameStartTime - currentTime;

  // Game has started - entity is visible
  if (currentTime >= gameStartTime) {
    return {
      isVisible: true,
      reason: 'game_started',
      gameStartTime
    };
  }

  // Game hasn't started - entity is hidden
  return {
    isVisible: false,
    reason: 'not_started',
    gameStartTime,
    timeUntilReveal
  };
}

/**
 * Process a complete lineup to determine visibility for each slot
 */
export function processLineupVisibility(
  lineup: any, // StoredLineupData or similar
  weeklySchedule: FirestoreWeeklySchedule | null,
  currentTime: number = Math.floor(Date.now() / 1000)
): VisibleLineupSlot[] {
  const slots: VisibleLineupSlot[] = [];
  
  if (!lineup || !lineup.picks) {
    return slots;
  }

  // Process each position slot
  Object.entries(lineup.picks).forEach(([position, pick]: [string, any]) => {
    if (!pick) {
      // Empty slot
      slots.push({
        position,
        isVisible: true, // Empty slots are always "visible" (shown as empty)
        isCaptain: false
      });
      return;
    }

    // Check visibility for this pick
    const visibility = checkEntityVisibility(
      pick.id,
      pick.type,
      pick.gameId,
      weeklySchedule,
      currentTime
    );

    const slot: VisibleLineupSlot = {
      position,
      isVisible: visibility.isVisible,
      isCaptain: lineup.captainPlayerId === pick.id,
      gameStartTime: visibility.gameStartTime,
      timeUntilReveal: visibility.timeUntilReveal
    };

    // If visible, include entity details
    if (visibility.isVisible && pick.id) {
      slot.entity = {
        id: pick.id,
        name: pick.name || 'Unknown',
        type: pick.type,
        teamAbbreviation: pick.teamAbbreviation || '',
        actualPoints: pick.actualFantasyPoints,
        usageCount: 0 // Will be populated by calling component
      };
    }

    slots.push(slot);
  });

  return slots;
}

/**
 * Calculate lineup statistics for visibility display
 */
export function calculateLineupStats(slots: VisibleLineupSlot[]): {
  totalVisiblePoints: number;
  totalPossiblePoints: number;
  completionPercentage: number;
  visibleSlots: number;
  totalSlots: number;
} {
  let totalVisiblePoints = 0;
  let totalPossiblePoints = 0;
  let filledSlots = 0;
  let visibleSlots = 0;
  
  slots.forEach(slot => {
    if (slot.entity) {
      filledSlots++;
      
      if (slot.isVisible && slot.entity.actualPoints) {
        const points = slot.entity.actualPoints;
        const multiplier = slot.isCaptain ? 1.5 : 1;
        
        totalVisiblePoints += points * multiplier;
        visibleSlots++;
      }
      
      // For possible points, we'd need projected points (not implemented yet)
      // totalPossiblePoints += (projectedPoints || 0) * multiplier;
    }
  });

  return {
    totalVisiblePoints,
    totalPossiblePoints,
    completionPercentage: Math.round((filledSlots / slots.length) * 100),
    visibleSlots,
    totalSlots: slots.length
  };
}

/**
 * Get time until next reveal for a lineup
 */
export function getNextRevealTime(slots: VisibleLineupSlot[]): {
  nextRevealTime?: number;
  slotsToReveal: number;
} {
  const hiddenSlots = slots.filter(slot => !slot.isVisible && slot.timeUntilReveal);
  
  if (hiddenSlots.length === 0) {
    return { slotsToReveal: 0 };
  }

  // Find the earliest reveal time
  const nextRevealTime = Math.min(
    ...hiddenSlots.map(slot => slot.gameStartTime || Infinity)
  );

  const slotsToReveal = hiddenSlots.filter(
    slot => slot.gameStartTime === nextRevealTime
  ).length;

  return {
    nextRevealTime: nextRevealTime === Infinity ? undefined : nextRevealTime,
    slotsToReveal
  };
}

/**
 * Format time until reveal for display
 */
export function formatTimeUntilReveal(seconds: number): string {
  if (seconds <= 0) return 'Starting now';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return '<1m';
  }
}

/**
 * Get display text for locked slots
 */
export function getLockedSlotText(position: string, timeUntilReveal?: number): string {
  const positionEmojis: Record<string, string> = {
    'QB': '🏈',
    'RB': '🏃‍♂️',
    'WR': '🙌',
    'TE': '💪',
    'PASSING_OFFENSE': '📈',
    'RUSHING_OFFENSE': '🚀',
    'DEFENSE': '🛡️',
    'SPECIAL_TEAMS': '⚡'
  };

  const emoji = positionEmojis[position] || '🔒';
  
  if (timeUntilReveal && timeUntilReveal > 0) {
    const timeText = formatTimeUntilReveal(timeUntilReveal);
    return `${emoji} Reveals in ${timeText}`;
  }
  
  return `${emoji} Hidden until kickoff`;
}

/**
 * Sort games by start time for progressive reveal display
 */
export function sortGamesByStartTime(games: GameInfoForWeek[]): GameInfoForWeek[] {
  return [...games].sort((a, b) => {
    const timeA = parseInt(a.gameTime_epoch || '0');
    const timeB = parseInt(b.gameTime_epoch || '0');
    return timeA - timeB;
  });
}

/**
 * Group lineup slots by their reveal time for display organization
 */
export function groupSlotsByRevealTime(slots: VisibleLineupSlot[]): {
  visible: VisibleLineupSlot[];
  revealGroups: { time: number; slots: VisibleLineupSlot[] }[];
} {
  const visible = slots.filter(slot => slot.isVisible);
  const hidden = slots.filter(slot => !slot.isVisible);
  
  // Group hidden slots by their reveal time
  const revealGroups: { time: number; slots: VisibleLineupSlot[] }[] = [];
  
  hidden.forEach(slot => {
    if (!slot.gameStartTime) return;
    
    let group = revealGroups.find(g => g.time === slot.gameStartTime);
    if (!group) {
      group = { time: slot.gameStartTime, slots: [] };
      revealGroups.push(group);
    }
    group.slots.push(slot);
  });
  
  // Sort groups by reveal time
  revealGroups.sort((a, b) => a.time - b.time);
  
  return { visible, revealGroups };
}