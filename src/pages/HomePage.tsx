import { useState, useEffect, Suspense, lazy } from 'react';
import PageMeta from "../components/common/PageMeta";
import { useAuth } from '../context/AuthContext';
import { useLeagueContext } from '../context/LeagueContext';
import { checkLineupCompletionStatus, fetchWeeklySchedule } from '../services/lineupFetchingService';
import type { FirestoreWeeklySchedule, GameInfoFromSchedule } from '../services/lineupFetchingService';
import { APP_CONFIG } from '../config/appConfig';
import { useQuery } from '@tanstack/react-query';

import { SkeletonPage } from '../components/ui/skeleton/SkeletonLoader';
import PullToRefresh from '../components/ui/PullToRefresh';
import LineupStatusKPI from '../components/dashboard/LineupStatusKPI';
import CachedDataIndicator from '../components/common/CachedDataIndicator';
import OnboardingFlow from '../components/onboarding/OnboardingFlow';
import QuickPerformanceCard from '../components/analytics/QuickPerformanceCard';
import CaptainTrackerCard from '../components/analytics/CaptainTrackerCard';
import ResponsiveHomeTabs from '../components/dashboard/ResponsiveHomeTabs';
import InlineLeagueSelector from '../components/common/InlineLeagueSelector';
import InlineWeekSelector from '../components/common/InlineWeekSelector';
import QueryBoundary from '../components/common/QueryBoundary';

const UnifiedGamesWidget = lazy(() => import('../components/dashboard/UnifiedGamesWidget'));


export default function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const {
    leagues,
    leaguesLoading,
    leaguesError,
    selectedLeagueId,
    effectiveWeek
  } = useLeagueContext();
  
  const defaultLineupStatus = {
    lineupsSet: 0,
    lineupsComplete: 0,
    totalLeagues: 0,
  } as const;

  const {
    data: lineupStatus = defaultLineupStatus,
    isFetching: lineupLoading,
    refetch: refetchLineupStatus,
  } = useQuery({
    queryKey: ['lineupStatus', user?.uid, effectiveWeek, leagues.map((l) => l.id).sort()],
    enabled: !!user?.uid && leagues.length > 0,
    queryFn: async () => {
      const season = APP_CONFIG.CURRENT_NFL_SEASON;
      const lineupStatuses = await Promise.all(
        leagues.map((league) =>
          checkLineupCompletionStatus(user!.uid, league.id, effectiveWeek, season)
        )
      );
      return {
        lineupsSet: lineupStatuses.filter((s) => s.exists).length,
        lineupsComplete: lineupStatuses.filter((s) => s.isComplete).length,
        totalLeagues: leagues.length,
      };
    },
    staleTime: 1000 * 60 * 5,
  });
  const {
    data: scheduleData,
    refetch: refetchSchedule,
  } = useQuery<FirestoreWeeklySchedule | null, Error>({
    queryKey: ['weeklySchedule', APP_CONFIG.CURRENT_NFL_SEASON, effectiveWeek],
    queryFn: () => fetchWeeklySchedule(APP_CONFIG.CURRENT_NFL_SEASON, effectiveWeek),
    enabled: effectiveWeek > 0,
  });
  
  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);

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






  // Calculate next game time
  const getNextGameTime = (): number | null => {
    if (!scheduleData || scheduleData.games.length === 0) {
      const now = new Date();
      const sunday = new Date();
      sunday.setDate(now.getDate() + (7 - now.getDay()));
      sunday.setHours(18, 0, 0, 0);
      return sunday > now ? sunday.getTime() : null;
    }

    const now = Date.now() / 1000;
    const upcomingGames = scheduleData.games
      .map((game: GameInfoFromSchedule) => {
        const gameTime = typeof game.gameTime_epoch === 'string' 
          ? parseInt(game.gameTime_epoch, 10) 
          : game.gameTime_epoch;
        return gameTime;
      })
      .filter((gameTime: number) => gameTime > now)
      .sort((a: number, b: number) => a - b);

    return upcomingGames.length > 0 ? upcomingGames[0] * 1000 : null;
  };



  if (authLoading || leaguesLoading) {
    return <SkeletonPage type="dashboard" />;
  }

  const nextGameTime = getNextGameTime();

  const handleRefresh = async () => {
    if (user?.uid) {
      await refetchLineupStatus();
      await refetchSchedule();
    }
  };

  return (
    <>
      <PageMeta
        title="Home | Easy Fantasy"
        description="Your fantasy football hub"
      />
      
      <PullToRefresh onRefresh={handleRefresh}>
        {leaguesError && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-300 text-sm">{leaguesError}</p>
          </div>
        )}

        <div className="container mx-auto px-2 py-6 pb-content-safe">
          {/* Header Section */}
          <div className="mb-6">
            {/* Desktop: Show page title */}
            <div className="hidden md:flex items-center justify-between mb-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Dashboard
              </h1>
              {user?.uid && <CachedDataIndicator queryKey={['userLeagues', user.uid]} />}
            </div>
            
            {/* Mobile & Desktop: Inline selectors */}
            <div className="flex items-center justify-between">
              <div className="text-gray-600 dark:text-gray-300 text-sm flex items-center gap-2">
                <InlineLeagueSelector />
                <span>•</span>
                <InlineWeekSelector />
              </div>
              {/* Mobile: Show cached data indicator */}
              <div className="md:hidden">
                {user?.uid && <CachedDataIndicator queryKey={['userLeagues', user.uid]} />}
              </div>
            </div>
          </div>

          {/* Mobile: Responsive Tabs (< 768px) */}
          <div className="block md:hidden">
            <ResponsiveHomeTabs
              tabs={[
                {
                  id: 'games',
                  label: 'Games',
                  component: (
                    <div className="space-y-4">
                      <QueryBoundary>
                      <Suspense fallback={
                        <div className="space-y-4">
                          {Array(4).fill(0).map((_, i) => (
                            <div key={i} className="p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                              {/* Game header skeleton */}
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex-1">
                                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 animate-pulse mb-2" />
                                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24 animate-pulse" />
                                </div>
                                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-16 animate-pulse" />
                              </div>
                              {/* User lineup skeleton */}
                              <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg">
                                <div className="h-4 bg-blue-200 dark:bg-blue-800 rounded w-24 animate-pulse mb-2" />
                                <div className="space-y-1">
                                  {Array(3).fill(0).map((_, j) => (
                                    <div key={j} className="flex justify-between">
                                      <div className="h-3 bg-blue-200 dark:bg-blue-800 rounded w-20 animate-pulse" />
                                      <div className="h-3 bg-blue-200 dark:bg-blue-800 rounded w-12 animate-pulse" />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      }> 
                        <UnifiedGamesWidget currentNflWeek={effectiveWeek} isMobileView={true} />
                      </Suspense>
                      </QueryBoundary>
                    </div>
                  )
                },
                {
                  id: 'status',
                  label: 'Status',
                  component: (
                    <div className="space-y-6">
                      {/* Lineup Status */}
                      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                          Week {effectiveWeek} Status
                        </h2>
                        <LineupStatusKPI
                          lineupsSet={lineupStatus.lineupsSet}
                          lineupsComplete={lineupStatus.lineupsComplete}
                          totalLeagues={lineupStatus.totalLeagues}
                          isLoading={lineupLoading}
                          currentWeek={effectiveWeek}
                          nextLockTime={nextGameTime}
                        />
                      </div>

                      {/* Quick Performance Analytics */}
                      <QueryBoundary>
                      <QuickPerformanceCard leagueId={selectedLeagueId || undefined} />
                    </QueryBoundary>
                      
                      {/* Captain Tracker Analytics */}
                      <QueryBoundary>
                      <CaptainTrackerCard leagueId={selectedLeagueId || undefined} />
                    </QueryBoundary>
                    </div>
                  )
                }
              ]}
            />
          </div>

          {/* Desktop: Left Games, Right Sidebar Layout (≥ 768px) */}
          <div className="hidden md:block">
            <div className="grid gap-6 md:grid-cols-3">
              
              {/* Left Column - Games (2/3 width) */}
              <div className="md:col-span-2">
                <QueryBoundary>
                  <Suspense fallback={
                    <div className="space-y-4">
                      <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-40 animate-pulse mb-4" />
                      {Array(4).fill(0).map((_, i) => (
                        <div key={i} className="p-5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
                          {/* Game header skeleton */}
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex-1">
                              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-40 animate-pulse mb-2" />
                              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32 animate-pulse" />
                            </div>
                            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-16 animate-pulse" />
                          </div>
                          {/* User lineup skeleton */}
                          <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
                            <div className="h-4 bg-blue-200 dark:bg-blue-800 rounded w-32 animate-pulse mb-2" />
                            <div className="space-y-1">
                              {Array(4).fill(0).map((_, j) => (
                                <div key={j} className="flex justify-between">
                                  <div className="h-3 bg-blue-200 dark:bg-blue-800 rounded w-28 animate-pulse" />
                                  <div className="h-3 bg-blue-200 dark:bg-blue-800 rounded w-16 animate-pulse" />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  }> 
                    <UnifiedGamesWidget currentNflWeek={effectiveWeek} />
                  </Suspense>
                </QueryBoundary>
              </div>

              {/* Right Column - Status & Analytics (1/3 width) */}
              <div className="space-y-6">
                
                {/* Lineup Status */}
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Week {effectiveWeek} Status
                  </h2>
                  <LineupStatusKPI
                    lineupsSet={lineupStatus.lineupsSet}
                    lineupsComplete={lineupStatus.lineupsComplete}
                    totalLeagues={lineupStatus.totalLeagues}
                    isLoading={lineupLoading}
                    currentWeek={effectiveWeek}
                    nextLockTime={nextGameTime}
                  />
                </div>

                {/* Quick Performance Analytics */}
                <QueryBoundary>
                  <QuickPerformanceCard leagueId={selectedLeagueId || undefined} />
                </QueryBoundary>
                
                {/* Captain Tracker Analytics */}
                <QueryBoundary>
                  <CaptainTrackerCard leagueId={selectedLeagueId || undefined} />
                </QueryBoundary>
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

 