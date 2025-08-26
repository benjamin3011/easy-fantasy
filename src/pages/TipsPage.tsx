import { useState, useEffect } from 'react';
import PageMeta from "../components/common/PageMeta";
import { useAuth } from '../context/AuthContext';
import { useLeagueContext } from '../context/LeagueContext';
import { Suspense, lazy } from 'react';
import PullToRefresh from '../components/ui/PullToRefresh';
import CachedDataIndicator from '../components/common/CachedDataIndicator';
import InlineLeagueSelector from '../components/common/InlineLeagueSelector';
import InlineWeekSelector from '../components/common/InlineWeekSelector';
const WeeklyTips = lazy(() => import('../components/gamecenter/WeeklyTips'));
const ProphetLeaderboard = lazy(() => import('../components/gamecenter/ProphetLeaderboard').then(m => ({ default: m.ProphetLeaderboard })));
import { APP_CONFIG } from '../config/appConfig';
import QueryBoundary from '../components/common/QueryBoundary';
import { useTipsStore } from '../store/tipsStore';
import { SkeletonPage } from '../components/ui/skeleton/SkeletonLoader';
import ComponentCard from '../components/common/ComponentCard';
import Button from '../components/ui/button/Button';
import { Link } from 'react-router';

export default function TipsPage() {
  const { user, loading: authLoading } = useAuth();
  
  // Use global league context
  const {
    leagues,
    leaguesLoading,
    leaguesError,
    selectedLeagueId,
    selectedLeague,
    effectiveWeek,
    setSelectedLeagueId
  } = useLeagueContext();
  
  // Zustand store
  const { 
    activeTab, 
    setActiveTab, 
    setContext, 
    cleanup 
  } = useTipsStore();

  // Page loading state
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const currentSeasonString = APP_CONFIG.CURRENT_NFL_SEASON;
  const currentSeason = parseInt(currentSeasonString, 10);

  // Cleanup effect
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Initialize store context when we have all required data
  useEffect(() => {
    if (selectedLeagueId && effectiveWeek && currentSeason && !isPageLoading) {
      setContext(selectedLeagueId, effectiveWeek, currentSeason);
    }
  }, [selectedLeagueId, effectiveWeek, currentSeason, isPageLoading, setContext]);

  // Auto-select first tips-enabled league when leagues change
  useEffect(() => {
    if (!selectedLeagueId && leagues.length > 0) {
      const tipsEnabledLeagues = leagues.filter(league => league.enableWeeklyTips);
      if (tipsEnabledLeagues.length > 0) {
        setSelectedLeagueId(tipsEnabledLeagues[0].id);
      }
    }
  }, [leagues, selectedLeagueId, setSelectedLeagueId]);

  // Main page loading logic (similar to LineupPage)
  useEffect(() => {
    if (authLoading) {
      setIsPageLoading(true);
      setPageError(null);
      return;
    }

    if (!user?.uid) {
      setPageError("Authentication required.");
      setIsPageLoading(false);
      return;
    }

    if (leaguesLoading) {
      setIsPageLoading(true);
      setPageError(null);
    } else if (leaguesError) {
      setPageError(leaguesError);
      setIsPageLoading(false);
    } else if (leagues.length === 0) {
      setPageError(null); // Will show "no leagues" UI instead
      setIsPageLoading(false);
    } else if (selectedLeagueId && effectiveWeek >= 1 && currentSeason) {
      setIsPageLoading(false);
      setPageError(null);
    } else {
      setPageError("Unable to resolve tips parameters.");
      setIsPageLoading(false);
    }
  }, [
    authLoading, 
    user?.uid, 
    leaguesLoading, 
    leaguesError, 
    leagues.length, 
    selectedLeagueId, 
    effectiveWeek, 
    currentSeason
  ]);

  // Filter leagues that have tips enabled
  const tipsEnabledLeagues = leagues.filter(league => league.enableWeeklyTips);
  
  // Use the selected league from global context, but ensure it has tips enabled
  const selectedTipsLeague = selectedLeague && selectedLeague.enableWeeklyTips ? selectedLeague : null;

  // Loading state (similar to LineupPage)
  if (isPageLoading) {
    return (
      <SkeletonPage type="dashboard" />
    );
  }

  // Error state (similar to LineupPage)
  if (pageError) {
    return (
      <div className="container mx-auto px-4 mb-6">
        <ComponentCard title="Unable to Load Tips">
          <div className="p-6 text-center">
            <p className="text-lg text-red-500 mb-4">{pageError}</p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-center justify-center">
              <Link to="/leagues">
                <Button variant="primary" size="sm">
                  Go to Leagues
                </Button>
              </Link>
              <Link to="/">
                <Button variant="outline" size="sm">
                  Back to Home
                </Button>
              </Link>
            </div>
          </div>
        </ComponentCard>
      </div>
    );
  }

  // No leagues state
  if (leagues.length === 0) {
    return (
      <>
        <PageMeta title="Tips | Easy Fantasy" description="NFL Fantasy Football Tips" />
        <div className="mx-auto text-center py-10 px-2">
          <ComponentCard title="No Leagues Found">
            <div className="p-6 text-center">
              <p className="text-lg text-gray-600 dark:text-gray-300 mb-4">
                You need to join a league to make tips.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-center justify-center">
                <Link to="/leagues">
                  <Button variant="primary" size="sm">
                    Browse Leagues
                  </Button>
                </Link>
                <Link to="/">
                  <Button variant="outline" size="sm">
                    Back to Home
                  </Button>
                </Link>
              </div>
            </div>
          </ComponentCard>
        </div>
      </>
    );
  }

  // No tips-enabled leagues state
  if (tipsEnabledLeagues.length === 0) {
    return (
      <>
        <PageMeta
          title="Weekly Tips | Easy Fantasy"
          description="Make your weekly NFL game predictions"
        />
        
        <div className="container mx-auto px-4 py-6">
          <div className="text-center py-12">
            <div className="text-6xl sm:text-8xl mb-6">🎯</div>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-4">
              No Tips Available
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6 text-base sm:text-lg max-w-md mx-auto">
              None of your leagues have weekly tips enabled yet.
            </p>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 sm:p-6 max-w-lg mx-auto">
              <p className="text-sm sm:text-base text-blue-800 dark:text-blue-200 mb-3">
                Want to start making game predictions?
              </p>
              <p className="text-xs sm:text-sm text-blue-600 dark:text-blue-300">
                Ask your league commissioner to enable weekly tips in league settings, or create a new league with tips enabled!
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  // If we have leagues but no selected league, select the first one
  if (!selectedLeague && tipsEnabledLeagues.length > 0) {
    setSelectedLeagueId(tipsEnabledLeagues[0].id);
    return null; // Will re-render with selected league
  }

  return (
    <>
      <PageMeta
        title="Weekly Tips | Easy Fantasy"
        description="Make your weekly NFL game predictions"
      />
      
      {leaguesError && (
        <div className="container mx-auto px-4 mb-6">
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-300 text-sm">{leaguesError}</p>
          </div>
        </div>
      )}

      <PullToRefresh onRefresh={async () => { window.location.reload(); }}> 
      <div className="container mx-auto px-2 py-6 pb-content-safe">
        {/* Header with Inline Selectors */}
        <div className="mb-6">
          {/* Desktop: Show page title */}
          <div className="hidden md:flex items-center justify-between mb-2">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              Game Tips
            </h1>
            {selectedTipsLeague && (
              <CachedDataIndicator queryKey={['tips', selectedTipsLeague.id, effectiveWeek.toString()]} />
            )}
          </div>
          
          {/* Mobile & Desktop: Inline selectors */}
          <div className="flex items-center justify-between">
            <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2">
              <InlineLeagueSelector />
              <span>•</span>
              <InlineWeekSelector />
            </div>
            {/* Mobile: Show cached data indicator */}
            <div className="md:hidden">
              {selectedTipsLeague && (
                <CachedDataIndicator queryKey={['tips', selectedTipsLeague.id, effectiveWeek.toString()]} />
              )}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6">
          <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg shadow-sm">
            <button
              onClick={() => setActiveTab('tips')}
              className={`flex-1 py-3 px-4 text-sm font-medium rounded-md transition-all duration-200 min-h-[48px] flex items-center justify-center gap-2 ${
                activeTab === 'tips'
                  ? 'bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-sm border border-gray-200 dark:border-gray-600'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              🎯 Make Picks
            </button>
            <button
              onClick={() => setActiveTab('leaderboard')}
              className={`flex-1 py-3 px-4 text-sm font-medium rounded-md transition-all duration-200 min-h-[48px] flex items-center justify-center gap-2 ${
                activeTab === 'leaderboard'
                  ? 'bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-sm border border-gray-200 dark:border-gray-600'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              🏆 Leaderboard
            </button>
          </div>
        </div>

        {/* Content */}
        {selectedTipsLeague && (
          <QueryBoundary>
            <Suspense fallback={<SkeletonPage type="dashboard" />}> 
            {activeTab === 'tips' ? (
              <WeeklyTips
                leagueId={selectedTipsLeague.id}
                week={effectiveWeek}
                season={currentSeason}
              />
            ) : (
              <ProphetLeaderboard
                leagueId={selectedTipsLeague.id}
                season={currentSeason}
              />
            )}
            </Suspense>
          </QueryBoundary>
        )}
      </div>
      </PullToRefresh>
    </>
  );
} 