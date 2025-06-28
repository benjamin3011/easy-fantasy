import React, { useState, useEffect, useRef } from 'react';
import { League } from '../../utils/leagues';
import { listenToStoredWeeklyLineup, fetchSelectablePlayerById, fetchSelectableTeamById, fetchWeeklySchedule, fetchGameScores, StoredLineupData, GameInfoFromSchedule, GameScore } from '../../services/lineupFetchingService';
import { APP_CONFIG } from '../../config/appConfig';
import type { SelectablePlayer, SelectableTeam, PositionKey } from '../../types/lineup';
import Spinner from '../ui/Spinner';

interface UserPlayer {
  id: string;
  name: string;
  type: 'player' | 'team';
  teamId: string;
  isCaptain: boolean;
}

interface LiveGame {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore?: number;
  awayScore?: number;
  gameStatus: 'upcoming' | 'live' | 'final';
  gameStatusText?: string;
  gameTime: string; // "Q3 8:45" or "1:00 PM" or "Final"
  userPlayers: UserPlayer[];
}

interface LiveGameScoresProps {
  userId: string;
  leagues: League[];
  selectedWeek: number;
}

const LiveGameScores: React.FC<LiveGameScoresProps> = ({
  userId,
  leagues,
  selectedWeek
}) => {
  const [liveGames, setLiveGames] = useState<LiveGame[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Get game status from Tank01 gameStatusCode
  const getGameStatusFromCode = (gameStatusCode?: string | number): 'upcoming' | 'live' | 'final' => {
    const code = typeof gameStatusCode === 'string' ? parseInt(gameStatusCode) : gameStatusCode;
    switch (code) {
      case 0: return 'upcoming';  // Game has not started yet
      case 1: return 'live';      // Game is currently in progress
      case 2: return 'final';     // Game is completed/final
      case 3: return 'upcoming';  // Game postponed - treat as upcoming
      case 4: return 'upcoming';  // Game suspended - treat as upcoming
      default: return 'upcoming'; // Default fallback
    }
  };

  // Format game time for display
  const formatGameTime = (game: GameInfoFromSchedule, gameScore: GameScore | null, gameStatus: 'upcoming' | 'live' | 'final'): string => {
    if (gameStatus === 'final') return 'Final';
    
    // Use live game data if available
    if (gameScore) {
      if (gameScore.gameStatusCode === 2) return 'Final';
      if (gameScore.gameStatusCode === 1) {
        // Live game - show quarter and time if available
        if (gameScore.quarter && gameScore.timeRemaining) {
          return `Q${gameScore.quarter} ${gameScore.timeRemaining}`;
        }
        return 'Live';
      }
    }
    
    if (gameStatus === 'live') return 'Live';
    
    // Upcoming game - show scheduled time
    if (game.gameTime_epoch) {
      const epochTime = typeof game.gameTime_epoch === 'string' 
        ? parseInt(game.gameTime_epoch) 
        : game.gameTime_epoch;
      const gameDate = new Date(epochTime * 1000);
      return gameDate.toLocaleString('en-US', {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    }
    return 'TBD';
  };

  // Get status icon
  const getStatusIcon = (status: 'upcoming' | 'live' | 'final'): string => {
    switch (status) {
      case 'live': return '🔴';
      case 'final': return '⏸️';
      case 'upcoming': return '⏱️';
      default: return '❓';
    }
  };

  // Get status color
  const getStatusColor = (status: 'upcoming' | 'live' | 'final'): string => {
    switch (status) {
      case 'live': return 'text-red-500';
      case 'final': return 'text-gray-500';
      case 'upcoming': return 'text-blue-500';
      default: return 'text-gray-400';
    }
  };

  // Fetch live game scores
  const fetchLiveGameScores = async (isRefresh: boolean = false) => {
    if (!isRefresh) {
      setIsLoading(true);
    }
    setError(null);

    try {
      // Step 1: Get all user's players across leagues
      const userPlayers = new Map<string, UserPlayer[]>(); // gameId -> players

      const lineupPromises = leagues.map(league => 
        new Promise<void>((resolve) => {
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
                      
                      const userPlayer: UserPlayer = {
                        id: entity.id,
                        name: entity.name,
                        type: entity.entityType,
                        teamId: entity.teamAbbreviation,
                        isCaptain
                      };

                      if (!userPlayers.has(entity.gameIdForWeek)) {
                        userPlayers.set(entity.gameIdForWeek, []);
                      }
                      
                      // Avoid duplicates (same player in multiple leagues)
                      const existingPlayers = userPlayers.get(entity.gameIdForWeek)!;
                      if (!existingPlayers.some(p => p.id === userPlayer.id && p.type === userPlayer.type)) {
                        existingPlayers.push(userPlayer);
                      }
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
        })
      );

      await Promise.all(lineupPromises);

      // Step 2: Get schedule data for the current week
      const season = parseInt(APP_CONFIG.CURRENT_NFL_SEASON, 10);
      const scheduleData = await fetchWeeklySchedule(season, selectedWeek);

      if (!scheduleData) {
        throw new Error('Failed to fetch schedule data');
      }

      // Step 3: Match games with user's players and build live game data
      const gamesWithUserPlayers: LiveGame[] = [];
      const gameIds = Array.from(userPlayers.keys());
      
      // Fetch game scores for all relevant games
      const gameScoresMap = await fetchGameScores(gameIds);

      for (const [gameId, playersInGame] of userPlayers.entries()) {
        // Find this game in the schedule
        const scheduleGame = scheduleData.games.find(game => game.gameID === gameId);
        const gameScore = gameScoresMap.get(gameId);
        
        if (scheduleGame) {
          // Use game score status if available, otherwise fall back to schedule
          const gameStatus = gameScore 
            ? getGameStatusFromCode(gameScore.gameStatusCode)
            : getGameStatusFromCode(scheduleGame.gameStatusCode);
          
          const liveGame: LiveGame = {
            gameId: scheduleGame.gameID,
            homeTeam: scheduleGame.home || scheduleGame.teamIDHome,
            awayTeam: scheduleGame.away || scheduleGame.teamIDAway,
            homeScore: gameScore?.homeScore,
            awayScore: gameScore?.awayScore,
            gameStatus,
            gameStatusText: gameScore?.gameStatus || scheduleGame.gameStatus,
            gameTime: formatGameTime(scheduleGame, gameScore || null, gameStatus),
            userPlayers: playersInGame
          };

          gamesWithUserPlayers.push(liveGame);
        }
      }

      // Sort games: Live first, then upcoming, then final
      gamesWithUserPlayers.sort((a, b) => {
        const statusOrder = { live: 0, upcoming: 1, final: 2 };
        const statusDiff = statusOrder[a.gameStatus] - statusOrder[b.gameStatus];
        if (statusDiff !== 0) return statusDiff;
        
        // Within same status, sort by game time
        return a.gameTime.localeCompare(b.gameTime);
      });

      setLiveGames(gamesWithUserPlayers);
    } catch (error) {
      console.error('Error fetching live game scores:', error);
      setError('Failed to load live game scores');
    } finally {
      if (!isRefresh) {
        setIsLoading(false);
      }
    }
  };

  // Initial load
  useEffect(() => {
    if (userId && leagues.length > 0) {
      fetchLiveGameScores();
    }
  }, [userId, leagues, selectedWeek]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (liveGames.length > 0 || (!isLoading && !error)) {
      refreshIntervalRef.current = setInterval(() => {
        fetchLiveGameScores(true);
      }, 30000);

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
        }
      };
    }
  }, [liveGames.length, isLoading, error]);

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
        <p className="text-gray-500 dark:text-gray-400">Loading live games...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-500">
        <p>{error}</p>
        <button 
          onClick={() => fetchLiveGameScores()}
          className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (liveGames.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <p>No games with your players</p>
        <p className="text-sm mt-1">Set your lineup to see live game scores</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Live Games List */}
      {liveGames.map((game) => (
        <div
          key={game.gameId}
          className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          {/* Game Header - Teams and Score */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              {/* Game Status Icon */}
              <div className={`text-lg ${getStatusColor(game.gameStatus)}`}>
                {getStatusIcon(game.gameStatus)}
              </div>
              
              {/* Teams */}
              <div className="font-medium text-gray-800 dark:text-white">
                {game.awayTeam} @ {game.homeTeam}
              </div>
              
              {/* Score (if available) */}
              {game.homeScore !== undefined && game.awayScore !== undefined && (
                <div className="text-lg font-bold text-gray-700 dark:text-gray-200">
                  {game.awayScore} - {game.homeScore}
                </div>
              )}
            </div>

            {/* Game Time/Status */}
            <div className={`text-sm font-medium ${getStatusColor(game.gameStatus)}`}>
              {game.gameTime}
            </div>
          </div>

          {/* User's Players in this Game */}
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Your players:
            </div>
            <div className="flex flex-wrap gap-2">
              {game.userPlayers.map((player) => (
                <div
                  key={`${player.id}-${player.type}`}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-xs rounded"
                >
                  <span className="font-medium">{player.name}</span>
                  {player.isCaptain && (
                    <span className="text-yellow-600 dark:text-yellow-400">⭐</span>
                  )}
                  <span className="text-blue-600 dark:text-blue-400 text-xs">
                    ({player.teamId})
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default LiveGameScores; 