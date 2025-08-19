import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { fetchWeeklySchedule, fetchActualFantasyPointsForGame } from '../services/lineupFetchingService';
import type { GameInfoFromSchedule } from '../services/lineupFetchingService';
import { SelectableEntity, PositionKey } from '../types/lineup';

interface ActualPointsResult {
  hasGameStarted: boolean;
  actualPoints: Record<string, number>; // entityId -> actual points
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook to determine if we should show actual points vs PPG for lineup entities
 * Returns actual points for all entities when any game has started for the week
 */
export function useActualLineupPoints(
  week: number, 
  season: number, 
  lineupEntities: Array<{ entity: SelectableEntity; positionKey: PositionKey }>
): ActualPointsResult {
  const [actualPoints, setActualPoints] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if any games have started for this week
  const { data: hasGameStarted = false } = useQuery({
    queryKey: ['weekGameStatus', week, season],
    queryFn: async () => {
      try {
        if (import.meta.env.DEV) console.log(`🔍 Checking game status for week ${week}, season ${season}`);
        
        // First, get all games for this week to see what we have
        const gameScoresRef = collection(db, 'gameScores');
        const allGamesQuery = query(
          gameScoresRef,
          where('week', '==', week),
          where('season', '==', season)
        );
        
        const allGamesSnapshot = await getDocs(allGamesQuery);
        if (import.meta.env.DEV) console.log(`📊 Found ${allGamesSnapshot.size} games for week ${week}`);
        
        if (allGamesSnapshot.empty) {
          if (import.meta.env.DEV) console.log(`❌ No games found for week ${week}, season ${season}`);
          return false;
        }

        // Check each game's status
        let hasStarted = false;
        allGamesSnapshot.forEach(doc => {
          const gameData = doc.data();
          const statusCode = gameData.gameStatusCode;
          if (import.meta.env.DEV) console.log(`🎮 Game ${doc.id}: statusCode=${statusCode}, status="${gameData.gameStatus}", teams=${gameData.awayTeam} @ ${gameData.homeTeam}`);
          
          // Game has started if statusCode > 0 (1=live, 2=final)
          if (statusCode > 0) {
            hasStarted = true;
          }
        });
        
        if (import.meta.env.DEV) console.log(`🎯 Has any game started: ${hasStarted}`);
        return hasStarted;
      } catch (error) {
        console.error('❌ Error checking game status:', error);
        return false;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 2 * 60 * 1000, // Check every 2 minutes during games
  });

  // Fetch actual points for all entities when games have started
  useEffect(() => {
    if (!hasGameStarted || lineupEntities.length === 0) {
      if (import.meta.env.DEV) console.log(`⏸️ Skipping actual points fetch: hasGameStarted=${hasGameStarted}, entities=${lineupEntities.length}`);
      setActualPoints({});
      return;
    }

    const fetchAllActualPoints = async () => {
      if (import.meta.env.DEV) console.log(`🚀 Fetching actual points for ${lineupEntities.length} entities`);
      setIsLoading(true);
      setError(null);
      
      try {
        const newActualPoints: Record<string, number> = {};
        
        // Get weekly schedule to know which teams played in which games (same as UnifiedGamesWidget)
        const schedule = await fetchWeeklySchedule(season.toString(), week);
        if (!schedule || !schedule.games || schedule.games.length === 0) {
          if (import.meta.env.DEV) console.log(`❌ No schedule found for week ${week}, season ${season}`);
          setError('No schedule found for this week');
          return;
        }
        
        if (import.meta.env.DEV) console.log(`🎮 Found ${schedule.games.length} games in schedule for week ${week}`);
        
        // For each entity, find their game and get actual points
        await Promise.all(
          lineupEntities.map(async ({ entity, positionKey }) => {
            try {
              const entityType = entity.entityType === 'player' ? 'player' : 'team';
              const entityName = entity.name || entity.id;
              if (import.meta.env.DEV) console.log(`📊 Fetching ${entityType} ${entity.id} (${entityName}) points for position ${positionKey}`);
              
              // Find the game this entity played in (same logic as UnifiedGamesWidget)
              const entityGame = schedule.games.find((game: GameInfoFromSchedule) => {
                const gameTeams = [game.home, game.away];
                return gameTeams.includes(entity.teamAbbreviation);
              });
              
              if (!entityGame) {
                if (import.meta.env.DEV) console.log(`⚠️ No game found for ${entity.teamAbbreviation} (${entityName})`);
                newActualPoints[entity.id] = 0;
                return;
              }
              
              if (import.meta.env.DEV) console.log(`🎯 ${entityName} plays in game: ${entityGame.away} @ ${entityGame.home} (${entityGame.gameID})`);
              
              // Fetch actual points from the specific game
              const actualFantasyPoints = await fetchActualFantasyPointsForGame(
                entity.id, 
                entityType, 
                entityGame.gameID, 
                entityType === 'team' ? positionKey : undefined
              );
              
              const points = actualFantasyPoints || 0;
              if (import.meta.env.DEV) console.log(`💰 ${entity.id} (${entityName}): ${points} points from game ${entityGame.gameID}`);
              newActualPoints[entity.id] = points;
              
            } catch (error) {
              console.error(`❌ Error fetching points for ${entity.id}:`, error);
              newActualPoints[entity.id] = 0;
            }
          })
        );
        
        if (import.meta.env.DEV) console.log(`📈 Final actual points:`, newActualPoints);
        setActualPoints(newActualPoints);
      } catch (error) {
        console.error('❌ Error fetching actual lineup points:', error);
        setError(error instanceof Error ? error.message : 'Failed to fetch actual points');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllActualPoints();
  }, [hasGameStarted, lineupEntities, week, season]);

  return {
    hasGameStarted,
    actualPoints,
    isLoading,
    error
  };
}
