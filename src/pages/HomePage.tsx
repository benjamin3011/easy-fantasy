import { useState, useEffect, Suspense, lazy } from 'react';
import PageMeta from "../components/common/PageMeta";
import { useAuth } from '../context/AuthContext';
import { listenToUserLeagues, League } from '../utils/leagues';
import { checkLineupCompletionStatus, fetchWeeklySchedule, FirestoreWeeklySchedule } from '../services/lineupFetchingService';
import { APP_CONFIG } from '../config/appConfig';
import { calculateCurrentNFLWeek } from '../utils/nflWeekHelper';
import { Link } from 'react-router';
import { SkeletonPage } from '../components/ui/skeleton/SkeletonLoader';
import PullToRefresh from '../components/ui/PullToRefresh';
import LineupStatusKPI from '../components/dashboard/LineupStatusKPI';
import CachedDataIndicator from '../components/common/CachedDataIndicator';
const LiveScoringWidget = lazy(() => import('../components/dashboard/LiveScoringWidget'));
const NewsCard = lazy(() => import('../components/dashboard/Newscard'));
const WeeklyGamesSchedule = lazy(() => import('../components/dashboard/WeeklyGamesSchedule'));

interface QuickAction {
  title: string;
  description: string;
  path: string;
  icon: string;
  urgent?: boolean;
}

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

  const currentNflWeek = calculateCurrentNFLWeek();
  const primaryLeague = leagues[0] || null;

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

  // Generate quick actions based on current state
  const getQuickActions = (): QuickAction[] => {
    const actions: QuickAction[] = [];
    
    if (lineupStatus.lineupsComplete < lineupStatus.totalLeagues) {
      actions.push({
        title: "Set Lineups",
        description: `${lineupStatus.totalLeagues - lineupStatus.lineupsComplete} lineups need attention`,
        path: "/lineup",
        icon: "⚡",
        urgent: true
      });
    }
    
    if (primaryLeague) {
      actions.push({
        title: "League Standings", 
        description: "Check your position",
        path: `/leagues/${primaryLeague.id}`,
        icon: "🏆"
      });
    }
    
    actions.push({
      title: "Weekly Tips",
      description: "Make your game predictions",
      path: "/tips",
      icon: "🎯"
    });
    
    return actions.slice(0, 3); // Max 3 actions
  };

  if (authLoading || (leaguesLoading && !leagues.length)) {
    return <SkeletonPage type="dashboard" />;
  }

  const nextGameTime = getNextGameTime();
  const quickActions = getQuickActions();

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

          {/* Main Content Grid - More Efficient Layout */}
          <div className="space-y-6">
            
            {/* Top Section - Status & Quick Actions Combined */}
            <div className="grid gap-4 md:grid-cols-2">
              
              {/* Lineup Status */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
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

              {/* Quick Actions */}
              {quickActions.length > 0 && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Quick Actions
                  </h2>
                  <div className="space-y-3">
                    {quickActions.map((action, index) => (
                      <Link
                        key={index}
                        to={action.path}
                        className={`flex items-center p-3 border rounded-lg transition-all duration-200 hover:shadow-md ${
                          action.urgent 
                            ? "border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30"
                            : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800"
                        }`}
                      >
                        <span className="text-xl mr-3">{action.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium ${action.urgent ? "text-orange-900 dark:text-orange-100" : "text-gray-900 dark:text-white"}`}>
                            {action.title}
                          </div>
                          <div className={`text-sm ${action.urgent ? "text-orange-700 dark:text-orange-300" : "text-gray-500 dark:text-gray-400"}`}>
                            {action.description}
                          </div>
                        </div>
                        <div className="text-gray-400 dark:text-gray-500">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Live Scoring - Full Width */}
            <Suspense fallback={<SkeletonPage type="dashboard" />}> 
              <LiveScoringWidget />
            </Suspense>

            {/* Bottom Section - Games & News */}
            <div className="grid gap-4 md:grid-cols-2">
              
              {/* This Week's Games */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  This Week's Games
                </h2>
                <Suspense fallback={<div className="h-40 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />}> 
                  <WeeklyGamesSchedule currentNflWeek={currentNflWeek} />
                </Suspense>
              </div>

              {/* Fantasy News */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Fantasy News
                </h2>
                <Suspense fallback={<div className="h-40 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />}> 
                  <NewsCard />
                </Suspense>
              </div>
            </div>
          </div>
        </div>
      </PullToRefresh>
    </>
  );
}

 