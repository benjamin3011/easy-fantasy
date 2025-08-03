import { Suspense } from 'react';
import { League } from '../../../utils/leagues';
import { ProphetLeaderboard } from '../../gamecenter/ProphetLeaderboard';
import { APP_CONFIG } from '../../../config/appConfig';

interface LeaderboardTabProps {
  league: League;
}

export default function LeaderboardTab({ league }: LeaderboardTabProps) {
  if (!league.enableWeeklyTips) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center">
        <div className="text-6xl mb-4">🎯</div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Tips Not Enabled
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Weekly tips must be enabled to view the prophet leaderboard.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Prophet Leaderboard
      </h3>
      <Suspense fallback={<div className="h-64 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />}>
        <ProphetLeaderboard 
          leagueId={league.id}
          season={parseInt(APP_CONFIG.CURRENT_NFL_SEASON)}
        />
      </Suspense>
    </div>
  );
}