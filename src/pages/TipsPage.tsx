import { useState, useEffect } from 'react';
import PageMeta from "../components/common/PageMeta";
import { useAuth } from '../context/AuthContext';
import { listenToUserLeagues, League } from '../utils/leagues';
import { calculateCurrentNFLWeek } from '../utils/nflWeekHelper';
import { Suspense, lazy } from 'react';
import PullToRefresh from '../components/ui/PullToRefresh';
import CachedDataIndicator from '../components/common/CachedDataIndicator';
const WeeklyTips = lazy(() => import('../components/gamecenter/WeeklyTips'));
const ProphetLeaderboard = lazy(() => import('../components/gamecenter/ProphetLeaderboard').then(m => ({ default: m.ProphetLeaderboard })));
import { MAX_NFL_WEEKS, APP_CONFIG } from '../config/appConfig';
import Select from '../components/form/Select';
import { useTipsStore } from '../store/tipsStore';
import { SkeletonPage } from '../components/ui/skeleton/SkeletonLoader';
import ComponentCard from '../components/common/ComponentCard';
import Button from '../components/ui/button/Button';
import { Link } from 'react-router';

export default function TipsPage() {
  const { user, loading: authLoading } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [leaguesLoading, setLeaguesLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Local state for route handling
  const [selectedWeek, setSelectedWeek] = useState<number>(calculateCurrentNFLWeek());
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  
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
    if (selectedLeagueId && selectedWeek && currentSeason && !isPageLoading) {
      setContext(selectedLeagueId, selectedWeek, currentSeason);
    }
  }, [selectedLeagueId, selectedWeek, currentSeason, isPageLoading, setContext]);

  useEffect(() => {
    if (user?.uid) {
      setLeaguesLoading(true);
      const unsubscribe = listenToUserLeagues(
        user.uid,
        (fetchedLeagues) => {
          setLeagues(fetchedLeagues);
          setLeaguesLoading(false);
          
          // Auto-select first tips-enabled league if none selected
          const tipsEnabledLeagues = fetchedLeagues.filter(league => league.enableWeeklyTips);
          if (!selectedLeagueId && tipsEnabledLeagues.length > 0) {
            setSelectedLeagueId(tipsEnabledLeagues[0].id);
          }
        },
        (err) => {
          console.error("Error fetching leagues:", err);
          setError("Failed to load leagues.");
          setLeaguesLoading(false);
        }
      );
      return () => unsubscribe();
    } else if (!authLoading) {
      setLeagues([]);
      setLeaguesLoading(false);
    }
  }, [user, authLoading, selectedLeagueId]);

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
    } else if (error) {
      setPageError(error);
      setIsPageLoading(false);
    } else if (leagues.length === 0) {
      setPageError(null); // Will show "no leagues" UI instead
      setIsPageLoading(false);
    } else if (selectedLeagueId && selectedWeek >= 1 && currentSeason) {
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
    error, 
    leagues.length, 
    selectedLeagueId, 
    selectedWeek, 
    currentSeason
  ]);

  // Filter leagues that have tips enabled
  const tipsEnabledLeagues = leagues.filter(league => league.enableWeeklyTips);
  
  // Get the currently selected league
  const selectedLeague = tipsEnabledLeagues.find(league => league.id === selectedLeagueId);

  const handleWeekChange = (newWeekValue: string) => {
    const newWeek = parseInt(newWeekValue, 10);
    if (newWeek >= 1 && newWeek <= MAX_NFL_WEEKS) {
      setSelectedWeek(newWeek);
    }
  };

  const handleLeagueChange = (newLeagueId: string) => {
    setSelectedLeagueId(newLeagueId);
  };

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
            <div className="space-y-2">
              <Link to="/leagues">
                <Button variant="primary" size="sm">
                  Go to Leagues
                </Button>
              </Link>
              <div>
                <Link to="/">
                  <Button variant="outline" size="sm">
                    Back to Home
                  </Button>
                </Link>
              </div>
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
        <div className="mx-auto text-center py-10 px-4">
          <ComponentCard title="No Leagues Found">
            <div className="p-6 text-center">
              <p className="text-lg text-gray-600 dark:text-gray-300 mb-4">
                You need to join a league to make tips.
              </p>
              <div className="space-y-2">
                <Link to="/leagues">
                  <Button variant="primary" size="sm">
                    Browse Leagues
                  </Button>
                </Link>
                <div>
                  <Link to="/">
                    <Button variant="outline" size="sm">
                      Back to Home
                    </Button>
                  </Link>
                </div>
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

  // Generate week options
  const weekOptions = Array.from({ length: MAX_NFL_WEEKS }, (_, i) => ({
    value: (i + 1).toString(),
    label: `Week ${i + 1}`,
  }));

  // Generate league options
  const leagueOptions = tipsEnabledLeagues.map(league => ({
    value: league.id,
    label: league.name,
  }));

  return (
    <>
      <PageMeta
        title="Weekly Tips | Easy Fantasy"
        description="Make your weekly NFL game predictions"
      />
      
      {error && (
        <div className="container mx-auto px-4 mb-6">
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
          </div>
        </div>
      )}

      <PullToRefresh onRefresh={async () => { window.location.reload(); }}> 
      <div className="container mx-auto px-4 py-6 pb-content-safe">
        {/* Modern Header - Matching LineupPage */}
        <div className="mb-6">
          <div className="flex flex-col gap-3">
            {/* Title and Week Info */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  Game Tips
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                  Week {selectedWeek} • {selectedLeague?.name || 'Select League'}
                </p>
              </div>
              {selectedLeague && (
                <CachedDataIndicator queryKey={['tips', selectedLeague.id, selectedWeek.toString()]} />
              )}
            </div>
            
            {/* Selectors Row */}
            <div className="flex gap-2">
              {/* League Selector - Takes 2/3 width */}
              {leagueOptions.length > 1 && (
                <div className="flex-[2] min-w-0">
                  <Select
                    defaultValue={selectedLeagueId || ''}
                    onChange={handleLeagueChange}
                    options={leagueOptions}
                    placeholder="Select League"
                  />
                </div>
              )}
              
              {/* Week Selector - Takes 1/3 width or full width if no league selector */}
              <div className={`${leagueOptions.length > 1 ? 'flex-1' : 'w-full max-w-32'} min-w-0`}>
                <Select
                  defaultValue={selectedWeek.toString()}
                  onChange={handleWeekChange}
                  options={weekOptions}
                  placeholder="Week"
                />
              </div>
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
        {selectedLeague && (
          <Suspense fallback={<SkeletonPage type="dashboard" />}> 
            {activeTab === 'tips' ? (
              <WeeklyTips
                leagueId={selectedLeague.id}
                week={selectedWeek}
                season={currentSeason}
              />
            ) : (
              <ProphetLeaderboard
                leagueId={selectedLeague.id}
                season={currentSeason}
              />
            )}
          </Suspense>
        )}
      </div>
      </PullToRefresh>
    </>
  );
} 