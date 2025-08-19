import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PublicLeaguesList from './PublicLeaguesList';
import QueryBoundary from '../common/QueryBoundary';
import type { League } from '../../utils/leagues';

interface ResponsiveLeaguesTabsProps {
  myLeagues: League[];
  isLoadingMyLeagues: boolean;
  errorMyLeagues: string | null;
  onCreate: () => void;
  onJoin: () => void;
  publicListRefreshKey: number;
}

export default function ResponsiveLeaguesTabs({
  myLeagues,
  isLoadingMyLeagues,
  errorMyLeagues,
  onCreate,
  onJoin,
  publicListRefreshKey
}: ResponsiveLeaguesTabsProps) {
  const [activeTab, setActiveTab] = useState('my-leagues');
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  const tabs = [
    { id: 'my-leagues', label: 'My Leagues' },
    { id: 'discover', label: 'Discover' }
  ];

  return (
    <div>
      {/* Tab Navigation */}
      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-1 mb-6">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-1 px-3 py-2.5 text-sm font-medium rounded-md transition-all duration-200
                ${activeTab === tab.id
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="animate-in fade-in duration-300">
        {activeTab === 'my-leagues' && (
          <QueryBoundary>
            <MobileOptimizedLeagueList
              leagues={myLeagues}
              isLoading={isLoadingMyLeagues}
              error={errorMyLeagues}
              onCreate={onCreate}
              onJoin={onJoin}
            />
          </QueryBoundary>
        )}
        
        {activeTab === 'discover' && (
          <QueryBoundary>
            <MobileOptimizedPublicLeagues key={publicListRefreshKey} />
          </QueryBoundary>
        )}
      </div>
    </div>
  );
}

// Mobile-optimized version of LeagueList with better spacing
function MobileOptimizedLeagueList({
  leagues,
  isLoading,
  error,
  onCreate,
  onJoin
}: {
  leagues: League[];
  isLoading: boolean;
  error: string | null;
  onCreate: () => void;
  onJoin: () => void;
}) {
  const { user } = useAuth();
  const currentUserId = user?.uid;

  const isAdmin = (league: League) => currentUserId && league.adminUid === currentUserId;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mobile-optimized Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={onCreate}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create League
        </button>
        <button
          onClick={onJoin}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg font-medium transition-colors dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
          Join League
        </button>
      </div>

      {/* League Cards */}
      {leagues.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center">
          <div className="text-4xl mb-3">🏈</div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No leagues yet
          </h3>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Create or join a league to get started with fantasy football!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {leagues.map((league) => (
            <div
              key={league.id}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-gray-900 dark:text-white text-base truncate">
                    {league.name}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      #{league.code}
                    </span>
                    <span className="text-xs text-gray-400">•</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {league.members?.length || 0} members
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  {isAdmin(league) && (
                    <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-full dark:bg-amber-900/30 dark:text-amber-300">
                      Admin
                    </span>
                  )}
                  {league.isPublic && (
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full dark:bg-green-900/30 dark:text-green-300">
                      Public
                    </span>
                  )}
                </div>
              </div>
              
              <button
                onClick={() => window.location.href = `/leagues/${league.id}`}
                className="w-full px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-md text-sm font-medium transition-colors dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300"
              >
                View League
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Mobile-optimized version of PublicLeaguesList
function MobileOptimizedPublicLeagues() {
  // Just render the component directly - it already has its own header and styling
  return <PublicLeaguesList />;
}
