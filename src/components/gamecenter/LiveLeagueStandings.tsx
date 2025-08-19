import React, { useState, useEffect, useRef } from 'react';
import { League } from '../../utils/leagues';
import { fetchStoredWeeklyLineup, fetchSelectablePlayerById, fetchSelectableTeamById, fetchDetailedGameStatsForEntity } from '../../services/lineupFetchingService';
import type { SelectablePlayer, SelectableTeam, PositionKey } from '../../types/lineup';
import Spinner from '../ui/Spinner';

interface LeagueMemberStanding {
  uid: string;
  teamName: string;
  currentPoints: number;
  position: number;
  previousPosition?: number;
  pointsFromLeader: number;
  isCaptainActive: boolean;
  captainPlayerId?: string;
  isCurrentUser: boolean;
}

interface LeagueStandings {
  leagueId: string;
  leagueName: string;
  members: LeagueMemberStanding[];
  isLoading: boolean;
  error?: string;
  lastUpdated?: Date;
}

interface LiveLeagueStandingsProps {
  userId: string;
  leagues: League[];
  selectedWeek: number;
}

const LiveLeagueStandings: React.FC<LiveLeagueStandingsProps> = ({
  userId,
  leagues,
  selectedWeek
}) => {
  const [standingsData, setStandingsData] = useState<LeagueStandings[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Function to calculate points for a specific user in a specific league
  const calculateMemberPoints = async (
    memberUid: string, 
    league: League, 
    week: number
  ): Promise<{ points: number; isCaptainActive: boolean; captainPlayerId?: string }> => {
    try {
      const lineupData = await fetchStoredWeeklyLineup(memberUid, league.id, week);
          let totalPoints = 0;
          let isCaptainActive = false;
          let captainPlayerId: string | undefined;

          if (lineupData?.picks) {
            const pointsPromises = Object.entries(lineupData.picks).map(async ([positionKey, pick]) => {
              if (pick) {
                try {
                  let entity: SelectablePlayer | SelectableTeam | null = null;
                  
                  if (pick.type === 'player') {
                    entity = await fetchSelectablePlayerById(pick.id);
                  } else {
                    entity = await fetchSelectableTeamById(pick.id, positionKey as PositionKey);
                  }

                  if (entity?.gameIdForWeek) {
                    // Fetch actual fantasy points from game stats
                    const gameStats = await fetchDetailedGameStatsForEntity(
                      pick.id,
                      pick.type,
                      entity.gameIdForWeek
                    );

                    if (gameStats) {
                      let basePoints = 0;
                      
                      // Extract base points
                      if (pick.type === 'player' && 'fantasyPoints' in gameStats) {
                        const playerStats = gameStats as { fantasyPoints?: number };
                        basePoints = playerStats.fantasyPoints || 0;
                      } else if (pick.type === 'team') {
                        const teamStats = gameStats as {
                          fantasyPointsPassing?: number;
                          fantasyPointsRushing?: number;
                          fantasyPointsDefense?: number;
                          fantasyPointsSpecialTeams?: number;
                        };
                        switch (positionKey) {
                          case 'PassingOffense': basePoints = teamStats.fantasyPointsPassing || 0; break;
                          case 'RushingOffense': basePoints = teamStats.fantasyPointsRushing || 0; break;
                          case 'Defense': basePoints = teamStats.fantasyPointsDefense || 0; break;
                          case 'SpecialTeams': basePoints = teamStats.fantasyPointsSpecialTeams || 0; break;
                        }
                      }

                      // Apply captain multiplier if this player is the captain
                      if (league.enableCaptainFeature && 
                          pick.type === 'player' && 
                          lineupData.captainPlayerId === pick.id) {
                        const multiplier = league.captainPointMultiplier || 1.5;
                        basePoints *= multiplier;
                        isCaptainActive = true;
                        captainPlayerId = pick.id;
                      }

                      totalPoints += basePoints;
                    }
                  }
                } catch (error) {
                  console.error(`Error fetching stats for ${pick.type} ${pick.id}:`, error);
                }
              }
              return 0;
            });

            await Promise.all(pointsPromises);
          }

      return { 
        points: totalPoints, 
        isCaptainActive,
        captainPlayerId: isCaptainActive ? captainPlayerId : undefined
      };
    } catch (error) {
      console.error(`Error fetching lineup for ${memberUid} in league ${league.id}:`, error);
      return { points: 0, isCaptainActive: false };
    }
  };

  // Fetch standings for all leagues
  const fetchStandings = async (isRefresh: boolean = false) => {
    if (!isRefresh) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const standingsPromises = leagues.map(async (league): Promise<LeagueStandings> => {
        try {
          // Store previous positions for comparison
          const previousStandings = standingsData.find(s => s.leagueId === league.id);
          
          // Calculate points for all members in parallel
          const memberStandingsPromises = league.members.map(async (member) => {
            const { points, isCaptainActive, captainPlayerId } = await calculateMemberPoints(
              member.uid, 
              league, 
              selectedWeek
            );

            // Get previous position
            const previousPosition = previousStandings?.members.find(m => m.uid === member.uid)?.position;

            return {
              uid: member.uid,
              teamName: member.teamName,
              currentPoints: points,
              position: 0, // Will be calculated after sorting
              previousPosition,
              pointsFromLeader: 0, // Will be calculated after sorting
              isCaptainActive,
              captainPlayerId,
              isCurrentUser: member.uid === userId
            };
          });

          const memberStandings = await Promise.all(memberStandingsPromises);

          // Sort by points (highest first) and assign positions
          memberStandings.sort((a, b) => b.currentPoints - a.currentPoints);
          
          const leaderPoints = memberStandings[0]?.currentPoints || 0;
          
          memberStandings.forEach((member, index) => {
            member.position = index + 1;
            member.pointsFromLeader = leaderPoints - member.currentPoints;
          });

          return {
            leagueId: league.id,
            leagueName: league.name,
            members: memberStandings,
            isLoading: false,
            lastUpdated: new Date()
          };
        } catch (error) {
          console.error(`Error calculating standings for league ${league.id}:`, error);
          return {
            leagueId: league.id,
            leagueName: league.name,
            members: [],
            isLoading: false,
            error: `Failed to load standings for ${league.name}`,
            lastUpdated: new Date()
          };
        }
      });

      const standings = await Promise.all(standingsPromises);
      setStandingsData(standings);
    } catch (error) {
      console.error('Error fetching league standings:', error);
      setError('Failed to load league standings');
    } finally {
      if (!isRefresh) {
        setIsLoading(false);
      }
    }
  };

  // Initial load
  useEffect(() => {
    if (userId && leagues.length > 0) {
      fetchStandings();
    }
  }, [userId, leagues, selectedWeek]);

  // Auto-refresh every 30 seconds when there are live games
  useEffect(() => {
    if (standingsData.length > 0) {
      refreshIntervalRef.current = setInterval(() => {
        fetchStandings(true);
      }, 30000); // 30 seconds

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
        }
      };
    }
  }, [standingsData.length]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  const getPositionIcon = (position: number) => {
    switch (position) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `${position}`;
    }
  };

  const getPositionColor = (position: number, isCurrentUser: boolean) => {
    if (isCurrentUser) {
      return 'text-blue-600 dark:text-blue-400 font-bold';
    }
    switch (position) {
      case 1: return 'text-yellow-600 dark:text-yellow-400 font-bold';
      case 2: return 'text-gray-600 dark:text-gray-400 font-bold';
      case 3: return 'text-orange-600 dark:text-orange-400 font-bold';
      default: return 'text-gray-700 dark:text-gray-300';
    }
  };

  const getPositionMovement = (currentPosition: number, previousPosition?: number) => {
    if (!previousPosition) return null;
    
    if (currentPosition < previousPosition) {
      return <span className="text-green-500 text-xs ml-1">↗️</span>;
    } else if (currentPosition > previousPosition) {
      return <span className="text-red-500 text-xs ml-1">↘️</span>;
    }
    return null;
  };

  const formatLastUpdated = (lastUpdated?: Date) => {
    if (!lastUpdated) return '';
    const now = new Date();
    const diffMs = now.getTime() - lastUpdated.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    return `${diffMinutes}m ago`;
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <Spinner size="md" className="mx-auto mb-3" />
        <p className="text-gray-500 dark:text-gray-400">Loading live standings...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-500">
        <p>{error}</p>
        <button 
          onClick={() => fetchStandings()}
          className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (standingsData.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <p>No leagues found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {standingsData.map((leagueData) => (
        <div key={leagueData.leagueId} className="space-y-3">
          {/* League Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
              {leagueData.leagueName}
            </h3>
            <div className="text-right">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Week {selectedWeek}
              </div>
              {leagueData.lastUpdated && (
                <div className="text-xs text-gray-400 dark:text-gray-500">
                  {formatLastUpdated(leagueData.lastUpdated)}
                </div>
              )}
            </div>
          </div>

          {/* League Standings */}
          {leagueData.error ? (
            <div className="text-sm text-red-500 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              {leagueData.error}
            </div>
          ) : leagueData.isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Spinner size="sm" className="mr-2" />
              <span className="text-sm text-gray-500 dark:text-gray-400">Loading...</span>
            </div>
          ) : (
            <div className="space-y-2">
              {leagueData.members.map((member) => (
                <div
                  key={member.uid}
                  className={`flex items-center justify-between p-3 rounded-lg transition-all duration-200 ${
                    member.isCurrentUser 
                      ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 shadow-sm' 
                      : 'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Position with movement indicator */}
                    <div className="flex items-center">
                      <div className={`text-lg font-bold ${getPositionColor(member.position, member.isCurrentUser)}`}>
                        {getPositionIcon(member.position)}
                      </div>
                      {getPositionMovement(member.position, member.previousPosition)}
                    </div>
                    
                    {/* Team Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-medium truncate ${member.isCurrentUser ? 'text-blue-800 dark:text-blue-200' : 'text-gray-800 dark:text-white'}`}>
                          {member.teamName}
                        </span>
                      </div>
                      
                      {/* Points from leader */}
                      {member.position > 1 && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          -{member.pointsFromLeader.toFixed(1)} from leader
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Points */}
                  <div className="text-right flex-shrink-0">
                    <div className={`text-lg font-bold ${member.isCurrentUser ? 'text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-white'}`}>
                      {member.currentPoints.toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      pts
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default LiveLeagueStandings; 