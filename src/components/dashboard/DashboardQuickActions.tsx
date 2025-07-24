import React from 'react';
import { useNavigate } from 'react-router';
import { League } from '../../utils/leagues';

interface DashboardQuickActionsProps {
  leagues: League[];
  currentWeek: number;
  lineupsComplete: number;
  totalLeagues: number;
  nextGameTime: number | null;
}

const DashboardQuickActions: React.FC<DashboardQuickActionsProps> = ({
  leagues,
  currentWeek,
  lineupsComplete,
  totalLeagues,
  nextGameTime
}) => {
  const navigate = useNavigate();
  const primaryLeague = leagues[0] || null;

  const formatTimeUntilLock = (nextGameTime: number | null): string => {
    if (!nextGameTime) return '';
    
    const now = Date.now();
    const timeUntil = nextGameTime - now;
    
    if (timeUntil <= 0) return 'Locked';
    
    const hours = Math.floor(timeUntil / (1000 * 60 * 60));
    const minutes = Math.floor((timeUntil % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const timeUntilLock = formatTimeUntilLock(nextGameTime);
  const needsLineup = lineupsComplete < totalLeagues;

  const quickActions = [
    {
      id: 'lineup',
      title: needsLineup ? 'Complete Lineup' : 'View Lineup',
      description: needsLineup 
        ? `${totalLeagues - lineupsComplete} lineup${totalLeagues - lineupsComplete !== 1 ? 's' : ''} incomplete`
        : 'All lineups complete',
      icon: needsLineup ? '⚠️' : '✅',
      color: needsLineup ? 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20' : 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20',
      textColor: needsLineup ? 'text-orange-800 dark:text-orange-200' : 'text-green-800 dark:text-green-200',
      urgent: needsLineup && timeUntilLock && timeUntilLock !== 'Locked',
      onClick: () => {
        if (primaryLeague) {
          navigate(`/lineup?league=${primaryLeague.id}&week=${currentWeek}`);
        } else {
          navigate('/lineup');
        }
      }
    },
    {
      id: 'strategy',
      title: 'Strategy Tips',
      description: 'AI-powered lineup insights',
      icon: '📊',
      color: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20',
      textColor: 'text-blue-800 dark:text-blue-200',
      onClick: () => {
        if (primaryLeague) {
          navigate(`/lineup?league=${primaryLeague.id}&week=${currentWeek}`);
        } else {
          navigate('/lineup');
        }
      }
    },
    {
      id: 'leagues',
      title: 'My Leagues',
      description: `${totalLeagues} active league${totalLeagues !== 1 ? 's' : ''}`,
      icon: '🏆',
      color: 'border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20',
      textColor: 'text-purple-800 dark:text-purple-200',
      onClick: () => navigate('/leagues')
    }
  ];

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
          Quick Actions
        </h3>
        {timeUntilLock && timeUntilLock !== 'Locked' && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Locks in {timeUntilLock}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {quickActions.map((action) => (
          <button
            key={action.id}
            onClick={action.onClick}
            className={`w-full p-4 border rounded-lg transition-all duration-200 hover:shadow-md ${action.color} hover:scale-[1.02]`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-xl">{action.icon}</div>
                <div className="text-left">
                  <div className={`font-semibold ${action.textColor}`}>
                    {action.title}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {action.description}
                  </div>
                </div>
              </div>
              {action.urgent && (
                <div className="text-xs font-medium text-orange-600 dark:text-orange-400 px-2 py-1 bg-orange-100 dark:bg-orange-900/30 rounded">
                  URGENT
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Week Info */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
          <span>Week {currentWeek} of 18</span>
          <span>{Math.round((currentWeek / 18) * 100)}% complete</span>
        </div>
        <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div 
            className="bg-brand-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(currentWeek / 18) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default DashboardQuickActions; 