import { useState, useEffect } from 'react';
import PageMeta from "../components/common/PageMeta";
import { useAuth } from '../context/AuthContext';
import { listenToUserLeagues, League } from '../utils/leagues';
import { checkLineupCompletionStatus, fetchWeeklySchedule, FirestoreWeeklySchedule } from '../services/lineupFetchingService';
import { APP_CONFIG } from '../config/appConfig';
import { calculateCurrentNFLWeek } from '../utils/nflWeekHelper';
import { SkeletonPage } from '../components/ui/skeleton/SkeletonLoader';
import PullToRefresh from '../components/ui/PullToRefresh';

// Import KPI Components
import LineupStatusKPI from '../components/dashboard/LineupStatusKPI';
import LeagueStandingKPI from '../components/dashboard/LeagueStandingKPI';
import QuickActionsKPI from '../components/dashboard/QuickActionsKPI';
import WeeklyProgressKPI from '../components/dashboard/WeeklyProgressKPI';


// Keep existing components for the full dashboard experience
import NewsCard from "../components/dashboard/Newscard";
import WeeklyGamesSchedule from '../components/dashboard/WeeklyGamesSchedule';
import MyLeaguesOverview from '../components/dashboard/MyLeaguesOverview';

export default function Dashboard() {
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
  const primaryLeague = leagues[0] || null; // For MVP, focus on primary league

  // Fetch schedule data
  useEffect(() => {
    const loadSchedule = async () => {
      try {
        const season = APP_CONFIG.CURRENT_NFL_SEASON;
        const data = await fetchWeeklySchedule(season, currentNflWeek);
        setScheduleData(data);
      } catch (err) {
        console.error("Error fetching weekly schedule for KPI:", err);
        // Don't set error state for schedule fetch failure, just use fallback
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
          
          // Check lineup status for primary league
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

  // Calculate next game time from real schedule data
  const getNextGameTime = (): number | null => {
    if (!scheduleData?.games || scheduleData.games.length === 0) {
      // Fallback to Sunday 1 PM ET if no schedule data
      const now = new Date();
      const sunday = new Date();
      sunday.setDate(now.getDate() + (7 - now.getDay()));
      sunday.setHours(18, 0, 0, 0); // 1 PM ET = 6 PM UTC (simplified)
      return sunday > now ? sunday.getTime() : null; // Return milliseconds
    }

    const now = Date.now() / 1000; // Current time in seconds
    
    // Find the earliest upcoming game
    const upcomingGames = scheduleData.games
      .map(game => {
        const gameTime = typeof game.gameTime_epoch === 'string' 
          ? parseInt(game.gameTime_epoch, 10) 
          : game.gameTime_epoch;
        return gameTime;
      })
      .filter(gameTime => gameTime > now)
      .sort((a, b) => a - b);

    // Convert from seconds to milliseconds for JavaScript Date compatibility
    return upcomingGames.length > 0 ? upcomingGames[0] * 1000 : null;
  };

  if (authLoading || (leaguesLoading && !leagues.length)) {
    return <SkeletonPage type="dashboard" />;
  }

  const nextGameTime = getNextGameTime();

  const handleRefresh = async () => {
    // Refresh leagues and lineup status
    if (user?.uid) {
      await checkLineupForAllLeagues(leagues, user.uid);
      
      // Reload schedule data
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
        title="Dashboard | Easy Fantasy"
        description="NFL Fantasy Football"
      />
      
      <PullToRefresh onRefresh={handleRefresh}>
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
          </div>
        )}

      {/* Mobile-First KPI Grid */}
      <div className="grid gap-4 mb-6 sm:gap-6">
        {/* Mobile: Single column, Tablet: 2 columns, Desktop: 4 columns */}
        <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {/* Lineup Status - Most important, show first */}
          <div className="sm:col-span-2 xl:col-span-1">
            <LineupStatusKPI
              lineupsSet={lineupStatus.lineupsSet}
              lineupsComplete={lineupStatus.lineupsComplete}
              totalLeagues={lineupStatus.totalLeagues}
              isLoading={lineupStatus.isLoading}
              currentWeek={currentNflWeek}
              nextLockTime={nextGameTime}
            />
          </div>

          {/* League Standing */}
          <div className="xl:col-span-1">
            <LeagueStandingKPI
              leagues={leagues}
              currentUserId={user?.uid}
              currentWeek={currentNflWeek}
            />
          </div>

          {/* Weekly Progress */}
          <div className="xl:col-span-1">
            <WeeklyProgressKPI
              currentWeek={currentNflWeek}
              totalWeeks={18}
            />
          </div>

          {/* Quick Actions */}
          <div className="xl:col-span-1">
            <QuickActionsKPI
              primaryLeagueId={primaryLeague?.id ?? null}
              currentWeek={currentNflWeek}
              isLineupSet={lineupStatus.lineupsSet > 0}
              nextGameTime={nextGameTime}
              totalLeagues={lineupStatus.totalLeagues}
              lineupsSet={lineupStatus.lineupsComplete}
            />
          </div>

        </div>
      </div>

      {/* Traditional Dashboard Content - Three Column Layout on Desktop */}
      <div className="space-y-6 xl:space-y-0 xl:grid xl:grid-cols-12 xl:gap-6">
        {/* Left Column - News & Schedule */}
        <div className="space-y-6 xl:col-span-4">
          <NewsCard />
          <WeeklyGamesSchedule currentNflWeek={currentNflWeek} />
        </div>

        {/* Middle Column - League Overview */}
        <div className="xl:col-span-4">
          <MyLeaguesOverview 
            leagues={leagues} 
            currentUserId={user?.uid} 
            isLoadingLeagues={leaguesLoading} 
          />
        </div>

        {/* Right Column - Additional content can be added here */}
        <div className="xl:col-span-4">
          {/* Placeholder for future components like recent transactions, player news, etc. */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
              Coming Soon
            </h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Player alerts, recent transactions, and more insights will appear here.
            </p>
          </div>
        </div>
      </div>
      </PullToRefresh>
    </>
  );
}


