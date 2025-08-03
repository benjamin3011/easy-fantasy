import { Link } from 'react-router';
import { League } from '../../utils/leagues';
import Button from '../ui/button/Button';
import { calculateCurrentNFLWeek } from '../../utils/nflWeekHelper';

interface LeagueQuickActionsProps {
  league: League;
}

export default function LeagueQuickActions({ league }: LeagueQuickActionsProps) {
  const currentNflWeek = calculateCurrentNFLWeek();

  return (
    <>
      {/* Mobile: Horizontal Scrollable Row */}
      <div className="block md:hidden mb-4">
        <div className="relative">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {/* Scroll hint gradient */}
            <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-gray-50 dark:from-gray-900 to-transparent pointer-events-none z-10" />
            
            {/* Primary Action - Set Lineup */}
            <Link to={`/leagues/${league.id}/lineup/${currentNflWeek}`}>
              <button className="flex items-center gap-1.5 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors text-sm font-medium whitespace-nowrap shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                ⚡ Set Lineup
              </button>
            </Link>

            {/* Tips Action (if enabled) */}
            {league.enableWeeklyTips && (
              <Link to="/tips">
                <button className="flex items-center gap-1.5 px-4 py-2.5 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors text-sm font-medium whitespace-nowrap shadow-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  🎯 Make Tips
                </button>
              </Link>
            )}

            {/* Browse Leagues */}
            <Link to="/leagues">
              <button className="flex items-center gap-1.5 px-4 py-2.5 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm font-medium whitespace-nowrap shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                🏟️ All Leagues
              </button>
            </Link>

            {/* Game Center */}
            <Link to="/gamecenter">
              <button className="flex items-center gap-1.5 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium whitespace-nowrap shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                📺 Live Scores
              </button>
            </Link>

            {/* Profile/Settings */}
            <Link to="/profile">
              <button className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors text-sm font-medium whitespace-nowrap shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                👤 Profile
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* Desktop: Compact Row */}
      <div className="hidden md:block mb-4">
        <div className="flex items-center gap-3">
          <Link to={`/leagues/${league.id}/lineup/${currentNflWeek}`}>
            <Button size="sm" variant="primary">
              ⚡ Set Lineup
            </Button>
          </Link>
          
          {league.enableWeeklyTips && (
            <Link to="/tips">
              <Button size="sm" variant="outline">
                🎯 Make Tips
              </Button>
            </Link>
          )}
          
          <Link to="/leagues">
            <Button size="sm" variant="outline">
              🏟️ All Leagues
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}