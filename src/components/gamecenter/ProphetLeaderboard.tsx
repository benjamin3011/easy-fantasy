import React, { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase/firebase';

interface ProphetLeaderboardEntry {
  userId: string;
  userName: string;
  teamName: string;
  weeklyPoints: number;
  totalPoints: number;
  accuracy: number;
  currentStreak: number;
  bestStreak: number;
  totalCorrect: number;
  totalPicks: number;
}

interface ProphetLeaderboardProps {
  leagueId: string;
  season?: number;
}

export const ProphetLeaderboard: React.FC<ProphetLeaderboardProps> = ({ 
  leagueId, 
  season = 2025 
}) => {
  const [leaderboard, setLeaderboard] = useState<ProphetLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLeaderboard();
  }, [leagueId, season]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    setError(null);

    try {
      const getProphetLeaderboardFunction = httpsCallable(functions, 'getProphetLeaderboard');
      const result = await getProphetLeaderboardFunction({
        leagueId,
        season
      });

      const data = result.data as { success: boolean; leaderboard: ProphetLeaderboardEntry[] };
      
      if (data.success) {
        setLeaderboard(data.leaderboard);
      } else {
        setError('Failed to load leaderboard');
      }
    } catch (err) {
      setError(`Error loading leaderboard: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${rank}`;
    }
  };

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 70) return 'text-green-600';
    if (accuracy >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center p-8 sm:p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mb-4"></div>
        <p className="text-gray-600 dark:text-gray-400 text-sm">Loading prophet leaderboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
        <div className="text-4xl mb-3">❌</div>
        <h3 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">
          Error Loading Leaderboard
        </h3>
        <p className="text-red-700 dark:text-red-300 mb-4 text-sm sm:text-base">{error}</p>
        <button
          onClick={fetchLeaderboard}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium min-h-[40px]"
        >
          🔄 Try Again
        </button>
      </div>
    );
  }

  if (leaderboard.length === 0) {
    return (
      <div className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-6 sm:p-8 text-center">
        <div className="text-4xl mb-3">🎯</div>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
          No Prophet Points Yet
        </h3>
        <p className="text-gray-600 dark:text-gray-400 text-sm sm:text-base">
          Start making game predictions to appear on the leaderboard!
        </p>
        <p className="text-gray-500 dark:text-gray-500 text-xs mt-2">
          Switch to the "Make Picks" tab to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        {/* Mobile-First Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 sm:p-6 rounded-t-lg">
          <h2 className="text-lg sm:text-2xl font-bold mb-1 sm:mb-2 flex items-center gap-2">
            🔮 Prophet Points Leaderboard
          </h2>
          <p className="text-purple-100 text-sm sm:text-base">
            Who can predict the future? Weekly game winners earn Prophet Points!
          </p>
        </div>

        {/* Mobile Cards - Show on mobile, hide on desktop */}
        <div className="block lg:hidden">
          <div className="p-3 sm:p-4 space-y-3">
            {leaderboard.map((entry, index) => (
              <div key={entry.userId} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                {/* Rank and Team Info */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">
                        {getRankIcon(index + 1)}
                      </span>
                      <div className="text-sm font-bold text-gray-600 dark:text-gray-400">
                        #{index + 1}
                      </div>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-white text-sm">
                        {entry.teamName}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {entry.userName}
                      </div>
                    </div>
                  </div>
                  
                  {/* Total Points - Prominent on mobile */}
                  <div className="text-right">
                    <div className="text-xl font-bold text-gray-900 dark:text-white">
                      {entry.totalPoints}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      total pts
                    </div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                  <div className="text-center">
                    <div className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                      +{entry.weeklyPoints}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      this week
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <div className={`text-sm font-bold ${getAccuracyColor(entry.accuracy)}`}>
                      {entry.accuracy}%
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      accuracy
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {entry.totalCorrect}-{entry.totalPicks - entry.totalCorrect}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      record
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Desktop Table - Hide on mobile, show on desktop */}
        <div className="hidden lg:block">
          <div className="overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Team
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    This Week
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total Points
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Accuracy
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Record
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600">
                {leaderboard.map((entry, index) => (
                  <tr key={entry.userId} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">
                          {getRankIcon(index + 1)}
                        </span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {index + 1}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {entry.teamName}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {entry.userName}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                        +{entry.weeklyPoints}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="text-lg font-bold text-gray-900 dark:text-white">
                        {entry.totalPoints}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className={`text-sm font-medium ${getAccuracyColor(entry.accuracy)}`}>
                        {entry.accuracy}%
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {entry.totalCorrect}-{entry.totalPicks - entry.totalCorrect}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {entry.totalPicks} picks
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Empty State Footer for both layouts */}
        {leaderboard.length === 0 && (
          <div className="p-6 text-center">
            <div className="text-4xl mb-2">🎯</div>
            <p className="text-gray-500 dark:text-gray-400">
              No predictions yet this season!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}; 