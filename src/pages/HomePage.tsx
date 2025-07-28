import { useState, useEffect, Suspense, lazy } from 'react';
import PageMeta from "../components/common/PageMeta";
import { useAuth } from '../context/AuthContext';
import { listenToUserLeagues, League } from '../utils/leagues';
import { checkLineupCompletionStatus, fetchWeeklySchedule, FirestoreWeeklySchedule } from '../services/lineupFetchingService';
import { APP_CONFIG } from '../config/appConfig';
import { calculateCurrentNFLWeek } from '../utils/nflWeekHelper';

import { SkeletonPage } from '../components/ui/skeleton/SkeletonLoader';
import PullToRefresh from '../components/ui/PullToRefresh';
import LineupStatusKPI from '../components/dashboard/LineupStatusKPI';
import CachedDataIndicator from '../components/common/CachedDataIndicator';
import OnboardingFlow from '../components/onboarding/OnboardingFlow';
import QuickPerformanceCard from '../components/analytics/QuickPerformanceCard';
import CaptainTrackerCard from '../components/analytics/CaptainTrackerCard';
import ResponsiveHomeTabs from '../components/dashboard/ResponsiveHomeTabs';

const LiveScoringWidget = lazy(() => import('../components/dashboard/LiveScoringWidget'));
const WeeklyGamesSchedule = lazy(() => import('../components/dashboard/WeeklyGamesSchedule'));



export default function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [leaguesLoading, setLeaguesLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lineupStatus, setLineupStatus] = useState({
    lineupsSet: 0,
    lineupsComplete: 0,
    totalLeagues: 0,
    isLoading: true,
  });
  const [scheduleData, setScheduleData] = useState<FirestoreWeeklySchedule | null>(null);
  
  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);

  const currentNflWeek = calculateCurrentNFLWeek();
  const primaryLeague = leagues[0] || null;

  // Check if user should see onboarding
  useEffect(() => {
    if (user?.uid && !authLoading) {
      const hasSeenOnboarding = localStorage.getItem('easy-fantasy-onboarding-completed');
      if (!hasSeenOnboarding) {
        // Small delay to let the page load first
        const timer = setTimeout(() => {
          setShowOnboarding(true);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [user?.uid, authLoading]);

  // Fetch schedule data
  useEffect(() => {
    const loadSchedule = async () => {
      try {
        const season = APP_CONFIG.CURRENT_NFL_SEASON;
        const data = await fetchWeeklySchedule(season, currentNflWeek);
        setScheduleData(data);
      } catch (err) {
        console.error("Error fetching weekly schedule:", err);
      }
    };

    if (currentNflWeek > 0) {
      loadSchedule();
    }
  }, [currentNflWeek]);

  useEffect(() => {
    if (user?.uid) {
      setLeaguesLoading(true);
      const unsubscribe = listenToUserLeagues(
        user.uid,
        (fetchedLeagues) => {
          setLeagues(fetchedLeagues);
          setLeaguesLoading(false);
          
          if (fetchedLeagues.length > 0) {
            checkLineupForAllLeagues(fetchedLeagues, user.uid);
          } else {
            setLineupStatus({ lineupsSet: 0, lineupsComplete: 0, totalLeagues: 0, isLoading: false });
          }
        },
        (err) => {
          console.error("Error fetching leagues:", err);
          setError("Failed to load leagues.");
          setLeaguesLoading(false);
          setLineupStatus({ lineupsSet: 0, lineupsComplete: 0, totalLeagues: 0, isLoading: false });
        }
      );
      return () => unsubscribe();
    } else if (!authLoading) {
      setLeagues([]);
      setLeaguesLoading(false);
      setLineupStatus({ lineupsSet: 0, lineupsComplete: 0, totalLeagues: 0, isLoading: false });
    }
  }, [user, authLoading]);

  const checkLineupForAllLeagues = async (leagues: League[], userId: string) => {
    setLineupStatus(prev => ({ ...prev, isLoading: true }));
    const totalLeagues = leagues.length;
    try {
      const season = APP_CONFIG.CURRENT_NFL_SEASON;
      const lineupStatuses = await Promise.all(
        leagues.map(league => checkLineupCompletionStatus(userId, league.id, currentNflWeek, season))
      );
      
      const lineupsSet = lineupStatuses.filter(status => status.exists).length;
      const lineupsComplete = lineupStatuses.filter(status => status.isComplete).length;
      
      setLineupStatus({ lineupsSet, lineupsComplete, totalLeagues, isLoading: false });
    } catch {
      setLineupStatus({ lineupsSet: 0, lineupsComplete: 0, totalLeagues, isLoading: false });
    }
  };

  // Calculate next game time
  const getNextGameTime = (): number | null => {
    if (!scheduleData?.games || scheduleData.games.length === 0) {
      const now = new Date();
      const sunday = new Date();
      sunday.setDate(now.getDate() + (7 - now.getDay()));
      sunday.setHours(18, 0, 0, 0);
      return sunday > now ? sunday.getTime() : null;
    }

    const now = Date.now() / 1000;
    const upcomingGames = scheduleData.games
      .map(game => {
        const gameTime = typeof game.gameTime_epoch === 'string' 
          ? parseInt(game.gameTime_epoch, 10) 
          : game.gameTime_epoch;
        return gameTime;
      })
      .filter(gameTime => gameTime > now)
      .sort((a, b) => a - b);

    return upcomingGames.length > 0 ? upcomingGames[0] * 1000 : null;
  };



  if (authLoading || (leaguesLoading && !leagues.length)) {
    return <SkeletonPage type="dashboard" />;
  }

  const nextGameTime = getNextGameTime();

  const handleRefresh = async () => {
    if (user?.uid) {
      await checkLineupForAllLeagues(leagues, user.uid);
      
      try {
        const season = APP_CONFIG.CURRENT_NFL_SEASON;
        const data = await fetchWeeklySchedule(season, currentNflWeek);
        setScheduleData(data);
      } catch (err) {
        console.error("Error refreshing schedule:", err);
      }
    }
  };

  return (
    <>
      <PageMeta
        title="Home | Easy Fantasy"
        description="Your fantasy football hub"
      />
      
      <PullToRefresh onRefresh={handleRefresh}>
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
          </div>
        )}

        <div className="container mx-auto px-4 py-6">
          {/* Header Section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Dashboard
              </h1>
              {user?.uid && <CachedDataIndicator queryKey={['userLeagues', user.uid]} />}
            </div>
            <p className="text-gray-600 dark:text-gray-300">
              Welcome back! Here's your fantasy football overview.
            </p>
          </div>

          {/* Mobile: Tabs Layout (< 768px) */}
          <div className="md:hidden">
            <ResponsiveHomeTabs 
              tabs={[
                {
                  id: 'overview',
                  label: 'Overview',
                  component: (
                    <div className="space-y-6">
                      {/* Lineup Status */}
                      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                          Week {currentNflWeek} Status
                        </h2>
                        <LineupStatusKPI
                          lineupsSet={lineupStatus.lineupsSet}
                          lineupsComplete={lineupStatus.lineupsComplete}
                          totalLeagues={lineupStatus.totalLeagues}
                          isLoading={lineupStatus.isLoading}
                          currentWeek={currentNflWeek}
                          nextLockTime={nextGameTime}
                        />
                      </div>

                      {/* Live Scoring - Full Width */}
                      <Suspense fallback={<SkeletonPage type="dashboard" />}> 
                        <LiveScoringWidget isMobileView={true} />
                      </Suspense>
                    </div>
                  )
                },
                {
                  id: 'analytics',
                  label: 'Analytics',
                  component: (
                    <div className="space-y-6">
                      {/* Quick Performance Analytics */}
                      <QuickPerformanceCard leagueId={primaryLeague?.id} />
                      
                      {/* Captain Tracker Analytics */}
                      <CaptainTrackerCard leagueId={primaryLeague?.id} />
                    </div>
                  )
                },
                {
                  id: 'games',
                  label: 'Games',
                  component: (
                    <div className="space-y-4">
                      {/* Mobile-optimized: No card wrapper, natural scrolling */}
                      <div className="space-y-1">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                          This Week's Games
                        </h2>
                        <Suspense fallback={<div className="space-y-3">{Array(5).fill(0).map((_, i) => <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />)}</div>}> 
                          <WeeklyGamesSchedule currentNflWeek={currentNflWeek} isMobileView={true} />
                        </Suspense>
                      </div>
                    </div>
                  )
                }
              ]}
            />
          </div>

          {/* Desktop: Original Grid Layout (≥ 768px) */}
          <div className="hidden md:block">
            <div className="space-y-6">
              
              {/* Top Section - Status & Quick Actions Combined */}
              <div className="grid gap-4 md:grid-cols-2">
                
                {/* Lineup Status */}
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Week {currentNflWeek} Status
                  </h2>
                  <LineupStatusKPI
                    lineupsSet={lineupStatus.lineupsSet}
                    lineupsComplete={lineupStatus.lineupsComplete}
                    totalLeagues={lineupStatus.totalLeagues}
                    isLoading={lineupStatus.isLoading}
                    currentWeek={currentNflWeek}
                    nextLockTime={nextGameTime}
                  />
                </div>

                {/* Quick Performance Analytics */}
                <QuickPerformanceCard leagueId={primaryLeague?.id} />
              </div>

              {/* Live Scoring - Full Width */}
              <Suspense fallback={<SkeletonPage type="dashboard" />}> 
                <LiveScoringWidget />
              </Suspense>

              {/* Bottom Section - Games & News */}
              <div className="grid gap-4 md:grid-cols-2">
                
                {/* This Week's Games */}
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    This Week's Games
                  </h2>
                  <Suspense fallback={<div className="h-40 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />}> 
                    <WeeklyGamesSchedule currentNflWeek={currentNflWeek} />
                  </Suspense>
                </div>

                {/* Captain Tracker Analytics */}
                <CaptainTrackerCard leagueId={primaryLeague?.id} />
              </div>
            </div>
          </div>
        </div>
      </PullToRefresh>

      {/* Onboarding Flow */}
      <OnboardingFlow
        isOpen={showOnboarding}
        onComplete={() => {
          setShowOnboarding(false);
        }}
        onSkip={() => {
          setShowOnboarding(false);
          localStorage.setItem('easy-fantasy-onboarding-completed', 'true');
        }}
      />
    </>
  );
}

 