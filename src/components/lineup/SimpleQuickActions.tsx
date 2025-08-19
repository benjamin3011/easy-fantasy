import React, { useState } from 'react';
import { useLineupStore } from '../../store/lineupStore';
import { PositionKey, SelectableEntity, SelectableTeam } from '../../types/lineup';
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
    // Check if team has any season fantasy points for specific positions
    const seasonFP_Defense = entity.seasonFP_Defense || 0;
    const seasonFP_Passing = entity.seasonFP_Passing || 0;
    const seasonFP_Rushing = entity.seasonFP_Rushing || 0;
    const seasonFP_ST = entity.seasonFP_ST || 0;
    
    // Use season stats if available, assume 17 games
    if (seasonFP_Defense > 0) return seasonFP_Defense / 17;
    if (seasonFP_Passing > 0) return seasonFP_Passing / 17;
    if (seasonFP_Rushing > 0) return seasonFP_Rushing / 17;
    if (seasonFP_ST > 0) return seasonFP_ST / 17;
    
    // Use team record to estimate quality if available
    if (entity.seasonRecord) {
      const wins = Number(entity.seasonRecord.wins) || 0;
      const losses = Number(entity.seasonRecord.losses) || 0;
      const ties = Number(entity.seasonRecord.ties) || 0;
      const totalGames = wins + losses + ties;
      
      if (totalGames > 0) {
        const winPct = wins / totalGames;
        // Better teams get higher baseline scores (6-12 range)
        return 6 + (winPct * 6);
      }
    }
    
    // Final fallback: Basic team unit default
    return 8;
  }
  
  return 1; // Minimum fallback
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
    setLineup,
    setSaveStatus
  } = useLineupStore();
  
  const [isRandomizing, setIsRandomizing] = useState(false);
  const [isCopyingFromLastWeek, setIsCopyingFromLastWeek] = useState(false);

  const filledSlots = Object.values(lineup).filter(entity => entity !== undefined).length;
  const totalSlots = POSITIONS_CONFIG.length;
  const hasSelections = filledSlots > 0;
  const isWeek1 = currentWeek === 1;
  const isDisabled = isRandomizing || isCopyingFromLastWeek;

  const handleRandomizeLineup = async () => {
    if (!usageCounts || !weeklySchedule) {
      setSaveStatus('error', "Cannot randomize lineup - missing data.");
      return;
    }

    setIsRandomizing(true);
    setSaveStatus('idle');

    try {
      const randomizedLineup: Partial<Record<PositionKey, SelectableEntity | undefined>> = {};
      const selectedTeamIds = new Set<string>(); // Track selected team IDs to prevent duplicates
      
      // First, preserve all locked entities and track their team IDs
      POSITIONS_CONFIG.forEach(positionDetail => {
        const currentEntity = lineup[positionDetail.key];
        if (currentEntity && isEntityGameLocked(currentEntity)) {
          randomizedLineup[positionDetail.key] = currentEntity;
          if (currentEntity.entityType === 'team') {
            selectedTeamIds.add(currentEntity.id);
          }
        }
      });
      
      // Randomize each unlocked position
      for (const positionDetail of POSITIONS_CONFIG) {
        try {
          const positionKey = positionDetail.key as PositionKey;
          
          // Skip if this position is already locked
          const currentEntity = lineup[positionKey];
          if (currentEntity && isEntityGameLocked(currentEntity)) {
            continue;
          }
          
          let availableEntities: SelectableEntity[] = [];
          
          if (positionDetail.type === 'player') {
            availableEntities = await fetchSelectablePlayers(positionKey, usageCounts, weeklySchedule);
          } else {
            availableEntities = await fetchSelectableTeams(positionKey, usageCounts, weeklySchedule);
          }
          
          // Filter out entities with max usage (5) and those with bye weeks
          // For teams: allow if they have either PPG > 0 OR season stats (for early season)
          const eligibleEntities = availableEntities.filter(entity => {
            if (entity.usageCount >= 5) return false;
            if (entity.byeWeek === currentWeek) return false;
            
            // For team positions: prevent selecting the same team twice
            if (entity.entityType === 'team' && selectedTeamIds.has(entity.id)) {
              return false;
            }
            
            // For players: use PPG if available, otherwise use fallback scoring
            if (entity.entityType === 'player') {
              // Week 1 fallback: Always allow players, effective PPG will handle scoring
              return true; // Always allow for Week 1, getEffectivePPG handles scoring
            }
            
            // For teams: Week 1 fallback - always allow teams, effective PPG will handle scoring
            if (entity.entityType === 'team') {
              return true; // Always allow for Week 1, getEffectivePPG handles scoring
            }
            
            return false;
          });
          
          if (eligibleEntities.length > 0) {
            // Weighted random selection favoring higher effective PPG
            const weights = eligibleEntities.map(entity => getEffectivePPG(entity));
            const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
            const randomValue = Math.random() * totalWeight;
            
            let currentWeight = 0;
            for (let i = 0; i < eligibleEntities.length; i++) {
              currentWeight += weights[i];
              if (randomValue <= currentWeight) {
                const selectedEntity = eligibleEntities[i];
                randomizedLineup[positionKey] = selectedEntity;
                
                // Track team ID to prevent duplicate team selections
                if (selectedEntity.entityType === 'team') {
                  selectedTeamIds.add(selectedEntity.id);
                }
                break;
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to randomize position ${positionDetail.key}:`, error);
        }
      }
      
      // Count locked vs randomized positions
      const lockedCount = POSITIONS_CONFIG.filter(pos => {
        const entity = lineup[pos.key];
        return entity && isEntityGameLocked(entity);
      }).length;
      
      const randomizedCount = POSITIONS_CONFIG.length - lockedCount;
      
      setLineup(randomizedLineup);
      
      if (lockedCount > 0) {
        setSaveStatus('idle', null, `Randomized ${randomizedCount} positions. ${lockedCount} locked positions kept.`);
      } else {
        setSaveStatus('idle', null, "Lineup randomized successfully!");
      }
      
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
      const optimizedLineup: Partial<Record<PositionKey, SelectableEntity | undefined>> = {};
      const selectedTeamIds = new Set<string>(); // Track selected team IDs to prevent duplicates
      
      // First, preserve all locked entities and track their team IDs
      POSITIONS_CONFIG.forEach(positionDetail => {
        const currentEntity = lineup[positionDetail.key];
        if (currentEntity && isEntityGameLocked(currentEntity)) {
          optimizedLineup[positionDetail.key] = currentEntity;
          if (currentEntity.entityType === 'team') {
            selectedTeamIds.add(currentEntity.id);
          }
        }
      });
      
      // Optimize each unlocked position by selecting highest PPG available
      for (const positionDetail of POSITIONS_CONFIG) {
        try {
          const positionKey = positionDetail.key as PositionKey;
          
          // Skip if this position is already locked
          const currentEntity = lineup[positionKey];
          if (currentEntity && isEntityGameLocked(currentEntity)) {
            continue;
          }
          
          let availableEntities: SelectableEntity[] = [];
          
          if (positionDetail.type === 'player') {
            availableEntities = await fetchSelectablePlayers(positionKey, usageCounts, weeklySchedule);
          } else {
            availableEntities = await fetchSelectableTeams(positionKey, usageCounts, weeklySchedule);
          }
          
          // Filter and sort by PPG
          // For teams: use a scoring system that considers season stats when PPG is 0
          const eligibleEntities = availableEntities
            .filter(entity => {
              if (entity.usageCount >= 5) return false;
              if (entity.byeWeek === currentWeek) return false;
              
              // For team positions: prevent selecting the same team twice
              if (entity.entityType === 'team' && selectedTeamIds.has(entity.id)) {
                return false;
              }
              
              // For players: use PPG if available, otherwise use fallback scoring
              if (entity.entityType === 'player') {
                // Week 1 fallback: Always allow players, effective PPG will handle scoring
                return true; // Always allow for Week 1, getEffectivePPG handles scoring
              }
              
              // For teams: Week 1 fallback - always allow teams, effective PPG will handle scoring
              if (entity.entityType === 'team') {
                return true; // Always allow for Week 1, getEffectivePPG handles scoring
              }
              
              return false;
            })
            .sort((a, b) => {
              // For teams with 0 PPG, use a basic ranking based on season stats
              if (a.entityType === 'team' && b.entityType === 'team' && a.actualPPG === 0 && b.actualPPG === 0) {
                // Simple fallback: prefer teams with better season records or more stats
                const teamA = a as SelectableTeam;
                const teamB = b as SelectableTeam;
                
                // If both have season records, prefer better win percentage
                if (teamA.seasonRecord && teamB.seasonRecord) {
                  const winsA = Number(teamA.seasonRecord.wins) || 0;
                  const lossesA = Number(teamA.seasonRecord.losses) || 0;
                  const tiesA = Number(teamA.seasonRecord.ties) || 0;
                  const winsB = Number(teamB.seasonRecord.wins) || 0;
                  const lossesB = Number(teamB.seasonRecord.losses) || 0;
                  const tiesB = Number(teamB.seasonRecord.ties) || 0;
                  
                  const totalGamesA = winsA + lossesA + tiesA;
                  const totalGamesB = winsB + lossesB + tiesB;
                  
                  if (totalGamesA > 0 && totalGamesB > 0) {
                    const winPctA = winsA / totalGamesA;
                    const winPctB = winsB / totalGamesB;
                    return winPctB - winPctA;
                  }
                }
                
                // Fallback to alphabetical
                return a.name.localeCompare(b.name);
              }
              
              // Use effective PPG (with fallbacks)
              return getEffectivePPG(b) - getEffectivePPG(a);
            });
          
          if (eligibleEntities.length > 0) {
            const selectedEntity = eligibleEntities[0];
            optimizedLineup[positionKey] = selectedEntity;
            
            // Track team ID to prevent duplicate team selections
            if (selectedEntity.entityType === 'team') {
              selectedTeamIds.add(selectedEntity.id);
            }
          }
        } catch (error) {
          console.warn(`Failed to optimize position ${positionDetail.key}:`, error);
        }
      }
      
      // Count locked vs optimized positions
      const lockedCount = POSITIONS_CONFIG.filter(pos => {
        const entity = lineup[pos.key];
        return entity && isEntityGameLocked(entity);
      }).length;
      
      const optimizedCount = POSITIONS_CONFIG.length - lockedCount;
      
      setLineup(optimizedLineup);
      
      if (lockedCount > 0) {
        setSaveStatus('idle', null, `Optimized ${optimizedCount} positions. ${lockedCount} locked positions kept.`);
      } else {
        setSaveStatus('idle', null, "Lineup optimized for highest projected points!");
      }
      
    } catch (error) {
      console.error("Error optimizing lineup:", error);
      setSaveStatus('error', "Failed to optimize lineup.");
    } finally {
      setIsRandomizing(false);
    }
  };

  const handleCopyFromLastWeek = async () => {
    if (!userId || !leagueId || currentWeek <= 1) {
      setSaveStatus('error', "Cannot copy from last week.");
      return;
    }

    setIsCopyingFromLastWeek(true);
    setSaveStatus('idle');

    try {
      const lastWeekData = await fetchStoredWeeklyLineup(userId, leagueId, currentWeek - 1, currentSeason);
      
      if (!lastWeekData || !lastWeekData.picks) {
        setSaveStatus('error', "No lineup found for last week.");
        setIsCopyingFromLastWeek(false);
        return;
      }

      // Reconstruct lineup with current week's data
      const reconstructedLineup: Partial<Record<PositionKey, SelectableEntity | undefined>> = {};
      
      // First, preserve all locked entities
      POSITIONS_CONFIG.forEach(positionDetail => {
        const currentEntity = lineup[positionDetail.key];
        if (currentEntity && isEntityGameLocked(currentEntity)) {
          reconstructedLineup[positionDetail.key] = currentEntity;
        }
      });
      
      for (const [posKey, pick] of Object.entries(lastWeekData.picks)) {
        if (pick) {
          try {
            let entity: SelectableEntity | null = null;
            
            if (pick.type === 'player') {
              const players = await fetchSelectablePlayers(posKey as PositionKey, usageCounts || undefined, weeklySchedule);
              entity = players.find(p => p.id === pick.id) || null;
            } else if (pick.type === 'team') {
              const teams = await fetchSelectableTeams(posKey as PositionKey, usageCounts || undefined, weeklySchedule);
              entity = teams.find(t => t.id === pick.id) || null;
            }
            
            if (entity) {
              // Only copy if the current position is not locked
              const currentEntity = lineup[posKey as PositionKey];
              if (!currentEntity || !isEntityGameLocked(currentEntity)) {
                reconstructedLineup[posKey as PositionKey] = entity;
              }
            }
          } catch (error) {
            console.warn(`Failed to load entity ${pick.id} for position ${posKey}:`, error);
          }
        }
      }

      // Count locked vs copied positions
      const lockedCount = POSITIONS_CONFIG.filter(pos => {
        const entity = lineup[pos.key];
        return entity && isEntityGameLocked(entity);
      }).length;
      
      const copiedCount = Object.keys(lastWeekData.picks).length - lockedCount;
      
      setLineup(reconstructedLineup);
      
      if (lockedCount > 0) {
        setSaveStatus('idle', null, `Copied ${copiedCount} positions from last week. ${lockedCount} locked positions kept.`);
      } else {
        setSaveStatus('idle', null, "Successfully copied lineup from last week!");
      }
      
    } catch (error) {
      console.error("Error copying from last week:", error);
      setSaveStatus('error', "Failed to copy lineup from last week.");
    } finally {
      setIsCopyingFromLastWeek(false);
    }
  };

  const handleClearAllSlots = () => {
    // Only clear unlocked slots
    const newLineup: Partial<Record<PositionKey, SelectableEntity | undefined>> = {};
    let clearedCount = 0;
    let lockedCount = 0;
    
    POSITIONS_CONFIG.forEach(position => {
      const entity = lineup[position.key];
      if (entity && isEntityGameLocked(entity)) {
        // Keep locked entities
        newLineup[position.key] = entity;
        lockedCount++;
      } else {
        // Clear unlocked entities
        newLineup[position.key] = undefined;
        if (entity) clearedCount++;
      }
    });
    
    setLineup(newLineup as Record<PositionKey, SelectableEntity | undefined>);
    
    if (lockedCount > 0) {
      setSaveStatus('idle', null, `Cleared ${clearedCount} slots. ${lockedCount} locked slots kept.`);
    } else {
      setSaveStatus('idle', null, "All lineup slots cleared.");
    }
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
            {/* Scroll hint gradient */}
            <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-white dark:from-gray-900 to-transparent pointer-events-none z-10" />
            
            {/* Mobile Compact Buttons */}
            {/* Quick Pick / Optimize */}
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
                  {filledSlots === 0 ? '🎲 Quick Pick' : '⚡ Optimize'}
                </>
              )}
            </button>

            {/* Randomize */}
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

            {/* Copy from Last Week */}
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

            {/* Clear All */}
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

      {/* Desktop: Original Card Layout */}
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
    </>
  );
};

export default SimpleQuickActions; 