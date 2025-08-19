import { Suspense } from 'react';
import { League } from '../../../utils/leagues';
import ModernLeaderboard from '../ModernLeaderboard';
import LeagueQuickActions from '../LeagueQuickActions';

interface StandingsTabProps {
  league: League;
}

export default function StandingsTab({ league }: StandingsTabProps) {
  const memberCount = league.members?.length ?? 0;

  return (
    <div className="space-y-4">
      {/* Quick Actions */}
      <LeagueQuickActions league={league} />

      {/* League Standings */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 md:p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 md:mb-6">
          League Standings
        </h3>
        <Suspense fallback={<div className="h-64 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />}>
          <ModernLeaderboard members={league.members} leagueId={league.id} />
        </Suspense>
      </div>

      {memberCount === 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6">
          <div className="flex items-center">
            <div className="text-amber-600 dark:text-amber-400 mr-3">⚠️</div>
            <div>
              <h4 className="font-medium text-amber-800 dark:text-amber-200">No Active Members</h4>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Invite friends to join your league using the code: <span className="font-mono font-bold">{league.code}</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}