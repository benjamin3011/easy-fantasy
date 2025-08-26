import React, { useState } from 'react';
import { useLineupStore } from '../../store/lineupStore';
import { PositionKey, SelectableEntity } from '../../types/lineup';
import { POSITIONS_CONFIG } from '../../config/positions';
import { 
  fetchSelectablePlayers, 
  fetchSelectableTeams, 
  fetchStoredWeeklyLineup
} from '../../services/lineupFetchingService';
import { isEntityGameLocked } from '../../utils/gameLockHelper';

interface SimpleQuickActionsProps {
  currentWeek: number;
  currentSeason: number;
}

// Helper function to get effective PPG with fallbacks for Week 1
const getEffectivePPG = (entity: SelectableEntity): number => {
  // Primary: Use actual PPG if available
  if (entity.actualPPG > 0) {
    return entity.actualPPG;
  }
  
  // Fallback 1: Calculate from season stats (for returning players)
  if (entity.entityType === 'player' && entity.rawSeasonStats) {
    const seasonFPString = entity.rawSeasonStats.fantasyPointsDefault?.standard;
    const gamesPlayedString = entity.rawSeasonStats.gamesPlayed;
    
    if (seasonFPString && gamesPlayedString) {
      const seasonFP = typeof seasonFPString === 'string' ? parseFloat(seasonFPString) : seasonFPString;
      const gamesPlayed = typeof gamesPlayedString === 'string' ? parseInt(gamesPlayedString) : gamesPlayedString;
      
      if (seasonFP > 0 && gamesPlayed > 0) {
        return seasonFP / gamesPlayed;
      }
    }
  }
  
  // Fallback 2: Position-based defaults for Week 1
  if (entity.entityType === 'player') {
    const positionDefaults = {
      'QB': 18,
      'RB': 12,
      'WR': 10,
      'TE': 8
    };
    return positionDefaults[entity.position as keyof typeof positionDefaults] || 8;
  }
  
  // Fallback 3: Team defaults with position-specific scoring
  if (entity.entityType === 'team') {
    const seasonFP_Defense = entity.seasonFP_Defense || 0;
    const seasonFP_Passing = entity.seasonFP_Passing || 0;
    const seasonFP_Rushing = entity.seasonFP_Rushing || 0;
    const seasonFP_ST = entity.seasonFP_ST || 0;
    
    if (seasonFP_Defense > 0) return seasonFP_Defense / 17;
    if (seasonFP_Passing > 0) return seasonFP_Passing / 17;
    if (seasonFP_Rushing > 0) return seasonFP_Rushing / 17;
    if (seasonFP_ST > 0) return seasonFP_ST / 17;
    
    if (entity.seasonRecord) {
      const wins = Number(entity.seasonRecord.wins) || 0;
      const losses = Number(entity.seasonRecord.losses) || 0;
      const ties = Number(entity.seasonRecord.ties) || 0;
      const totalGames = wins + losses + ties;
      if (totalGames > 0) {
        const winPct = wins / totalGames;
        return 6 + (winPct * 6);
      }
    }
    return 8;
  }
  return 1;
};

const SimpleQuickActions: React.FC<SimpleQuickActionsProps> = ({
  currentWeek,
  currentSeason
}) => {
  const { 
    lineup, 
    usageCounts, 
    weeklySchedule, 
    userId, 
    leagueId,
    designatedCaptainSlotKey,
    selectedCaptainPlayerIdForSave,
    setLineup,
    setCaptain,
    setSaveStatus
  } = useLineupStore();
  
  const [isRandomizing, setIsRandomizing] = useState(false);
  const [isCopyingFromLastWeek, setIsCopyingFromLastWeek] = useState(false);
  const [undoSnapshot, setUndoSnapshot] = useState<{
    lineup: Record<PositionKey, SelectableEntity | undefined>;
    captainSlot: PositionKey | null;
    captainId: string | null;
  } | null>(null);
  const [showUndo, setShowUndo] = useState(false);
  const [undoTimeoutId, setUndoTimeoutId] = useState<number | null>(null);

  const filledSlots = Object.values(lineup).filter(entity => entity !== undefined).length;
  const totalSlots = POSITIONS_CONFIG.length;
  const missingCount = totalSlots - filledSlots;
  const hasSelections = filledSlots > 0;
  const isWeek1 = currentWeek === 1;
  const isDisabled = isRandomizing || isCopyingFromLastWeek;

  const getBestCaptainCandidate = (
    lm: Partial<Record<PositionKey, SelectableEntity | undefined>>
  ): { slot: PositionKey | null; id: string | null } => {
    let best: { slot: PositionKey | null; id: string | null; score: number } = { slot: null, id: null, score: -Infinity };
    for (const pos of POSITIONS_CONFIG) {
      const ent = lm[pos.key];
      if (ent && ent.entityType === 'player') {
        const score = getEffectivePPG(ent);
        if (score > best.score) {
          best = { slot: pos.key as PositionKey, id: ent.id, score };
        }
      }
    }
    return { slot: best.slot, id: best.id };
  };

  const startUndoWindow = () => {
    setShowUndo(true);
    if (undoTimeoutId) window.clearTimeout(undoTimeoutId);
    const id = window.setTimeout(() => setShowUndo(false), 7000);
    setUndoTimeoutId(id);
  };

  const handleUndo = () => {
    if (undoSnapshot) {
      setLineup(undoSnapshot.lineup);
      if (undoSnapshot.captainSlot && undoSnapshot.captainId) {
        setCaptain(undoSnapshot.captainSlot, undoSnapshot.captainId);
      }
      setUndoSnapshot(null);
      setShowUndo(false);
      if (undoTimeoutId) {
        window.clearTimeout(undoTimeoutId);
        setUndoTimeoutId(null);
      }
      setSaveStatus('idle', null, 'Changes undone.');
    }
  };

  const handleRandomizeLineup = async () => {
    if (!usageCounts || !weeklySchedule) {
      setSaveStatus('error', "Cannot randomize lineup - missing data.");
      return;
    }

    setIsRandomizing(true);
    setSaveStatus('idle');

    try {
      // Snapshot for undo
      setUndoSnapshot({
        lineup: { ...(lineup as Record<PositionKey, SelectableEntity | undefined>) },
        captainSlot: designatedCaptainSlotKey,
        captainId: selectedCaptainPlayerIdForSave,
      });

      const randomizedLineup: Partial<Record<PositionKey, SelectableEntity | undefined>> = {};
      const selectedTeamIds = new Set<string>();
      POSITIONS_CONFIG.forEach(positionDetail => {
        const currentEntity = lineup[positionDetail.key];
        if (currentEntity && isEntityGameLocked(currentEntity)) {
          randomizedLineup[positionDetail.key] = currentEntity;
          if (currentEntity.entityType === 'team') {
            selectedTeamIds.add(currentEntity.id);
          }
        }
      });

      for (const positionDetail of POSITIONS_CONFIG) {
        try {
          const positionKey = positionDetail.key as PositionKey;
          const currentEntity = lineup[positionKey];

          // Skip if this position is already locked
          if (currentEntity && isEntityGameLocked(currentEntity)) {
            continue;
          }

          let availableEntities: SelectableEntity[] = [];
          availableEntities = positionDetail.type === 'player'
            ? await fetchSelectablePlayers(positionKey, usageCounts, weeklySchedule)
            : await fetchSelectableTeams(positionKey, usageCounts, weeklySchedule);

          const eligibleEntities = availableEntities
            .filter(entity => {
              if (entity.usageCount >= 5) return false;
              if (entity.byeWeek === currentWeek) return false;
              if (entity.entityType === 'team' && selectedTeamIds.has(entity.id)) return false;
              return true;
            })
            .sort((a, b) => {
              if (a.entityType === 'player') {
                return getEffectivePPG(b) - getEffectivePPG(a);
              } else {
                // For teams, prioritize by season record and then by position-specific fantasy points
                if (a.entityType === 'team' && b.entityType === 'team') {
                  const aRecord = a.seasonRecord;
                  const bRecord = b.seasonRecord;
                  
                  if (aRecord && bRecord) {
                    const aWins = Number(aRecord.wins) || 0;
                    const aLosses = Number(aRecord.losses) || 0;
                    const aTies = Number(aRecord.ties) || 0;
                    const aTotalGames = aWins + aLosses + aTies;
                    const aWinPct = aTotalGames > 0 ? aWins / aTotalGames : 0;
                    
                    const bWins = Number(bRecord.wins) || 0;
                    const bLosses = Number(bRecord.losses) || 0;
                    const bTies = Number(bRecord.ties) || 0;
                    const bTotalGames = bWins + bLosses + bTies;
                    const bWinPct = bTotalGames > 0 ? bWins / bTotalGames : 0;
                    
                    if (aWinPct !== bWinPct) {
                      return bWinPct - aWinPct;
                    }
                  }
                }
                
                // Fallback to fantasy points
                return getEffectivePPG(b) - getEffectivePPG(a);
              }
            });

          if (eligibleEntities.length > 0) {
            const selectedEntity = eligibleEntities[0];
            randomizedLineup[positionKey] = selectedEntity;
            if (selectedEntity.entityType === 'team') selectedTeamIds.add(selectedEntity.id);
          }
        } catch (error) {
          console.warn(`Failed to randomize position ${positionDetail.key}:`, error);
        }
      }

      const lockedCount = POSITIONS_CONFIG.filter(pos => {
        const entity = lineup[pos.key];
        return entity && isEntityGameLocked(entity);
      }).length;
      const randomizedCount = POSITIONS_CONFIG.length - lockedCount;
      setLineup(randomizedLineup);

      // Auto-select captain if current is invalid after randomize
      const captainStillValid = selectedCaptainPlayerIdForSave && Object.values(randomizedLineup).some(e => e && e.entityType === 'player' && e.id === selectedCaptainPlayerIdForSave);
      if (!captainStillValid) {
        const { slot, id } = getBestCaptainCandidate(randomizedLineup);
        if (slot && id) setCaptain(slot, id);
      }

      if (lockedCount > 0) {
        setSaveStatus('idle', null, `Randomized ${randomizedCount} positions. ${lockedCount} locked positions kept.`);
      } else {
        setSaveStatus('idle', null, "Lineup randomized successfully!");
      }

      startUndoWindow();
    } catch (error) {
      console.error("Error randomizing lineup:", error);
      setSaveStatus('error', "Failed to randomize lineup.");
    } finally {
      setIsRandomizing(false);
    }
  };

  const handleOptimizeLineup = async () => {
    if (!usageCounts || !weeklySchedule) {
      setSaveStatus('error', "Cannot optimize lineup - missing data.");
      return;
    }

    setIsRandomizing(true); // Reuse the randomizing state for optimize
    setSaveStatus('idle');

    try {
      // Snapshot for undo
      setUndoSnapshot({
        lineup: { ...(lineup as Record<PositionKey, SelectableEntity | undefined>) },
        captainSlot: designatedCaptainSlotKey,
        captainId: selectedCaptainPlayerIdForSave,
      });

      const optimizedLineup: Partial<Record<PositionKey, SelectableEntity | undefined>> = {};
      const fillOnlyMissing = missingCount > 0; // Determine if we're filling only missing slots
      let newlyFilledCount = 0;

      // Base lineup that we will output. If filling only missing, start with current lineup.
      // Otherwise, start with an empty lineup to be fully optimized.
      const baseLineup: Record<PositionKey, SelectableEntity | undefined> = fillOnlyMissing
        ? ({ ...(lineup as Record<PositionKey, SelectableEntity | undefined>) })
        : ({} as Record<PositionKey, SelectableEntity | undefined>);

      // Track team IDs already in use to avoid duplicates (consider all current picks when filling missing)
      const selectedTeamIds = new Set<string>();
      POSITIONS_CONFIG.forEach(positionDetail => {
        const currentEntity = lineup[positionDetail.key];
        if (currentEntity) {
          if (currentEntity.entityType === 'team') selectedTeamIds.add(currentEntity.id);
        }
        // Always preserve locked entities into the base/optimized structure
        if (currentEntity && isEntityGameLocked(currentEntity)) {
          optimizedLineup[positionDetail.key] = currentEntity;
          baseLineup[positionDetail.key as PositionKey] = currentEntity; // Ensure locked are in baseLineup too
        }
      });

      for (const positionDetail of POSITIONS_CONFIG) {
        try {
          const positionKey = positionDetail.key as PositionKey;
          const currentEntity = lineup[positionKey];

          // Skip if this position is already locked
          if (currentEntity && isEntityGameLocked(currentEntity)) {
            continue;
          }
          // If filling only missing slots, skip positions that already have a pick (and are not locked)
          if (fillOnlyMissing && currentEntity && !isEntityGameLocked(currentEntity)) {
            continue;
          }

          let availableEntities: SelectableEntity[] = [];
          availableEntities = positionDetail.type === 'player'
            ? await fetchSelectablePlayers(positionKey, usageCounts, weeklySchedule)
            : await fetchSelectableTeams(positionKey, usageCounts, weeklySchedule);

          const eligibleEntities = availableEntities
            .filter(entity => {
              if (entity.usageCount >= 5) return false;
              if (entity.byeWeek === currentWeek) return false;
              if (entity.entityType === 'team' && selectedTeamIds.has(entity.id)) return false;
              return true;
            })
            .sort((a, b) => {
              if (a.entityType === 'player') {
                return getEffectivePPG(b) - getEffectivePPG(a);
              } else {
                // For teams, prioritize by season record and then by position-specific fantasy points
                if (a.entityType === 'team' && b.entityType === 'team') {
                  const aRecord = a.seasonRecord;
                  const bRecord = b.seasonRecord;
                  
                  if (aRecord && bRecord) {
                    const aWins = Number(aRecord.wins) || 0;
                    const aLosses = Number(aRecord.losses) || 0;
                    const aTies = Number(aRecord.ties) || 0;
                    const aTotalGames = aWins + aLosses + aTies;
                    const aWinPct = aTotalGames > 0 ? aWins / aTotalGames : 0;
                    
                    const bWins = Number(bRecord.wins) || 0;
                    const bLosses = Number(bRecord.losses) || 0;
                    const bTies = Number(bRecord.ties) || 0;
                    const bTotalGames = bWins + bLosses + bTies;
                    const bWinPct = bTotalGames > 0 ? bWins / bTotalGames : 0;
                    
                    if (aWinPct !== bWinPct) {
                      return bWinPct - aWinPct;
                    }
                  }
                }
                
                // Fallback to fantasy points
                return getEffectivePPG(b) - getEffectivePPG(a);
              }
            });

          if (eligibleEntities.length > 0) {
            const selectedEntity = eligibleEntities[0];
            // When filling only missing, write into baseLineup; otherwise into optimized structure
            if (fillOnlyMissing) {
              // Only fill if the slot is currently empty or not locked
              if (!baseLineup[positionKey] || !isEntityGameLocked(baseLineup[positionKey])) {
                baseLineup[positionKey] = selectedEntity;
                newlyFilledCount++;
              }
            } else {
              optimizedLineup[positionKey] = selectedEntity;
            }
            if (selectedEntity.entityType === 'team') selectedTeamIds.add(selectedEntity.id);
          }
        } catch (error) {
          console.warn(`Failed to optimize position ${positionDetail.key}:`, error);
        }
      }

      const finalLineup = (fillOnlyMissing ? baseLineup : optimizedLineup) as Partial<Record<PositionKey, SelectableEntity | undefined>>;
      setLineup(finalLineup);

      // Captain handling: keep current if still present, else select best
      const captainStillValid = selectedCaptainPlayerIdForSave && Object.values(finalLineup).some(e => e && e.entityType === 'player' && e.id === selectedCaptainPlayerIdForSave);
      if (!captainStillValid) {
        const { slot, id } = getBestCaptainCandidate(finalLineup);
        if (slot && id) setCaptain(slot, id);
      }

      if (fillOnlyMissing) {
        setSaveStatus('idle', null, newlyFilledCount > 0 ? `Filled ${newlyFilledCount} missing slot${newlyFilledCount === 1 ? '' : 's'}.` : 'No eligible picks found to fill missing slots.');
      } else {
        const lockedCount = POSITIONS_CONFIG.filter(pos => {
          const entity = lineup[pos.key];
          return entity && isEntityGameLocked(entity);
        }).length;
        const optimizedCount = POSITIONS_CONFIG.length - lockedCount;
        if (lockedCount > 0) {
          setSaveStatus('idle', null, `Optimized ${optimizedCount} positions. ${lockedCount} locked positions kept.`);
        } else {
          setSaveStatus('idle', null, "Lineup optimized for highest projected points!");
        }
      }

      startUndoWindow();
    } catch (error) {
      console.error("Error optimizing lineup:", error);
      setSaveStatus('error', "Failed to optimize lineup.");
    } finally {
      setIsRandomizing(false);
    }
  };

  const handleCopyFromLastWeek = async () => {
    if (!userId || !leagueId) {
      setSaveStatus('error', "Cannot copy from last week - missing user or league data.");
      return;
    }

    setIsCopyingFromLastWeek(true);
    setSaveStatus('idle');

    try {
      const lastWeek = currentWeek - 1;
      if (lastWeek < 1) {
        setSaveStatus('error', "Cannot copy from Week 0 or earlier.");
        return;
      }

      const lastWeekLineup = await fetchStoredWeeklyLineup(userId, leagueId, lastWeek, currentSeason);
      if (!lastWeekLineup || Object.keys(lastWeekLineup).length === 0) {
        setSaveStatus('error', "No lineup found from last week to copy.");
        return;
      }

      // Filter out entities that are locked for this week
      const filteredLineup: Partial<Record<PositionKey, SelectableEntity | undefined>> = {};
      Object.entries(lastWeekLineup).forEach(([positionKey, entity]) => {
        if (entity && !isEntityGameLocked(entity)) {
          filteredLineup[positionKey as PositionKey] = entity;
        }
      });

      if (Object.keys(filteredLineup).length === 0) {
        setSaveStatus('error', "All last week's picks are locked for this week.");
        return;
      }

      setLineup(filteredLineup);
      setSaveStatus('idle', null, `Copied ${Object.keys(filteredLineup).length} picks from Week ${lastWeek}.`);
    } catch (error) {
      console.error("Error copying from last week:", error);
      setSaveStatus('error', "Failed to copy from last week.");
    } finally {
      setIsCopyingFromLastWeek(false);
    }
  };

  const handleClearAllSlots = () => {
    const unlockedLineup: Partial<Record<PositionKey, SelectableEntity | undefined>> = {};
    
    // Keep only locked entities
    POSITIONS_CONFIG.forEach(positionDetail => {
      const currentEntity = lineup[positionDetail.key];
      if (currentEntity && isEntityGameLocked(currentEntity)) {
        unlockedLineup[positionDetail.key] = currentEntity;
      }
    });

    setLineup(unlockedLineup);
    setSaveStatus('idle', null, "Cleared all unlocked slots.");
  };

  return (
    <>
      {/* Mobile: Compact Horizontal Scrollable Row */}
      <div className="block sm:hidden">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Quick Actions:
          </h3>
        </div>
        <div className="relative">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-white dark:from-gray-900 to-transparent pointer-events-none z-10" />
            <button
              onClick={filledSlots === 0 ? handleRandomizeLineup : handleOptimizeLineup}
              disabled={isDisabled}
              className="flex items-center gap-1.5 px-3 py-2 bg-brand-500 hover:bg-brand-600 disabled:bg-gray-400 text-white rounded-md transition-colors text-xs font-medium whitespace-nowrap"
            >
              {isRandomizing ? (
                <>
                  <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                  {filledSlots === 0 ? 'Picking...' : 'Optimizing...'}
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  {filledSlots === 0 ? '🎲 Quick Pick' : `⚡ Optimize${missingCount > 0 ? ` (fill ${missingCount})` : ''}`}
                </>
              )}
            </button>
            <button
              onClick={handleRandomizeLineup}
              disabled={isDisabled}
              className="flex items-center gap-1.5 px-3 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-400 text-white rounded-md transition-colors text-xs font-medium whitespace-nowrap"
            >
              {isRandomizing ? (
                <>
                  <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                  Randomizing...
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  🎲 Randomize
                </>
              )}
            </button>
            {!isWeek1 && (
              <button
                onClick={handleCopyFromLastWeek}
                disabled={isDisabled}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-md transition-colors text-xs font-medium whitespace-nowrap"
              >
                {isCopyingFromLastWeek ? (
                  <>
                    <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                    Copying...
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    📋 Copy Week
                  </>
                )}
              </button>
            )}
            {hasSelections && (
              <button
                onClick={handleClearAllSlots}
                disabled={isDisabled}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white rounded-md transition-colors text-xs font-medium whitespace-nowrap"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                🗑️ Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden sm:block bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Quick Actions
          </h3>
        </div>

        {/* Desktop Action Buttons */}
        <div className="flex flex-wrap gap-2">
          {/* Quick Pick / Optimize */}
          <button
            onClick={filledSlots === 0 ? handleRandomizeLineup : handleOptimizeLineup}
            disabled={isDisabled}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:bg-gray-400 text-white rounded-lg transition-colors text-sm font-medium"
          >
            {isRandomizing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                {filledSlots === 0 ? 'Picking...' : 'Optimizing...'}
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {filledSlots === 0 ? 'Quick Pick' : 'Optimize Lineup'}
              </>
            )}
          </button>

          {/* Randomize */}
          <button
            onClick={handleRandomizeLineup}
            disabled={isDisabled}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-400 text-white rounded-lg transition-colors text-sm font-medium"
          >
            {isRandomizing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Randomizing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Randomize
              </>
            )}
          </button>

          {/* Copy from Last Week */}
          {!isWeek1 && (
            <button
              onClick={handleCopyFromLastWeek}
              disabled={isDisabled}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg transition-colors text-sm font-medium"
            >
              {isCopyingFromLastWeek ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Copying...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy Last Week
                </>
              )}
            </button>
          )}

          {/* Clear All */}
          {hasSelections && (
            <button
              onClick={handleClearAllSlots}
              disabled={isDisabled}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white rounded-lg transition-colors text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Clear All
            </button>
          )}
        </div>

        {/* Helper Text */}
        {filledSlots === 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              💡 Use <strong>Quick Pick</strong> to instantly fill your lineup with top performers
            </p>
          </div>
        )}
        
        {filledSlots > 0 && filledSlots < totalSlots && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              ⚡ Use <strong>Optimize</strong> to upgrade your current selections with better performers
            </p>
          </div>
        )}
      </div>

      {/* Undo Bar - Keep this functional improvement */}
      {showUndo && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between mt-4">
          <span className="text-blue-800 text-sm font-medium">
            Changes made! You can undo for 7 seconds.
          </span>
          <button
            onClick={handleUndo}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
          >
            Undo
          </button>
        </div>
      )}
    </>
  );
};

export default SimpleQuickActions; 