import React from 'react';
import { ShootingStarIcon } from '../../icons';
import type { League } from '../../utils/leagues';

interface LeagueStandingKPIProps {
  leagues: League[];
  currentUserId: string | undefined;
  currentWeek: number;
}

const LeagueStandingKPI: React.FC<LeagueStandingKPIProps> = ({
  leagues,
  currentUserId,
  currentWeek
}) => {
  if (!leagues.length || !currentUserId) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="flex items-center">
          <ShootingStarIcon className="w-8 h-8 text-gray-400 mr-3" />
          <div>
            <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              League Standing
            </h4>
            <p className="text-lg font-bold text-gray-500 dark:text-gray-400">
              No League Data
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Calculate standings for all leagues
  const allStandings = leagues.map(league => {
    const userMember = league.members.find(m => m.uid === currentUserId);
    if (!userMember) return null;

    const sortedMembers = [...league.members].sort(
      (a, b) => (b.totalSeasonPoints ?? 0) - (a.totalSeasonPoints ?? 0)
    );
    const rank = sortedMembers.findIndex(m => m.uid === currentUserId) + 1;
    const totalMembers = league.members.length;
    const thisWeekPoints = userMember.weeklyPoints?.[currentWeek] ?? 0;
    const totalSeasonPoints = userMember.totalSeasonPoints ?? 0;

    return {
      leagueName: league.name,
      rank,
      totalMembers,
      thisWeekPoints,
      totalSeasonPoints
    };
  }).filter((standing): standing is NonNullable<typeof standing> => standing !== null);

  if (allStandings.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="flex items-center">
          <ShootingStarIcon className="w-8 h-8 text-gray-400 mr-3" />
          <div>
            <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              League Standing
            </h4>
            <p className="text-lg font-bold text-gray-500 dark:text-gray-400">
              Not Found
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Find best position (lowest rank number)
  const bestStanding = allStandings.reduce((best, current) => 
    current.rank < best.rank ? current : best
  );

  // Calculate total points across all leagues
  const totalPointsAllLeagues = allStandings.reduce((sum, standing) => sum + standing.totalSeasonPoints, 0);
  const totalPointsThisWeek = allStandings.reduce((sum, standing) => sum + standing.thisWeekPoints, 0);

  const getRankIcon = (rank: number) => {
    if (rank === 1) return "🏆";
    if (rank <= 3) return "🥉";
    return "📈";
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <div className="mr-3">
            <ShootingStarIcon className="w-8 h-8 text-brand-500" />
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Best Position
            </h4>
            <p className="text-lg font-bold text-gray-800 dark:text-white">
              {getRankIcon(bestStanding.rank)} {bestStanding.rank} of {bestStanding.totalMembers}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {leagues.length > 1 ? `in ${bestStanding.leagueName}` : bestStanding.leagueName}
            </p>
          </div>
        </div>
        
        <div className="text-right">
          <div className="space-y-1">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                This Week
              </p>
              <p className="text-sm font-bold text-gray-800 dark:text-white">
                {totalPointsThisWeek} pts
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Total{leagues.length > 1 ? ' (All)' : ''}
              </p>
              <p className="text-sm font-bold text-gray-800 dark:text-white">
                {totalPointsAllLeagues}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeagueStandingKPI; 