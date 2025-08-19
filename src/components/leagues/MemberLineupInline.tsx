/**
 * Member Lineup Inline Component
 * 
 * Inline component to display a league member's lineup with progressive reveal.
 * Expands directly within the standings table when "View Lineup" is clicked.
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchStoredWeeklyLineup, fetchWeeklySchedule, fetchSelectablePlayerById, fetchSelectableTeamById, StoredLineupData, GameInfoFromSchedule } from '../../services/lineupFetchingService';
import { PositionKey } from '../../types/lineup';
import { Member } from '../../utils/leagues';
import { useLeagueContext } from '../../context/LeagueContext';
import { useAuth } from '../../context/AuthContext';
import { APP_CONFIG } from '../../config/appConfig';
import { formatTimeUntilReveal } from '../../services/lineupVisibilityService';

// Type for the slot data we build
interface VisibleSlot {
  position: string;
  isVisible: boolean;
  isCaptain: boolean;
  timeUntilReveal: number | null;
  entity: {
    id: string;
    name: string;
    type: 'player' | 'team';
    teamAbbreviation: string;
    actualPoints: number | undefined;
    usageCount: number;
  };
}

interface MemberLineupInlineProps {
  member: Member;
  leagueId: string;
}

export default function MemberLineupInline({
  member,
  leagueId
}: MemberLineupInlineProps) {
  const { effectiveWeek } = useLeagueContext();
  const { user } = useAuth();
  const season = APP_CONFIG.CURRENT_NFL_SEASON;
  const { data: lineup, isLoading: lineupLoading, isError: lineupError } = useQuery<StoredLineupData | null>({
    queryKey: ['memberLineup', member.uid, leagueId, effectiveWeek, season],
    queryFn: () => fetchStoredWeeklyLineup(member.uid, leagueId, effectiveWeek, season),
    enabled: !!member.uid && !!leagueId && effectiveWeek > 0,
    staleTime: 30_000,
  });
  const { data: weeklySchedule, isLoading: scheduleLoading, isError: scheduleError } = useQuery({
    queryKey: ['weeklySchedule', season, effectiveWeek],
    queryFn: () => fetchWeeklySchedule(season, effectiveWeek),
    enabled: effectiveWeek > 0,
    staleTime: 60_000,
  });

  // Check if viewing own lineup
  const isViewingOwnLineup = user?.uid === member.uid;

  const loading = lineupLoading || scheduleLoading;
  const error = lineupError || scheduleError ? 'Failed to load lineup' : null;

  // Build visible slots with proper progressive reveal
  const [visibleSlots, setVisibleSlots] = useState<VisibleSlot[]>([]);
  const [processingSlots, setProcessingSlots] = useState(false);

  useEffect(() => {
    const buildSlots = async () => {
      if (!lineup || !lineup.picks) {
        setVisibleSlots([]);
        setProcessingSlots(false);
        return;
      }

      // Only start processing if we have actual picks
      const pickCount = Object.keys(lineup.picks).length;
      if (pickCount === 0) {
        setVisibleSlots([]);
        setProcessingSlots(false);
        return;
      }

      // Start processing
      setProcessingSlots(true);

      const slots: VisibleSlot[] = [];
      for (const [position, pick] of Object.entries(lineup.picks || {})) {
        if (!pick) {
          // Empty slot - always visible as empty
          slots.push({ 
            position, 
            isVisible: true, 
            isCaptain: false, 
            timeUntilReveal: null,
            entity: {
              id: '',
              name: '',
              type: 'player' as const,
              teamAbbreviation: '',
              actualPoints: undefined,
              usageCount: 0
            }
          });
          continue;
        }

        let entityName = pick.name || 'Unknown';
        let teamAbbreviation = pick.teamAbbreviation || '';
        let actualPoints: number | undefined = undefined;

        // Check entity visibility for progressive reveal
        let isVisible = true;
        let timeUntilReveal: number | null = null;
        
        if (weeklySchedule && pick.teamAbbreviation) {
          const { checkEntityVisibility } = await import('../../services/lineupVisibilityService');
          
          // Find the game ID for this team from the weekly schedule
          const teamGame = weeklySchedule.games.find((game: GameInfoFromSchedule) => 
            game.home === pick.teamAbbreviation || game.away === pick.teamAbbreviation
          );
          
          if (teamGame) {
            // Convert to the expected type structure for visibility service
            const visibilitySchedule = {
              season: weeklySchedule.season,
              week: weeklySchedule.week,
              games: weeklySchedule.games.map(game => ({
                gameID: game.gameID,
                seasonType: '', // Not available in GameInfoFromSchedule
                week: '', // Not available in GameInfoFromSchedule  
                gameDate: '', // Not available in GameInfoFromSchedule
                gameTime_epoch: String(game.gameTime_epoch), // Convert to string
                teamIDHome: game.teamIDHome,
                teamIDAway: game.teamIDAway,
                home: game.home || '',
                away: game.away || '',
                gameStatus: game.gameStatus || '',
                gameStatusText: game.gameStatus || '' // Use gameStatus as fallback
              })),
              lastUpdated: new Date()
            };
            
            const visibilityResult = checkEntityVisibility(
              pick.id,
              pick.type,
              teamGame.gameID,
              visibilitySchedule
            );
            
            isVisible = visibilityResult.isVisible;
            timeUntilReveal = visibilityResult.timeUntilReveal ?? null;
          }
        }

        try {
          if (isVisible && pick.type === 'player') {
            const playerData = await fetchSelectablePlayerById(pick.id, undefined, weeklySchedule);
            if (playerData) {
              entityName = pick.name || playerData.name;
              teamAbbreviation = pick.teamAbbreviation || playerData.teamAbbreviation;
              actualPoints = playerData.actualFantasyPoints ?? 0;
            }
          } else if (isVisible && pick.type === 'team') {
            const teamData = await fetchSelectableTeamById(pick.id, position as PositionKey, undefined, weeklySchedule);
            if (teamData) {
              entityName = pick.name || teamData.name;
              teamAbbreviation = pick.teamAbbreviation || teamData.teamAbbreviation;
              actualPoints = teamData.actualFantasyPoints ?? 0;
            }
          }
        } catch (error) {
          console.error(`Error fetching entity data for ${pick.id}:`, error);
        }

        const slot: VisibleSlot = {
          position,
          isVisible,
          isCaptain: lineup.captainPlayerId === pick.id,
          entity: {
            id: pick.id,
            name: entityName,
            type: pick.type,
            teamAbbreviation,
            actualPoints,
            usageCount: 0,
          },
          timeUntilReveal,
        };
        slots.push(slot);
      }
      setVisibleSlots(slots);
      setProcessingSlots(false); // Finished processing
    };

    buildSlots();
  }, [lineup, weeklySchedule, isViewingOwnLineup]); // Simplified dependencies to avoid infinite loop



  // Skeleton loading component
  const LineupSkeleton = () => (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="p-2 rounded-md border border-gray-200 bg-white dark:bg-gray-700 dark:border-gray-600"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {/* Position skeleton */}
                <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-12 animate-pulse"></div>
                {/* Captain badge skeleton (occasionally) */}
                {index === 2 && (
                  <div className="h-4 bg-yellow-300 dark:bg-yellow-600 rounded w-6 animate-pulse"></div>
                )}
              </div>
              
              {/* Points skeleton */}
              <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-8 animate-pulse"></div>
            </div>

            {/* Player name skeleton */}
            <div className="mt-1">
              <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-20 animate-pulse"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Show skeleton during API loading or slot processing
  if (loading || processingSlots) {
    return <LineupSkeleton />;
  }

  if (error) {
    return (
      <div className="text-center py-6">
        <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  // Define the proper order for positions
  const positionOrder = ['QB', 'RB', 'WR', 'TE', 'PassingOffense', 'RushingOffense', 'Defense', 'SpecialTeams'];
  
  // Position display names
  const positionDisplayNames: { [key: string]: string } = {
    'QB': 'QB',
    'RB': 'RB', 
    'WR': 'WR',
    'TE': 'TE',
    'PassingOffense': 'PASSING',
    'RushingOffense': 'RUSHING', 
    'Defense': 'DEFENSE',
    'SpecialTeams': 'SPECIAL TEAMS'
  };
  
  // Sort lineup slots according to the defined order
  const sortedSlots = visibleSlots.sort((a, b) => {
    const aIndex = positionOrder.indexOf(a.position);
    const bIndex = positionOrder.indexOf(b.position);
    // If position not found in order, put it at the end
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });

  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">



      {/* Progressive reveal disabled for now */}

      {/* Compact Lineup Slots */}
      {sortedSlots.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {sortedSlots.map((slot) => (
            <div
              key={slot.position}
              className="p-2 rounded-md border text-sm 'border-gray-200 bg-white dark:bg-gray-700 dark:border-gray-600"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase">
                    {positionDisplayNames[slot.position] || slot.position}
                  </span>
                  {slot.isCaptain && slot.isVisible && (
                    <span className="px-1 py-0.5 bg-yellow-400 text-yellow-900 text-xs font-bold rounded">
                      👑
                    </span>
                  )}
                </div>
                
                <div className="text-right">
                  {slot.isVisible && slot.entity?.actualPoints !== undefined ? (
                    <span className={`text-sm font-bold ${
                      slot.isCaptain 
                        ? 'text-yellow-600 dark:text-yellow-400' 
                        : 'text-green-600 dark:text-green-400'
                    }`}>
                      {(() => {
                        const basePoints = slot.entity.actualPoints;
                        const finalPoints = slot.isCaptain && slot.entity.type === 'player' 
                          ? basePoints * 1.5 
                          : basePoints;
                        return finalPoints.toFixed(1);
                      })()}
                      {slot.isCaptain && (
                        <span className="ml-1 text-xs">⭐</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {slot.timeUntilReveal ? `🔒 ${formatTimeUntilReveal(slot.timeUntilReveal)}` : '🔒'}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-1">
                {slot.isVisible && slot.entity ? (
                  <div className="font-medium text-gray-900 dark:text-white text-xs">
                    {slot.entity.name}
                  </div>
                ) : (
                  <div className="text-gray-500 dark:text-gray-400 text-xs">
                    {slot.timeUntilReveal ? `🕒 ${formatTimeUntilReveal(slot.timeUntilReveal)}` : '🔒 Hidden'}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6">
          <div className="text-2xl mb-2">🤷‍♂️</div>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            No lineup set for Week {effectiveWeek}
          </p>
        </div>
      )}
    </div>
  );
}