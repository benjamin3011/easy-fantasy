import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fetchUserAnalytics, CaptainAnalytics } from '../../services/analyticsService';
import { APP_CONFIG } from '../../config/appConfig';
import { Link } from 'react-router';

interface CaptainTrackerCardProps {
  leagueId?: string;
}

export default function CaptainTrackerCard({ leagueId }: CaptainTrackerCardProps) {
  const { user } = useAuth();
  const [captainData, setCaptainData] = useState<CaptainAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCaptainData = async () => {
      if (!user?.uid || !leagueId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        const season = parseInt(APP_CONFIG.CURRENT_NFL_SEASON.toString());
        const analyticsData = await fetchUserAnalytics(user.uid, leagueId, season);
        
        if (analyticsData) {
          setCaptainData(analyticsData.captainAnalytics);
        } else {
          setCaptainData(null);
        }
        
      } catch (err) {
        console.error('Error fetching captain data:', err);
        setError('Unable to load captain data');
      } finally {
        setLoading(false);
      }
    };

    fetchCaptainData();
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
          Captain Tracker
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
  if (!captainData || captainData.totalBonusPoints === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Captain Tracker
        </h2>
        <div className="text-center py-8">
          <div className="text-4xl mb-3">⏳</div>
          <h3 className="font-medium text-gray-900 dark:text-white mb-2">
            Waiting for Captain Results
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Your captain performance analytics will appear here once games are played and scored
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/lineup"
              className="flex items-center justify-center py-2 px-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
            >
              👑 Captain
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

  // Get top positions sorted by performance
  const topPositions = Object.entries(captainData.positionBreakdown)
    .sort(([,a], [,b]) => b.averageBonus - a.averageBonus)
    .slice(0, 3);

  // ROI color based on performance
  const getRoiColor = (roi: number) => {
    if (roi >= 50) return 'text-green-600 dark:text-green-400';
    if (roi >= 25) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  // Form indicator
  const getFormIndicator = () => {
    const diff = captainData.recentForm - captainData.roi;
    if (Math.abs(diff) < 5) return { icon: '📊', text: 'Stable', color: 'text-gray-600 dark:text-gray-400' };
    if (diff > 0) return { icon: '📈', text: 'Improving', color: 'text-green-600 dark:text-green-400' };
    return { icon: '📉', text: 'Declining', color: 'text-red-600 dark:text-red-400' };
  };

  const formIndicator = getFormIndicator();

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow duration-200">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Captain Tracker
        </h2>
        <Link 
          to="/analytics?tab=captain" 
          className="text-blue-600 hover:text-blue-700 text-sm font-medium"
        >
          View All →
        </Link>
      </div>

      <div className="space-y-4">
        {/* ROI Summary */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-amber-700 dark:text-amber-300">
              Captain ROI
            </div>
            <div className="flex items-center text-sm">
              <span className="mr-1">{formIndicator.icon}</span>
              <span className={`font-medium ${formIndicator.color}`}>
                {formIndicator.text}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className={`text-2xl font-bold ${getRoiColor(captainData.roi)}`}>
                {captainData.roi}%
              </div>
              <div className="text-xs text-amber-600 dark:text-amber-400">
                return on investment
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold text-amber-900 dark:text-amber-100">
                +{captainData.totalBonusPoints}
              </div>
              <div className="text-xs text-amber-600 dark:text-amber-400">
                bonus points
              </div>
            </div>
          </div>
        </div>

        {/* Best Position */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Best Position</div>
            <div className="text-xl font-semibold text-gray-900 dark:text-white">
              {captainData.bestPosition}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600 dark:text-gray-400">Current Streak</div>
            <div className="text-xl font-semibold text-gray-900 dark:text-white">
              {captainData.streaks.current}
              <span className="text-sm ml-1">
                {captainData.streaks.isPositive ? '🔥' : '❄️'}
              </span>
            </div>
          </div>
        </div>

        {/* Position Performance */}
        {topPositions.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2 flex items-center">
              <span className="mr-2">🏆</span>
              Top Positions
            </h3>
            <div className="space-y-2">
              {topPositions.map(([position, stats]) => (
                <div key={position} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 rounded px-3 py-2">
                  <div className="flex items-center">
                    <span className="font-medium text-sm text-gray-900 dark:text-white mr-2">
                      {position}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      ({stats.count}x)
                    </span>
                  </div>
                  <div className="text-sm font-medium text-green-600 dark:text-green-400">
                    +{stats.averageBonus.toFixed(1)} avg
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {captainData.recommendations.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2 flex items-center">
              <span className="mr-2">💡</span>
              Strategy Tips
            </h3>
            <div className="space-y-1">
              {captainData.recommendations.map((tip, index) => (
                <div key={index} className="text-sm text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 rounded px-2 py-1">
                  {tip}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/lineup"
              className="flex items-center justify-center py-2 px-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
            >
              👑 Set Captain
            </Link>
            <Link
              to="/analytics?tab=captain"
              className="flex items-center justify-center py-2 px-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
            >
              📊 Details
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 