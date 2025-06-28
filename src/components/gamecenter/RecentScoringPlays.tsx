import React, { useState, useEffect, useRef } from 'react';
import { League } from '../../utils/leagues';
import { listenToStoredWeeklyLineup, fetchSelectablePlayerById, fetchSelectableTeamById, fetchDetailedGameStatsForEntity, StoredLineupData } from '../../services/lineupFetchingService';
import type { SelectablePlayer, SelectableTeam, PositionKey } from '../../types/lineup';
import Spinner from '../ui/Spinner';

interface ScoringPlay {
  playerIDs?: string[];
  scoreType?: string;
  score?: string;
  scorePeriod?: string;
  scoreTime?: string;
}

interface ProcessedScoringPlay {
  playerId: string;
  playerName: string;
  playerType: 'player' | 'team';
  teamAbbreviation: string;
  opponent?: string;
  playDescription: string;
  scoreType: string;
  period: string;
  time: string;
  fantasyPoints: number;
  isCaptain: boolean;
  timestamp: number; // For sorting
  leagues: string[]; // Which leagues benefit from this play
}

interface RecentScoringPlaysProps {
  userId: string;
  leagues: League[];
  selectedWeek: number;
}

const RecentScoringPlays: React.FC<RecentScoringPlaysProps> = ({
  userId,
  leagues,
  selectedWeek
}) => {
  const [scoringPlays, setScoringPlays] = useState<ProcessedScoringPlay[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate fantasy points for different play types
  const calculatePlayFantasyPoints = (scoreType: string, playerType: 'player' | 'team'): number => {
    const type = scoreType?.toLowerCase() || '';
    
    if (playerType === 'player') {
      // Player fantasy points
      if (type.includes('td') || type.includes('touchdown')) {
        if (type.includes('pass')) return 4; // Passing TD
        return 6; // Rushing/Receiving TD
      }
      if (type.includes('fg') || type.includes('field goal')) return 3;
      if (type.includes('pat') || type.includes('extra point')) return 1;
      if (type.includes('safety')) return 2;
      if (type.includes('fumble recovery')) return 2;
      if (type.includes('interception')) return 2;
      if (type.includes('sack')) return 1;
    } else {
      // Team defense/special teams points
      if (type.includes('interception')) return 2;
      if (type.includes('fumble recovery')) return 2;
      if (type.includes('sack')) return 1;
      if (type.includes('safety')) return 2;
      if (type.includes('td') || type.includes('touchdown')) return 6;
      if (type.includes('fg') || type.includes('field goal')) return 3;
      if (type.includes('pat') || type.includes('extra point')) return 1;
    }
    
    return 0; // Unknown play type
  };

  // Get play icon based on type
  const getPlayIcon = (scoreType: string): string => {
    const type = scoreType?.toLowerCase() || '';
    if (type.includes('td') || type.includes('touchdown')) return '🏈';
    if (type.includes('fg') || type.includes('field goal')) return '⚡';
    if (type.includes('pat') || type.includes('extra point')) return '⚡';
    if (type.includes('interception')) return '🛡️';
    if (type.includes('fumble')) return '🛡️';
    if (type.includes('sack')) return '🛡️';
    if (type.includes('safety')) return '🛡️';
    return '🏈';
  };

  // Convert time to sortable timestamp
  const parseGameTime = (period: string, time: string): number => {
    // Simple parsing - Q1 = 1000, Q2 = 2000, etc.
    // Time like "8:45" becomes 845
    const quarterNum = parseInt(period.replace(/\D/g, '')) || 1;
    const timeParts = time.split(':');
    const minutes = parseInt(timeParts[0]) || 0;
    const seconds = parseInt(timeParts[1]) || 0;
    
    // Higher timestamp = more recent (reverse order for sorting)
    return (quarterNum * 1000) + (minutes * 60) + seconds;
  };

  // Fetch scoring plays for all user's lineup players
  const fetchScoringPlays = async (isRefresh: boolean = false) => {
    if (!isRefresh) {
      setIsLoading(true);
    }
    setError(null);

    try {
      // Get all unique players across all leagues
      const allPlayers = new Map<string, { entity: SelectablePlayer | SelectableTeam; leagues: { league: League; isCaptain: boolean }[] }>();
      
      for (const league of leagues) {
        await new Promise<void>((resolve) => {
          listenToStoredWeeklyLineup(
            userId,
            league.id,
            selectedWeek,
            async (lineupData: StoredLineupData) => {
              if (lineupData.picks) {
                for (const [positionKey, pick] of Object.entries(lineupData.picks)) {
                  if (pick) {
                    let entity: SelectablePlayer | SelectableTeam | null = null;
                    
                    if (pick.type === 'player') {
                      entity = await fetchSelectablePlayerById(pick.id);
                    } else {
                      entity = await fetchSelectableTeamById(pick.id, positionKey as PositionKey);
                    }

                    if (entity?.gameIdForWeek) {
                      const isCaptain = pick.type === 'player' && lineupData.captainPlayerId === pick.id;
                      
                      if (!allPlayers.has(entity.id)) {
                        allPlayers.set(entity.id, { entity, leagues: [] });
                      }
                      
                      allPlayers.get(entity.id)!.leagues.push({ league, isCaptain });
                    }
                  }
                }
              }
              resolve();
            },
            (error) => {
              console.error(`Error fetching lineup for league ${league.id}:`, error);
              resolve();
            }
          );
        });
      }

      // Process scoring plays for each unique player
      const allPlays: ProcessedScoringPlay[] = [];

      for (const playerData of allPlayers.values()) {
        const { entity, leagues: playerLeagues } = playerData;
        
        if (entity.gameIdForWeek) {
          try {
            const gameStats = await fetchDetailedGameStatsForEntity(
              entity.id,
              entity.entityType,
              entity.gameIdForWeek
            );

            // Only players have rawBoxScoreStats with scoring plays
            if (gameStats && entity.entityType === 'player' && 'rawBoxScoreStats' in gameStats) {
              const playerGameStats = gameStats as { rawBoxScoreStats?: { scoringPlays?: ScoringPlay[] } };
              const scoringPlays = playerGameStats.rawBoxScoreStats?.scoringPlays || [];
              
              // Filter plays that involve this player
              const playerPlays = scoringPlays.filter(play => 
                play.playerIDs && Array.isArray(play.playerIDs) && play.playerIDs.includes(entity.id)
              );

              // Process each play
              for (const play of playerPlays) {
                if (play.scoreType && play.score && play.scorePeriod && play.scoreTime) {
                  const baseFantasyPoints = calculatePlayFantasyPoints(play.scoreType, entity.entityType);
                  
                  // Check if captain bonus applies to any league
                  const isCaptain = entity.entityType === 'player' && 
                    playerLeagues.some(pl => pl.isCaptain);
                  
                  // Apply captain multiplier if applicable
                  let fantasyPoints = baseFantasyPoints;
                  if (isCaptain && entity.entityType === 'player') {
                    const captainMultiplier = playerLeagues.find(pl => pl.isCaptain)?.league.captainPointMultiplier || 1.5;
                    fantasyPoints = baseFantasyPoints * captainMultiplier;
                  }

                  const processedPlay: ProcessedScoringPlay = {
                    playerId: entity.id,
                    playerName: entity.name,
                    playerType: entity.entityType,
                    teamAbbreviation: entity.teamAbbreviation,
                    opponent: entity.opponentForWeek,
                    playDescription: play.score,
                    scoreType: play.scoreType,
                    period: play.scorePeriod,
                    time: play.scoreTime,
                    fantasyPoints,
                    isCaptain,
                    timestamp: parseGameTime(play.scorePeriod, play.scoreTime),
                    leagues: playerLeagues.map(pl => pl.league.name)
                  };

                  allPlays.push(processedPlay);
                }
              }
            }
          } catch (error) {
            console.error(`Error fetching scoring plays for ${entity.entityType} ${entity.id}:`, error);
          }
        }
      }

      // Sort by timestamp (most recent first)
      allPlays.sort((a, b) => b.timestamp - a.timestamp);
      
      setScoringPlays(allPlays);
    } catch (error) {
      console.error('Error fetching scoring plays:', error);
      setError('Failed to load scoring plays');
    } finally {
      if (!isRefresh) {
        setIsLoading(false);
      }
    }
  };

  // Initial load
  useEffect(() => {
    if (userId && leagues.length > 0) {
      fetchScoringPlays();
    }
  }, [userId, leagues, selectedWeek]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (scoringPlays.length > 0 || (!isLoading && !error)) {
      refreshIntervalRef.current = setInterval(() => {
        fetchScoringPlays(true);
      }, 30000);

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
        }
      };
    }
  }, [scoringPlays.length, isLoading, error]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <Spinner size="md" className="mx-auto mb-3" />
        <p className="text-gray-500 dark:text-gray-400">Loading scoring plays...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-500">
        <p>{error}</p>
        <button 
          onClick={() => fetchScoringPlays()}
          className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (scoringPlays.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <p>No recent scoring plays</p>
        <p className="text-sm mt-1">Your players haven't scored yet this week</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Scoring Plays List */}
      {scoringPlays.map((play, index) => (
        <div
          key={`${play.playerId}-${play.timestamp}-${index}`}
          className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          {/* Play Icon */}
          <div className="text-xl flex-shrink-0 mt-0.5">
            {getPlayIcon(play.scoreType)}
          </div>

          {/* Play Details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-800 dark:text-white">
                {play.playerName}
              </span>
              {play.isCaptain && (
                <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400 px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 rounded">
                  C
                </span>
              )}
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {play.teamAbbreviation}
                {play.opponent && ` vs ${play.opponent}`}
              </span>
            </div>

            <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              {play.playDescription}
            </div>

            <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
              <span>{play.period} {play.time}</span>
              <span className="text-green-600 dark:text-green-400 font-medium">
                +{play.fantasyPoints.toFixed(1)} pts
                {play.isCaptain && <span className="ml-1">⭐</span>}
              </span>
              {play.leagues.length > 1 && (
                <span className="text-blue-600 dark:text-blue-400">
                  {play.leagues.length} leagues
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default RecentScoringPlays; 