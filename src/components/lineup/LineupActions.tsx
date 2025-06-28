import React from 'react';
import { PositionKey, SelectableEntity } from '../../types/lineup';
import { POSITIONS_CONFIG } from '../../config/positions';
import { 
  fetchSelectablePlayers, 
  fetchSelectableTeams, 
  fetchStoredWeeklyLineup,
  FirestoreWeeklySchedule 
} from '../../services/lineupFetchingService';

interface LineupActionsProps {
  userId: string | undefined;
  leagueId: string;
  week: number;
  currentSeason: number;
  usageCounts: Record<string, number> | null;
  weeklySchedule: FirestoreWeeklySchedule | null;
  hasLastWeekLineup: boolean;
  isRandomizing: boolean;
  isCopyingFromLastWeek: boolean;
  onLineupUpdate: (newLineup: Partial<Record<PositionKey, SelectableEntity | undefined>>) => void;
  onRandomizingChange: (isRandomizing: boolean) => void;
  onCopyingChange: (isCopying: boolean) => void;
  onError: (error: string) => void;
  onSuccess: (message: string) => void;
}

const LineupActions: React.FC<LineupActionsProps> = ({
  userId,
  leagueId,
  week,
  currentSeason,
  usageCounts,
  weeklySchedule,
  hasLastWeekLineup,
  isRandomizing,
  isCopyingFromLastWeek,
  onLineupUpdate,
  onRandomizingChange,
  onCopyingChange,
  onError,
  onSuccess,
}) => {

  const handleCopyFromLastWeek = async () => {
    if (!userId || !leagueId || week <= 1) {
      onError("Cannot copy from last week.");
      return;
    }

    onCopyingChange(true);
    onError("");
    onSuccess("");

    try {
      const lastWeekData = await fetchStoredWeeklyLineup(userId, leagueId, week - 1, currentSeason);
      
      if (!lastWeekData || !lastWeekData.picks) {
        onError("No lineup found for last week.");
        onCopyingChange(false);
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

      onLineupUpdate(reconstructedLineup);
      onSuccess("Successfully copied lineup from last week!");
      
    } catch (error) {
      console.error("Error copying from last week:", error);
      onError("Failed to copy lineup from last week.");
    } finally {
      onCopyingChange(false);
    }
  };

  const handleRandomizeLineup = async () => {
    if (!usageCounts || !weeklySchedule) {
      onError("Cannot randomize lineup - missing data.");
      return;
    }

    onRandomizingChange(true);
    onError("");
    onSuccess("");

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
          const eligibleEntities = availableEntities.filter(entity => 
            entity.usageCount < 5 && 
            entity.byeWeek !== week &&
            entity.actualPPG > 0 // Only include entities with some performance
          );
          
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
      
      onLineupUpdate(randomizedLineup);
      onSuccess("Lineup randomized successfully!");
      
    } catch (error) {
      console.error("Error randomizing lineup:", error);
      onError("Failed to randomize lineup.");
    } finally {
      onRandomizingChange(false);
    }
  };

  const handleOptimizeLineup = async () => {
    if (!usageCounts || !weeklySchedule) {
      onError("Cannot optimize lineup - missing data.");
      return;
    }

    onRandomizingChange(true); // Reuse the randomizing state for optimize
    onError("");
    onSuccess("");

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
          const eligibleEntities = availableEntities
            .filter(entity => 
              entity.usageCount < 5 && 
              entity.byeWeek !== week &&
              entity.actualPPG > 0
            )
            .sort((a, b) => b.actualPPG - a.actualPPG);
          
          if (eligibleEntities.length > 0) {
            optimizedLineup[positionKey] = eligibleEntities[0];
          }
        } catch (error) {
          console.warn(`Failed to optimize position ${positionDetail.key}:`, error);
        }
      }
      
      onLineupUpdate(optimizedLineup);
      onSuccess("Lineup optimized for highest projected points!");
      
    } catch (error) {
      console.error("Error optimizing lineup:", error);
      onError("Failed to optimize lineup.");
    } finally {
      onRandomizingChange(false);
    }
  };

  const handleClearAllSlots = () => {
    onLineupUpdate({});
    onSuccess("All lineup slots cleared.");
  };

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <button
        onClick={handleOptimizeLineup}
        disabled={isRandomizing || isCopyingFromLastWeek}
        className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:bg-gray-400 text-white rounded-lg transition-colors text-sm font-medium"
      >
        {isRandomizing ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            Optimizing...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Optimize Lineup
          </>
        )}
      </button>

      <button
        onClick={handleRandomizeLineup}
        disabled={isRandomizing || isCopyingFromLastWeek}
        className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-400 text-white rounded-lg transition-colors text-sm font-medium"
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

      {hasLastWeekLineup && (
        <button
          onClick={handleCopyFromLastWeek}
          disabled={isRandomizing || isCopyingFromLastWeek}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg transition-colors text-sm font-medium"
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

      <button
        onClick={handleClearAllSlots}
        disabled={isRandomizing || isCopyingFromLastWeek}
        className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white rounded-lg transition-colors text-sm font-medium"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        Clear All
      </button>
    </div>
  );
};

export default LineupActions; 