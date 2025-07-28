import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { listenToUserLeagues, League } from '../../utils/leagues';
import { 
  listenToStoredWeeklyLineup, 
  StoredLineupData, 
  fetchDetailedGameStatsForEntity,
  fetchSelectablePlayerById,
  fetchSelectableTeamById
} from '../../services/lineupFetchingService';
import type { GameInfoFromSchedule } from '../../services/lineupFetchingService';
import { fetchWeeklySchedule } from '../../services/lineupFetchingService';
import { APP_CONFIG } from '../../config/appConfig';
import { getNewsForGame, formatTimeAgo, type NewsItem } from '../../services/newsService';
import { SelectableEntity, SelectablePlayer, SelectableTeam, PositionKey } from '../../types/lineup';
import Spinner from '../ui/Spinner';

interface UnifiedGamesWidgetProps {
  currentNflWeek: number;
  isMobileView?: boolean;
}

interface PlayerInGame {
  id: string;
  name: string;
  position: string;
  team: string;
  isCaptain: boolean;
  currentPoints: number;
  gameStatus: 'live' | 'upcoming' | 'final';
}

interface GameWithPlayers extends GameInfoFromSchedule {
  userPlayers: PlayerInGame[];
  newsItems: NewsItem[];
  hasUserPlayers: boolean;
}

const formatGameTime = (epochInSeconds: number | string): string => {
  const epochNumber = typeof epochInSeconds === 'string' ? parseInt(epochInSeconds, 10) : epochInSeconds;
  if (isNaN(epochNumber)) {
    return 'Invalid date';
  }
  const date = new Date(epochNumber * 1000);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  });
};

const UnifiedGamesWidget: React.FC<UnifiedGamesWidgetProps> = ({ currentNflWeek, isMobileView = false }) => {
  const { user } = useAuth();
  const [gamesWithPlayers, setGamesWithPlayers] = useState<GameWithPlayers[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedGame, setExpandedGame] = useState<string | null>(null);

  // Load leagues
  useEffect(() => {
    if (user?.uid) {
      const unsubscribe = listenToUserLeagues(
        user.uid,
        (fetchedLeagues) => {
          setLeagues(fetchedLeagues);
        },
        (error) => {
          console.error('Error fetching leagues:', error);
          setError('Failed to load leagues');
        }
      );
      return () => unsubscribe();
    }
  }, [user?.uid]);

  // Load schedule and combine with user data
  useEffect(() => {
    const loadGamesData = async () => {
      if (!user?.uid || leagues.length === 0) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        // Fetch schedule
        const season = APP_CONFIG.CURRENT_NFL_SEASON;
        const schedule = await fetchWeeklySchedule(season, currentNflWeek);
        
        if (!schedule?.games) {
          setGamesWithPlayers([]);
          return;
        }

        // Get user lineups from all leagues
        const userLineupData: Record<string, { player: SelectableEntity; isCaptain: boolean; leagueId: string; position: string }> = {};
        
        const lineupPromises = leagues.map(league => 
          new Promise<void>((resolve) => {
            listenToStoredWeeklyLineup(
              user.uid,
              league.id,
              currentNflWeek,
              async (lineupData: StoredLineupData) => {
                if (lineupData.picks) {
                  for (const [positionKey, pick] of Object.entries(lineupData.picks)) {
                    if (pick && pick.type === 'player') {
                      const key = `${pick.id}_${pick.type}`;
                      
                      if (!userLineupData[key]) {
                        let entity: SelectablePlayer | SelectableTeam | null = null;
                        
                        if (pick.type === 'player') {
                          entity = await fetchSelectablePlayerById(pick.id);
                        } else {
                          entity = await fetchSelectableTeamById(pick.id, positionKey as PositionKey);
                        }
                        
                        if (entity) {
                          userLineupData[key] = {
                            player: entity,
                            isCaptain: lineupData.captainPlayerId === pick.id,
                            leagueId: league.id,
                            position: pick.type === 'player' ? (entity as SelectablePlayer).position : positionKey
                          };
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

        // Process each game
        const processedGames = await Promise.all(
          schedule.games.map(async (game: GameInfoFromSchedule) => {
            // Find user players in this game
            const gameTeams = [game.home, game.away];
            const playersInGame: PlayerInGame[] = [];
            
            for (const data of Object.values(userLineupData)) {
              const player = data.player;
              if (gameTeams.includes(player.teamAbbreviation)) {
                // Get live stats if game is active
                let currentPoints = 0;
                const gameTime = new Date(Number(game.gameTime_epoch) * 1000);
                const now = new Date();
                const isLive = gameTime <= now && gameTime.getTime() + (3.5 * 60 * 60 * 1000) > now.getTime();
                
                if (isLive || gameTime < now) {
                  try {
                    const stats = await fetchDetailedGameStatsForEntity(player.id, 'player', game.gameID);
                    // For player stats, use the fantasyPoints property
                    if (stats && 'fantasyPoints' in stats) {
                      currentPoints = stats.fantasyPoints || 0;
                    }
                  } catch (error) {
                    console.error(`Error fetching stats for ${player.name}:`, error);
                  }
                }

                playersInGame.push({
                  id: player.id,
                  name: player.name,
                  position: data.position,
                  team: player.teamAbbreviation,
                  isCaptain: data.isCaptain,
                  currentPoints,
                  gameStatus: isLive ? 'live' : (gameTime > now ? 'upcoming' : 'final')
                });
              }
            }

            // Get news for this game
            const news = await getNewsForGame(game.home || '', game.away || '');
            const prioritizedNews = news
              .sort((a, b) => {
                const severityWeight = { high: 3, medium: 2, low: 1 };
                return severityWeight[b.severity] - severityWeight[a.severity];
              })
              .slice(0, 2); // Limit to top 2 news items

            return {
              ...game,
              userPlayers: playersInGame,
              newsItems: prioritizedNews,
              hasUserPlayers: playersInGame.length > 0
            };
          })
        );

        // Sort games: first by time, then by user players within same time slot
        processedGames.sort((a, b) => {
          const timeA = Number(a.gameTime_epoch);
          const timeB = Number(b.gameTime_epoch);
          
          // Primary sort: by game start time
          if (timeA !== timeB) {
            return timeA - timeB;
          }
          
          // Secondary sort: within same time slot, prioritize games with user players
          if (a.hasUserPlayers && !b.hasUserPlayers) return -1;
          if (!a.hasUserPlayers && b.hasUserPlayers) return 1;
          
          // Tertiary sort: alphabetical by team names for consistency
          const teamNameA = `${a.away} @ ${a.home}`;
          const teamNameB = `${b.away} @ ${b.home}`;
          return teamNameA.localeCompare(teamNameB);
        });

        setGamesWithPlayers(processedGames);
        
      } catch (err) {
        console.error('Error loading games data:', err);
        setError('Failed to load games data');
      } finally {
        setIsLoading(false);
      }
    };

    if (currentNflWeek > 0 && leagues.length > 0) {
      loadGamesData();
    }
  }, [currentNflWeek, user?.uid, leagues]);

  const getGameStatusBadge = (game: GameWithPlayers) => {
    const gameTime = new Date(Number(game.gameTime_epoch) * 1000);
    const now = new Date();
    const isLive = gameTime <= now && gameTime.getTime() + (3.5 * 60 * 60 * 1000) > now.getTime();
    const isUpcoming = gameTime > now;

    if (isLive) return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">🔴 Live</span>;
    if (isUpcoming) return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">⏰ Upcoming</span>;
    return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">✅ Final</span>;
  };

  const toggleGameExpansion = (gameId: string) => {
    setExpandedGame(expandedGame === gameId ? null : gameId);
  };

  if (isLoading) {
    return (
      <div className={isMobileView ? "py-8" : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6"}>
        <div className="flex items-center justify-center py-8">
          <Spinner size="md" className="mr-2" />
          <span className="text-gray-500 dark:text-gray-400">Loading games...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={isMobileView ? "py-8" : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6"}>
        <div className="text-center py-8 text-red-500">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (gamesWithPlayers.length === 0) {
    return (
      <div className={isMobileView ? "py-8" : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6"}>
        {!isMobileView && (
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
            This Week's Games
          </h2>
        )}
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p>No games scheduled for this week.</p>
        </div>
      </div>
    );
  }

  const containerClass = isMobileView ? "space-y-2" : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow duration-200";
  const contentClass = isMobileView ? "space-y-1" : "max-h-96 overflow-y-auto custom-scrollbar space-y-1";

  return (
    <div className={containerClass}>
      {!isMobileView && (
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
          This Week's Games
        </h2>
      )}
      
      <div className={contentClass}>
        {gamesWithPlayers.map((game) => {
          const isExpanded = expandedGame === game.gameID;
          
          return (
            <div key={game.gameID} className="group p-3 rounded-lg hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100 dark:hover:from-gray-700/30 dark:hover:to-gray-600/30 transition-all duration-200">
              {/* Game Header */}
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    <span className="text-gray-600 dark:text-gray-400">{game.away}</span>
                    <span className="mx-2 text-gray-400">@</span>
                    <span>{game.home}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatGameTime(game.gameTime_epoch)}
                    </span>
                    {getGameStatusBadge(game)}
                  </div>
                </div>
              </div>

              {/* Smart Priority Content */}
              {game.hasUserPlayers && (
                <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                        👤 Your Players ({game.userPlayers.length})
                      </h4>
                      <div className="space-y-1">
                        {game.userPlayers.slice(0, 2).map((player) => (
                          <div key={player.id} className="flex items-center justify-between text-sm">
                            <span className="text-blue-800 dark:text-blue-200">
                              {player.name} ({player.position})
                              {player.isCaptain && <span className="ml-1 text-yellow-600">⭐</span>}
                            </span>
                            <span className="font-semibold text-blue-900 dark:text-blue-100">
                              {player.currentPoints.toFixed(1)} pts
                            </span>
                          </div>
                        ))}
                        {game.userPlayers.length > 2 && (
                          <button
                            onClick={() => toggleGameExpansion(game.gameID)}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                          >
                            {isExpanded ? 'Show less' : `+${game.userPlayers.length - 2} more players`}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Expanded Players */}
              {isExpanded && game.userPlayers.length > 2 && (
                <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="space-y-1">
                    {game.userPlayers.slice(2).map((player) => (
                      <div key={player.id} className="flex items-center justify-between text-sm">
                        <span className="text-blue-800 dark:text-blue-200">
                          {player.name} ({player.position})
                          {player.isCaptain && <span className="ml-1 text-yellow-600">⭐</span>}
                        </span>
                        <span className="font-semibold text-blue-900 dark:text-blue-100">
                          {player.currentPoints.toFixed(1)} pts
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* News (Secondary Priority) */}
              {game.newsItems.length > 0 && (
                <div className="mt-3">
                  <button
                    onClick={() => toggleGameExpansion(game.gameID)}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    📰 News ({game.newsItems.length})
                  </button>
                  
                  {isExpanded && (
                    <div className="mt-2 space-y-2">
                      {game.newsItems.map((newsItem) => (
                        <div key={newsItem.id} className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded p-3">
                          <div className={`font-medium mb-1 ${
                            newsItem.severity === 'high' ? 'text-red-700 dark:text-red-400' : 
                            newsItem.severity === 'medium' ? 'text-yellow-700 dark:text-yellow-400' : 
                            'text-blue-700 dark:text-blue-400'
                          }`}>
                            📰 {newsItem.title}
                          </div>
                          <div className="mb-1">{newsItem.summary}</div>
                          <div className="text-gray-500 dark:text-gray-500">{formatTimeAgo(newsItem.timestamp)} • {newsItem.source}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default UnifiedGamesWidget; 