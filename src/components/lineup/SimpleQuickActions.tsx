import React, { useState } from 'react';
import { useLineupStore } from '../../store/lineupStore';
import { PositionKey, SelectableEntity, SelectableTeam } from '../../types/lineup';
import { POSITIONS_CONFIG } from '../../config/positions';
import { 
  fetchSelectablePlayers, 
  fetchSelectableTeams, 
  fetchStoredWeeklyLineup
} from '../../services/lineupFetchingService';

interface SimpleQuickActionsProps {
  currentWeek: number;
  currentSeason: number;
}

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
  const [isOpen, setIsOpen] = useState(false);

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
      
      // Randomize each position
      for (const positionDetail of POSITIONS_CONFIG) {
        try {
          const positionKey = positionDetail.key as PositionKey;
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
            
            // For players: require PPG > 0
            if (entity.entityType === 'player') {
              return entity.actualPPG > 0;
            }
            
            // For teams: allow if PPG > 0 OR if they have season stats (early season scenario)
            if (entity.entityType === 'team') {
              console.log(`Team ${entity.name}:`, {
                actualPPG: entity.actualPPG,
                hasSeasonTeamStats: !!entity.seasonTeamStats,
                seasonTeamStatsKeys: entity.seasonTeamStats ? Object.keys(entity.seasonTeamStats) : [],
                hasSeasonRecord: !!entity.seasonRecord,
                seasonRecord: entity.seasonRecord,
                seasonFP_Defense: entity.seasonFP_Defense,
                seasonFP_Passing: entity.seasonFP_Passing,
                seasonFP_Rushing: entity.seasonFP_Rushing,
                seasonFP_ST: entity.seasonFP_ST,
                allTeamKeys: Object.keys(entity)
              });
              
              // Check if team has season fantasy points for any position
              const hasSeasonFP = (entity.seasonFP_Defense !== undefined && entity.seasonFP_Defense > 0) || 
                                 (entity.seasonFP_Passing !== undefined && entity.seasonFP_Passing > 0) || 
                                 (entity.seasonFP_Rushing !== undefined && entity.seasonFP_Rushing > 0) || 
                                 (entity.seasonFP_ST !== undefined && entity.seasonFP_ST > 0);
              
              console.log(`Team ${entity.name} hasSeasonFP:`, hasSeasonFP, {
                seasonFP_Defense: entity.seasonFP_Defense,
                seasonFP_Passing: entity.seasonFP_Passing,
                seasonFP_Rushing: entity.seasonFP_Rushing,
                seasonFP_ST: entity.seasonFP_ST
              });
              
              const result = entity.actualPPG > 0 || hasSeasonFP;
              console.log(`Team ${entity.name} filter result:`, result);
              
              return result;
            }
            
            return false;
          });
          
          if (eligibleEntities.length > 0) {
            // Weighted random selection favoring higher PPG
            const weights = eligibleEntities.map(entity => Math.max(entity.actualPPG, 1));
            const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
            const randomValue = Math.random() * totalWeight;
            
            let currentWeight = 0;
            for (let i = 0; i < eligibleEntities.length; i++) {
              currentWeight += weights[i];
              if (randomValue <= currentWeight) {
                randomizedLineup[positionKey] = eligibleEntities[i];
                break;
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to randomize position ${positionDetail.key}:`, error);
        }
      }
      
      setLineup(randomizedLineup);
      setSaveStatus('idle', null, "Lineup randomized successfully!");
      
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
      
      // Optimize each position by selecting highest PPG available
      for (const positionDetail of POSITIONS_CONFIG) {
        try {
          const positionKey = positionDetail.key as PositionKey;
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
              
              // For players: require PPG > 0
              if (entity.entityType === 'player') {
                return entity.actualPPG > 0;
              }
              
              // For teams: allow if PPG > 0 OR if they have season stats
              if (entity.entityType === 'team') {
                console.log(`Optimize - Team ${entity.name}:`, {
                  actualPPG: entity.actualPPG,
                  hasSeasonTeamStats: !!entity.seasonTeamStats,
                  seasonTeamStatsKeys: entity.seasonTeamStats ? Object.keys(entity.seasonTeamStats) : [],
                  hasSeasonRecord: !!entity.seasonRecord,
                  seasonRecord: entity.seasonRecord,
                  seasonFP_Defense: entity.seasonFP_Defense,
                  seasonFP_Passing: entity.seasonFP_Passing,
                  seasonFP_Rushing: entity.seasonFP_Rushing,
                  seasonFP_ST: entity.seasonFP_ST
                });
                
                // Check if team has season fantasy points for any position
                const hasSeasonFP = (entity.seasonFP_Defense !== undefined && entity.seasonFP_Defense > 0) || 
                                   (entity.seasonFP_Passing !== undefined && entity.seasonFP_Passing > 0) || 
                                   (entity.seasonFP_Rushing !== undefined && entity.seasonFP_Rushing > 0) || 
                                   (entity.seasonFP_ST !== undefined && entity.seasonFP_ST > 0);
                
                return entity.actualPPG > 0 || hasSeasonFP;
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
              
              // Normal PPG sorting
              return b.actualPPG - a.actualPPG;
            });
          
          if (eligibleEntities.length > 0) {
            optimizedLineup[positionKey] = eligibleEntities[0];
          }
        } catch (error) {
          console.warn(`Failed to optimize position ${positionDetail.key}:`, error);
        }
      }
      
      setLineup(optimizedLineup);
      setSaveStatus('idle', null, "Lineup optimized for highest projected points!");
      
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
              reconstructedLineup[posKey as PositionKey] = entity;
            }
          } catch (error) {
            console.warn(`Failed to load entity ${pick.id} for position ${posKey}:`, error);
          }
        }
      }

      setLineup(reconstructedLineup);
      setSaveStatus('idle', null, "Successfully copied lineup from last week!");
      
    } catch (error) {
      console.error("Error copying from last week:", error);
      setSaveStatus('error', "Failed to copy lineup from last week.");
    } finally {
      setIsCopyingFromLastWeek(false);
    }
  };

  const handleClearAllSlots = () => {
    setLineup({});
    setSaveStatus('idle', null, "All lineup slots cleared.");
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Quick Actions
        </h3>
        
        {/* Mobile dropdown toggle */}
        <div className="block sm:hidden">
          <button
            onClick={() => setIsOpen(!isOpen)}
            disabled={isDisabled}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Actions
            <svg 
              className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className={`space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-2 ${isOpen ? 'block' : 'hidden sm:flex'}`}>
        {/* Quick Pick / Optimize */}
        <button
          onClick={filledSlots === 0 ? handleRandomizeLineup : handleOptimizeLineup}
          disabled={isDisabled}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:bg-gray-400 text-white rounded-lg transition-colors text-sm font-medium"
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
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-400 text-white rounded-lg transition-colors text-sm font-medium"
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
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg transition-colors text-sm font-medium"
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
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white rounded-lg transition-colors text-sm font-medium"
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
  );
};

export default SimpleQuickActions; 