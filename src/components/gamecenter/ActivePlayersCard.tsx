import React, { useState, useEffect } from 'react';
import { League } from '../../utils/leagues';
import { listenToStoredWeeklyLineup, fetchSelectablePlayerById, fetchSelectableTeamById, StoredLineupData, fetchDetailedGameStatsForEntity } from '../../services/lineupFetchingService';
import type { SelectablePlayer, SelectableTeam, PositionKey } from '../../types/lineup';
import Spinner from '../ui/Spinner';

interface ActivePlayer {
  id: string;
  name: string;
  position: string;
  team: string;
  entityType: 'player' | 'team';
  currentPoints: number;
  gameStatus: 'upcoming' | 'live' | 'final';
  gameTime?: string;
  opponent?: string;
  recentPlay?: string;
  leagueCount: number;
  isCaptainInAnyLeague: boolean;
}

interface ActivePlayersCardProps {
  userId: string;
  leagues: League[];
  selectedWeek: number;
}

const ActivePlayersCard: React.FC<ActivePlayersCardProps> = ({
  userId,
  leagues,
  selectedWeek
}) => {
  const [activePlayers, setActivePlayers] = useState<ActivePlayer[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Helper function to fetch real game stats including fantasy points and scoring plays
  const fetchEntityGameStats = async (
    entityId: string,
    entityType: 'player' | 'team',
    gameId: string | undefined,
    positionKey?: string
  ): Promise<{ fantasyPoints: number; recentPlay: string }> => {
    if (!gameId) {
      return { fantasyPoints: 0, recentPlay: '' };
    }

    try {
      const gameStats = await fetchDetailedGameStatsForEntity(
        entityId,
        entityType,
        gameId
      );

      if (!gameStats) {
        return { fantasyPoints: 0, recentPlay: '' };
      }

      let fantasyPoints = 0;
      let recentPlay = '';

      if (entityType === 'player' && 'fantasyPoints' in gameStats) {
        const playerStats = gameStats as { 
          fantasyPoints?: number; 
          rawBoxScoreStats?: { 
            scoringPlays?: Array<{
              playerIDs?: string[];
              scoreType?: string;
              score?: string;
              scorePeriod?: string;
              scoreTime?: string;
            }>;
          };
        };
        fantasyPoints = playerStats.fantasyPoints || 0;
        
        // Extract most recent scoring play
        const rawStats = playerStats.rawBoxScoreStats;
        if (rawStats?.scoringPlays && Array.isArray(rawStats.scoringPlays)) {
          const playerScoringPlays = rawStats.scoringPlays.filter(play => 
            play.playerIDs && Array.isArray(play.playerIDs) && play.playerIDs.includes(entityId)
          );
          
          if (playerScoringPlays.length > 0) {
            const latestPlay = playerScoringPlays[playerScoringPlays.length - 1];
            recentPlay = `${latestPlay.scoreType}: ${latestPlay.score} (${latestPlay.scorePeriod} ${latestPlay.scoreTime})`;
          }
        }
      } else if (entityType === 'team') {
        const teamStats = gameStats as {
          fantasyPointsPassing?: number;
          fantasyPointsRushing?: number;
          fantasyPointsDefense?: number;
          fantasyPointsSpecialTeams?: number;
          aggregatedStatsForCalc?: {
            passingStats?: {
              totalPassingTDs?: number;
              totalPassingYards?: number;
              totalInterceptionsThrown?: number;
            };
            rushingStats?: {
              totalRushingTDs?: number;
              totalRushingYards?: number;
            };
            specialTeamsStats?: {
              fgMade?: number;
              xpMade?: number;
            };
          };
          rawDefBoxScoreStats?: {
            sacks?: string;
            defensiveInterceptions?: string;
            fumblesRecovered?: string;
            ptsAllowed?: string;
          };
        };
        
        switch (positionKey) {
          case 'PassingOffense': 
            fantasyPoints = teamStats.fantasyPointsPassing || 0;
            if (fantasyPoints > 0 && teamStats.aggregatedStatsForCalc?.passingStats) {
              const stats = teamStats.aggregatedStatsForCalc.passingStats;
              recentPlay = `${stats.totalPassingYards || 0} pass yds, ${stats.totalPassingTDs || 0} TDs`;
            }
            break;
          case 'RushingOffense': 
            fantasyPoints = teamStats.fantasyPointsRushing || 0;
            if (fantasyPoints > 0 && teamStats.aggregatedStatsForCalc?.rushingStats) {
              const stats = teamStats.aggregatedStatsForCalc.rushingStats;
              recentPlay = `${stats.totalRushingYards || 0} rush yds, ${stats.totalRushingTDs || 0} TDs`;
            }
            break;
          case 'Defense': 
            fantasyPoints = teamStats.fantasyPointsDefense || 0;
            if (fantasyPoints > 0 && teamStats.rawDefBoxScoreStats) {
              const stats = teamStats.rawDefBoxScoreStats;
              const sacks = parseInt(stats.sacks || '0', 10);
              const ints = parseInt(stats.defensiveInterceptions || '0', 10);
              const ptsAllowed = parseInt(stats.ptsAllowed || '0', 10);
              recentPlay = `${sacks} sacks, ${ints} INTs, ${ptsAllowed} pts allowed`;
            }
            break;
          case 'SpecialTeams': 
            fantasyPoints = teamStats.fantasyPointsSpecialTeams || 0;
            if (fantasyPoints > 0 && teamStats.aggregatedStatsForCalc?.specialTeamsStats) {
              const stats = teamStats.aggregatedStatsForCalc.specialTeamsStats;
              const fgs = stats.fgMade || 0;
              const xps = stats.xpMade || 0;
              recentPlay = `${fgs} FGs, ${xps} XPs`;
            }
            break;
          default: 
            fantasyPoints = 0;
        }
      }

      return { fantasyPoints, recentPlay };
    } catch (error) {
      console.error(`Error fetching game stats for ${entityType} ${entityId}:`, error);
      return { fantasyPoints: 0, recentPlay: '' };
    }
  };

  // Helper function to get game status (with fallback to time calculation)
  const getGameStatusForEntity = (
    gameStats: { gameStatusCode?: number } | null, 
    gameTimeEpochForWeek?: number
  ): 'upcoming' | 'live' | 'final' => {
    // First try to use real API game status
    if (gameStats && 'gameStatusCode' in gameStats && typeof gameStats.gameStatusCode === 'number') {
      return getGameStatusFromCode(gameStats.gameStatusCode);
    }
    
    // Fallback to time-based calculation
    return getGameStatus(gameTimeEpochForWeek);
  };

  useEffect(() => {
    const fetchActivePlayersForAllLeagues = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Track player data per league to handle captain bonuses correctly
        const playerLeagueData: Record<string, {
          player: SelectablePlayer | SelectableTeam;
          leagues: Array<{
            leagueId: string;
            league: League;
            isCaptain: boolean;
            positionKey?: string;
          }>;
          primaryPosition?: string;
        }> = {};

        // Fetch lineups from all leagues
        const lineupPromises = leagues.map(league => 
          new Promise<void>((resolve) => {
            listenToStoredWeeklyLineup(
              userId,
              league.id,
              selectedWeek,
              async (lineupData: StoredLineupData) => {
                if (lineupData.picks) {
                  // Process each position in the lineup
                  for (const [positionKey, pick] of Object.entries(lineupData.picks)) {
                    if (pick) {
                      // Create unique key for teams by position, simple key for players
                      const key = pick.type === 'team' 
                        ? `${pick.type}-${pick.id}-${positionKey}` 
                        : `${pick.type}-${pick.id}`;
                      
                      if (!playerLeagueData[key]) {
                        // Fetch player/team details
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
                      
                      // Add this league's data
                      if (playerLeagueData[key]) {
                        const isCaptain = pick.type === 'player' && lineupData.captainPlayerId === pick.id;
                        playerLeagueData[key].leagues.push({
                          leagueId: league.id,
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

        // Convert to ActivePlayer format with captain-aware point calculations
        const playersPromises = Object.values(playerLeagueData).map(async ({ player, leagues: playerLeagues, primaryPosition }) => {
          // Fetch base game stats
          const gameStats = await fetchEntityGameStats(
            player.id,
            player.entityType,
            player.gameIdForWeek,
            primaryPosition
          );
          
          // Calculate effective points across all leagues (with captain bonuses)
          let totalEffectivePoints = 0;
          let isCaptainInAnyLeague = false;
          
          for (const leagueData of playerLeagues) {
            let pointsForThisLeague = gameStats.fantasyPoints;
            
            // Apply captain multiplier if this player is captain in this league
            if (leagueData.isCaptain && player.entityType === 'player') {
              const multiplier = leagueData.league.captainPointMultiplier || 1.5;
              pointsForThisLeague *= multiplier;
              isCaptainInAnyLeague = true;
            }
            
            totalEffectivePoints += pointsForThisLeague;
          }
          
          // For game status, fetch detailed stats once
          let gameStatusCode: number | undefined;
          if (player.gameIdForWeek) {
            try {
              const detailedGameStats = await fetchDetailedGameStatsForEntity(
                player.id,
                player.entityType,
                player.gameIdForWeek
              );
              gameStatusCode = detailedGameStats?.gameStatusCode;
            } catch (error) {
              console.error('Error fetching game status:', error);
            }
          }
          
          // Use real game status from API or fallback to time calculation
          const gameStatus = getGameStatusForEntity(
            gameStatusCode !== undefined ? { gameStatusCode } : null,
            player.gameTimeEpochForWeek
          );
          
          return {
            id: player.id,
            name: player.name,
            position: primaryPosition || (player.entityType === 'player' ? (player as SelectablePlayer).position : 'DEF'),
            team: player.teamAbbreviation,
            entityType: player.entityType,
            currentPoints: totalEffectivePoints, // Total points across leagues with captain bonuses
            gameStatus,
            gameTime: formatGameTime(player.gameTimeEpochForWeek),
            opponent: player.opponentForWeek,
            recentPlay: gameStats.recentPlay,
            leagueCount: playerLeagues.length,
            isCaptainInAnyLeague // Track if captain in any league
          };
        });

        const players = await Promise.all(playersPromises);

        // Sort by game status (live first, then upcoming, then final), then by position, then by points
        players.sort((a, b) => {
          const statusOrder = { live: 0, upcoming: 1, final: 2 };
          const statusDiff = statusOrder[a.gameStatus] - statusOrder[b.gameStatus];
          if (statusDiff !== 0) return statusDiff;
          
          // Position-based sorting
          const positionOrder = { 
            'QB': 0, 
            'WR': 1, 
            'RB': 2, 
            'TE': 3, 
            'PassingOffense': 4, 
            'RushingOffense': 5, 
            'Defense': 6, 
            'DEF': 6, // Alias for Defense
            'SpecialTeams': 7,
            'K': 7 // Alias for Special Teams (kicker)
          };
          
          const getPositionOrder = (position: string) => {
            return positionOrder[position as keyof typeof positionOrder] ?? 999; // Unknown positions go to end
          };
          
          const positionDiff = getPositionOrder(a.position) - getPositionOrder(b.position);
          if (positionDiff !== 0) return positionDiff;
          
          // Finally sort by points (highest first)
          return b.currentPoints - a.currentPoints;
        });

        setActivePlayers(players);
      } catch (err) {
        console.error('Error fetching active players:', err);
        setError('Failed to load active players');
      } finally {
        setIsLoading(false);
      }
    };

    if (userId && leagues.length > 0) {
      fetchActivePlayersForAllLeagues();
    }
  }, [userId, leagues, selectedWeek]);

  const getGameStatus = (gameTimeEpoch?: number): 'upcoming' | 'live' | 'final' => {
    if (!gameTimeEpoch) return 'upcoming';
    
    const now = Date.now() / 1000;
    const gameStart = gameTimeEpoch;
    const gameEnd = gameStart + (3.5 * 60 * 60); // 3.5 hours after start
    
    if (now < gameStart) return 'upcoming';
    if (now > gameEnd) return 'final';
    return 'live';
  };

  const formatGameTime = (gameTimeEpoch?: number): string => {
    if (!gameTimeEpoch) return '';
    
    const date = new Date(gameTimeEpoch * 1000);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

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

  // Helper function to convert Tank01 gameStatusCode to display status
  const getGameStatusFromCode = (gameStatusCode?: number): 'upcoming' | 'live' | 'final' => {
    switch (gameStatusCode) {
      case 0: return 'upcoming';  // Game has not started yet
      case 1: return 'live';      // Game is currently in progress
      case 2: return 'final';     // Game is completed/final
      case 3: return 'upcoming';  // Game postponed - treat as upcoming
      case 4: return 'upcoming';  // Game suspended - treat as upcoming
      default: return 'upcoming'; // Default fallback
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <Spinner size="md" className="mx-auto mb-3" />
        <p>Loading your active players...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-500">
        <p>{error}</p>
      </div>
    );
  }

  if (activePlayers.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <p>No active players found for Week {selectedWeek}</p>
        <p className="text-sm mt-1">Set your lineup to see live scoring!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Captain feature explanation */}
      {activePlayers.some(p => p.isCaptainInAnyLeague) && (
        <div className="text-xs text-gray-600 dark:text-gray-400 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-2">
          <div className="flex items-center gap-1">
            <span className="text-yellow-600 dark:text-yellow-400">⭐</span>
            <span>Captain bonuses included in total points. Points are aggregated across all leagues.</span>
          </div>
        </div>
      )}
      
      {activePlayers.map((player) => (
        <div
          key={`${player.id}-${player.entityType}-${player.position}`}
          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-gray-800 dark:text-white">
                {player.name}
              </span>
              {player.isCaptainInAnyLeague && player.entityType === 'player' && (
                <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400 px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 rounded">
                  C
                </span>
              )}
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">
                {player.position}
              </span>
              {player.entityType === 'player' && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {player.team}
                </span>
              )}
              {player.leagueCount > 1 && (
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 rounded">
                  {player.leagueCount}x
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
              <span className="flex items-center gap-1">
                <span className={getStatusColor(player.gameStatus)}>
                  {getStatusIcon(player.gameStatus)}
                </span>
                {player.opponent && (
                  <span>{player.opponent}</span>
                )}
                {player.gameTime && player.gameStatus === 'upcoming' && (
                  <span>• {player.gameTime}</span>
                )}
              </span>
            </div>
            
            {player.recentPlay && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {player.recentPlay}
              </div>
            )}
          </div>
          
          <div className="text-right">
            <div className="text-lg font-bold text-gray-800 dark:text-white flex items-center justify-end gap-1">
              {player.currentPoints.toFixed(2)}
              {player.isCaptainInAnyLeague && player.entityType === 'player' && (
                <span className="text-xs text-yellow-600 dark:text-yellow-400">
                  ⭐
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              pts
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ActivePlayersCard; 