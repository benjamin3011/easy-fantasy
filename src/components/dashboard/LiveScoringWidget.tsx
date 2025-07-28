import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { listenToUserLeagues, League } from '../../utils/leagues';
import { listenToStoredWeeklyLineup, fetchSelectablePlayerById, fetchSelectableTeamById, fetchDetailedGameStatsForEntity, StoredLineupData } from '../../services/lineupFetchingService';
import type { SelectablePlayer, SelectableTeam, PositionKey } from '../../types/lineup';
import { calculateCurrentNFLWeek } from '../../utils/nflWeekHelper';
import Spinner from '../ui/Spinner';

interface ActivePlayer {
  id: string;
  name: string;
  position: string;
  team: string;
  entityType: 'player' | 'team';
  currentPoints: number;
  gameStatus: 'upcoming' | 'live' | 'final';
  isCaptainInAnyLeague: boolean;
  leagueCount: number;
}

interface RecentPlay {
  playerName: string;
  playDescription: string;
  fantasyPoints: number;
  isCaptain: boolean;
  period: string;
  time: string;
}

interface LiveScoringWidgetProps {
  isMobileView?: boolean;
}

const LiveScoringWidget: React.FC<LiveScoringWidgetProps> = ({ isMobileView = false }) => {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [activePlayers, setActivePlayers] = useState<ActivePlayer[]>([]);
  const [recentPlays, setRecentPlays] = useState<RecentPlay[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'players' | 'plays'>('players');
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const currentWeek = calculateCurrentNFLWeek();

  // Helper function to get game status from API
  const getGameStatusFromCode = (gameStatusCode?: number): 'upcoming' | 'live' | 'final' => {
    switch (gameStatusCode) {
      case 0: return 'upcoming';
      case 1: return 'live';
      case 2: return 'final';
      case 3: return 'upcoming';
      case 4: return 'upcoming';
      default: return 'upcoming';
    }
  };

  // Fetch live data for user's lineup
  const fetchLiveData = async (isRefresh: boolean = false) => {
    if (!user?.uid || leagues.length === 0) return;
    
    if (!isRefresh) {
      setIsLoading(true);
    }
    setError(null);

    try {
      // Track player data per league
      const playerLeagueData: Record<string, {
        player: SelectablePlayer | SelectableTeam;
        leagues: Array<{ league: League; isCaptain: boolean; positionKey?: string }>;
        primaryPosition?: string;
      }> = {};

      // Fetch lineups from all leagues
      const lineupPromises = leagues.map(league => 
        new Promise<void>((resolve) => {
          listenToStoredWeeklyLineup(
            user.uid,
            league.id,
            currentWeek,
            async (lineupData: StoredLineupData) => {
              if (lineupData.picks) {
                for (const [positionKey, pick] of Object.entries(lineupData.picks)) {
                  if (pick) {
                    const key = pick.type === 'team' 
                      ? `${pick.type}-${pick.id}-${positionKey}` 
                      : `${pick.type}-${pick.id}`;
                    
                    if (!playerLeagueData[key]) {
                      let entity: SelectablePlayer | SelectableTeam | null = null;
                      
                      if (pick.type === 'player') {
                        entity = await fetchSelectablePlayerById(pick.id);
                      } else {
                        entity = await fetchSelectableTeamById(pick.id, positionKey as PositionKey);
                      }
                      
                      if (entity) {
                        playerLeagueData[key] = {
                          player: entity,
                          leagues: [],
                          primaryPosition: pick.type === 'team' ? positionKey : (entity as SelectablePlayer).position
                        };
                      }
                    }
                    
                    if (playerLeagueData[key]) {
                      const isCaptain = pick.type === 'player' && lineupData.captainPlayerId === pick.id;
                      playerLeagueData[key].leagues.push({
                        league,
                        isCaptain,
                        positionKey: pick.type === 'team' ? positionKey : undefined
                      });
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

      // Process active players and recent plays
      const playersPromises = Object.values(playerLeagueData).map(async ({ player, leagues: playerLeagues, primaryPosition }) => {
        if (!player.gameIdForWeek) return null;

        try {
          const gameStats = await fetchDetailedGameStatsForEntity(
            player.id,
            player.entityType,
            player.gameIdForWeek
          );

          if (!gameStats) return null;

          // Calculate points with captain bonuses
          let basePoints = 0;
          if (player.entityType === 'player' && 'fantasyPoints' in gameStats) {
            basePoints = (gameStats as { fantasyPoints?: number }).fantasyPoints || 0;
          } else if (player.entityType === 'team') {
            const teamStats = gameStats as {
              fantasyPointsPassing?: number;
              fantasyPointsRushing?: number;
              fantasyPointsDefense?: number;
              fantasyPointsSpecialTeams?: number;
            };
            switch (primaryPosition) {
              case 'PassingOffense': basePoints = teamStats.fantasyPointsPassing || 0; break;
              case 'RushingOffense': basePoints = teamStats.fantasyPointsRushing || 0; break;
              case 'Defense': basePoints = teamStats.fantasyPointsDefense || 0; break;
              case 'SpecialTeams': basePoints = teamStats.fantasyPointsSpecialTeams || 0; break;
            }
          }

          let totalPoints = 0;
          let isCaptainInAnyLeague = false;
          
          for (const leagueData of playerLeagues) {
            let pointsForThisLeague = basePoints;
            if (leagueData.isCaptain && player.entityType === 'player') {
              const multiplier = leagueData.league.captainPointMultiplier || 1.5;
              pointsForThisLeague *= multiplier;
              isCaptainInAnyLeague = true;
            }
            totalPoints += pointsForThisLeague;
          }

          const gameStatus = getGameStatusFromCode(gameStats.gameStatusCode);

          return {
            id: player.id,
            name: player.name,
            position: primaryPosition || (player.entityType === 'player' ? (player as SelectablePlayer).position : 'DEF'),
            team: player.teamAbbreviation,
            entityType: player.entityType,
            currentPoints: totalPoints,
            gameStatus,
            isCaptainInAnyLeague,
            leagueCount: playerLeagues.length
          };
        } catch (error) {
          console.error(`Error processing player ${player.id}:`, error);
          return null;
        }
      });

      const players = (await Promise.all(playersPromises)).filter(Boolean) as ActivePlayer[];
      
      // Sort players: live first, then by points
      players.sort((a, b) => {
        const statusOrder = { live: 0, upcoming: 1, final: 2 };
        const statusDiff = statusOrder[a.gameStatus] - statusOrder[b.gameStatus];
        if (statusDiff !== 0) return statusDiff;
        return b.currentPoints - a.currentPoints;
      });

      setActivePlayers(players.slice(0, 5)); // Show top 5 for widget

      // Extract recent plays (simplified)
      const plays: RecentPlay[] = [];
      for (const { player, leagues: playerLeagues } of Object.values(playerLeagueData)) {
        if (player.gameIdForWeek && player.entityType === 'player') {
          try {
            const gameStats = await fetchDetailedGameStatsForEntity(
              player.id,
              player.entityType,
              player.gameIdForWeek
            );

            if (gameStats && 'rawBoxScoreStats' in gameStats) {
              const playerGameStats = gameStats as { rawBoxScoreStats?: { scoringPlays?: Array<{
                playerIDs?: string[];
                scoreType?: string;
                score?: string;
                scorePeriod?: string;
                scoreTime?: string;
              }> } };
              
              const scoringPlays = playerGameStats.rawBoxScoreStats?.scoringPlays || [];
              const playerPlays = scoringPlays.filter(play => 
                play.playerIDs && Array.isArray(play.playerIDs) && play.playerIDs.includes(player.id)
              );

              const isCaptain = playerLeagues.some(pl => pl.isCaptain);
              
              for (const play of playerPlays.slice(-2)) { // Last 2 plays per player
                if (play.scoreType && play.score && play.scorePeriod && play.scoreTime) {
                  plays.push({
                    playerName: player.name,
                    playDescription: play.score,
                    fantasyPoints: play.scoreType.toLowerCase().includes('td') ? (isCaptain ? 9 : 6) : 3,
                    isCaptain,
                    period: play.scorePeriod,
                    time: play.scoreTime
                  });
                }
              }
            }
          } catch (error) {
            console.error(`Error fetching plays for ${player.id}:`, error);
          }
        }
      }

      setRecentPlays(plays.slice(0, 5)); // Show latest 5 plays
    } catch (error) {
      console.error('Error fetching live data:', error);
      setError('Failed to load live data');
    } finally {
      if (!isRefresh) {
        setIsLoading(false);
      }
    }
  };

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

  // Fetch live data when leagues are loaded
  useEffect(() => {
    if (leagues.length > 0) {
      fetchLiveData();
    }
  }, [leagues, currentWeek]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (activePlayers.length > 0 || recentPlays.length > 0) {
      refreshIntervalRef.current = setInterval(() => {
        fetchLiveData(true);
      }, 30000);

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
        }
      };
    }
  }, [activePlayers.length, recentPlays.length]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'live': return '🔴';
      case 'final': return '⏸️';
      case 'upcoming': return '⏱️';
      default: return '❓';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'live': return 'text-red-500';
      case 'final': return 'text-gray-500';
      case 'upcoming': return 'text-blue-500';
      default: return 'text-gray-400';
    }
  };

  if (isLoading) {
    return (
      <div className={isMobileView ? "py-8" : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6"}>
        <div className="flex items-center justify-center py-8">
          <Spinner size="md" className="mr-2" />
          <span className="text-gray-500 dark:text-gray-400">Loading live scoring...</span>
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

  const hasData = activePlayers.length > 0 || recentPlays.length > 0;

  if (!hasData) {
    return (
      <div className={isMobileView ? "py-8" : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6"}>
        {!isMobileView && (
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
            Live Scoring
          </h2>
        )}
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p>No active players found</p>
          <p className="text-sm mt-1">Set your lineup to see live scoring!</p>
        </div>
      </div>
    );
  }

  return (
    <div className={isMobileView ? "space-y-4" : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 shadow-lg hover:shadow-xl transition-shadow duration-200"}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
          Live Scoring
        </h2>
        
        {/* Tab Switcher */}
        <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('players')}
            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'players'
                ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white'
            }`}
          >
            Players
          </button>
          <button
            onClick={() => setActiveTab('plays')}
            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'plays'
                ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white'
            }`}
          >
            Recent
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {activeTab === 'players' ? (
          // Active Players Tab
          activePlayers.length > 0 ? (
            activePlayers.map((player) => (
              <div
                key={`${player.id}-${player.entityType}-${player.position}`}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-800 dark:text-white truncate">
                      {player.name}
                    </span>
                    {player.isCaptainInAnyLeague && (
                      <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400 px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 rounded">
                        C
                      </span>
                    )}
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {player.position}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className={getStatusColor(player.gameStatus)}>
                      {getStatusIcon(player.gameStatus)}
                    </span>
                    <span className="text-gray-600 dark:text-gray-300">
                      {player.team}
                    </span>
                    {player.leagueCount > 1 && (
                      <span className="text-xs text-blue-600 dark:text-blue-400 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 rounded">
                        {player.leagueCount}x
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-gray-800 dark:text-white">
                    {player.currentPoints.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    pts
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-4 text-gray-500 dark:text-gray-400">
              <p className="text-sm">No active players</p>
            </div>
          )
        ) : (
          // Recent Plays Tab
          recentPlays.length > 0 ? (
            recentPlays.map((play, index) => (
              <div
                key={`${play.playerName}-${play.period}-${play.time}-${index}`}
                className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
              >
                <div className="text-lg flex-shrink-0 mt-0.5">🏈</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-800 dark:text-white">
                      {play.playerName}
                    </span>
                    {play.isCaptain && (
                      <span className="text-xs text-yellow-600 dark:text-yellow-400">⭐</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-300 mb-1">
                    {play.playDescription}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>{play.period} {play.time}</span>
                    <span className="text-green-600 dark:text-green-400 font-medium">
                      +{play.fantasyPoints} pts
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-4 text-gray-500 dark:text-gray-400">
              <p className="text-sm">No recent scoring plays</p>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default LiveScoringWidget; 