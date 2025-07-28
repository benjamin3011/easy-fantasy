import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getQuickPerformanceData } from '../../services/analyticsService';
import { Link } from 'react-router';

interface QuickPerformanceData {
  currentWeekPoints: number;
  recentAverage: number;
  trend: 'up' | 'down' | 'stable';
  weeksPlayed: number;
  hasCurrentWeekData: boolean;
}

interface QuickPerformanceCardProps {
  leagueId?: string;
}

export default function QuickPerformanceCard({ leagueId }: QuickPerformanceCardProps) {
  const { user } = useAuth();
  const [performanceData, setPerformanceData] = useState<QuickPerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPerformanceData = async () => {
      if (!user?.uid || !leagueId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        const data = await getQuickPerformanceData(user.uid, leagueId);
        setPerformanceData(data);
        
      } catch (err) {
        console.error('Error fetching performance data:', err);
        setError('Unable to load performance data');
      } finally {
        setLoading(false);
      }
    };

    fetchPerformanceData();
  }, [user?.uid, leagueId]);

  // Loading state
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-4"></div>
          <div className="space-y-3">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Quick Performance
        </h2>
        <div className="text-center py-4">
          <div className="text-gray-500 dark:text-gray-400 text-sm">{error}</div>
          <button 
            onClick={() => window.location.reload()}
            className="mt-2 text-blue-600 hover:text-blue-700 text-sm"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // No data state
  if (!performanceData || performanceData.weeksPlayed === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Quick Performance
        </h2>
        <div className="text-center py-8">
          <div className="text-4xl mb-3">⏳</div>
          <h3 className="font-medium text-gray-900 dark:text-white mb-2">
            Waiting for Game Results
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Your performance analytics will appear here once games are played and scored
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/lineup"
              className="flex items-center justify-center py-2 px-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
            >
              📝 Lineup
            </Link>
            <Link
              to="/leagues"
              className="flex items-center justify-center py-2 px-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
            >
              🏆 Leagues
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Get trend display
  const getTrendDisplay = (trend: string) => {
    switch (trend) {
      case 'up':
        return { icon: '📈', color: 'text-green-600 dark:text-green-400', text: 'Trending Up' };
      case 'down':
        return { icon: '📉', color: 'text-red-600 dark:text-red-400', text: 'Trending Down' };
      default:
        return { icon: '📊', color: 'text-gray-600 dark:text-gray-400', text: 'Stable' };
    }
  };

  const trendDisplay = getTrendDisplay(performanceData.trend);

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow duration-200">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Quick Performance
        </h2>
        <Link 
          to="/analytics" 
          className="text-blue-600 hover:text-blue-700 text-sm font-medium"
        >
          View All →
        </Link>
      </div>

      <div className="space-y-4">
        {/* Current Week Performance */}
        {performanceData.hasCurrentWeekData && (
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                  This Week
                </div>
                <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                  {performanceData.currentWeekPoints} pts
                </div>
              </div>
              <div className="text-2xl">{trendDisplay.icon}</div>
            </div>
          </div>
        )}

        {/* Recent Average */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Recent Average ({performanceData.weeksPlayed} weeks)
            </div>
            <div className="text-xl font-semibold text-gray-900 dark:text-white">
              {performanceData.recentAverage} pts
            </div>
          </div>
          <div className={`text-sm font-medium ${trendDisplay.color}`}>
            {trendDisplay.text}
          </div>
        </div>

        {/* Performance Insights */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {performanceData.weeksPlayed}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Weeks Played
              </div>
            </div>
            <div>
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {performanceData.hasCurrentWeekData && performanceData.currentWeekPoints > performanceData.recentAverage ? '🔥' : '📊'}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                {performanceData.hasCurrentWeekData && performanceData.currentWeekPoints > performanceData.recentAverage ? 'Above Average' : 'Form'}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/lineup"
              className="flex items-center justify-center py-2 px-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
            >
              📝 Lineup
            </Link>
            <Link
              to="/analytics"
              className="flex items-center justify-center py-2 px-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
            >
              📊 Analytics
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 