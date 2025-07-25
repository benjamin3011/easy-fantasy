import { useState, useEffect } from 'react';
import PageMeta from "../components/common/PageMeta";
import { useAuth } from '../context/AuthContext';
import { listenToUserLeagues, League } from '../utils/leagues';
import { checkLineupCompletionStatus, fetchWeeklySchedule, FirestoreWeeklySchedule } from '../services/lineupFetchingService';
import { APP_CONFIG } from '../config/appConfig';
import { calculateCurrentNFLWeek } from '../utils/nflWeekHelper';
import { SkeletonPage } from '../components/ui/skeleton/SkeletonLoader';
import PullToRefresh from '../components/ui/PullToRefresh';

// Import new modern components
import LiveScoringWidget from '../components/dashboard/LiveScoringWidget';
import DashboardQuickActions from '../components/dashboard/DashboardQuickActions';

// Keep existing KPI components
import LineupStatusKPI from '../components/dashboard/LineupStatusKPI';
import LeagueStandingKPI from '../components/dashboard/LeagueStandingKPI';
import WeeklyProgressKPI from '../components/dashboard/WeeklyProgressKPI';

// Keep existing components for full dashboard experience
import NewsCard from "../components/dashboard/Newscard";
import WeeklyGamesSchedule from '../components/dashboard/WeeklyGamesSchedule';
import MyLeaguesOverview from '../components/dashboard/MyLeaguesOverview';

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
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

  // Set primary league when leagues are loaded
  useEffect(() => {
    if (leagues.length > 0 && !selectedLeague) {
      setSelectedLeague(leagues[0]);
    }
  }, [leagues, selectedLeague]);

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
          
          // Check lineup status for all leagues
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

        {/* Modern Dashboard Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
              Dashboard
            </h1>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Week {currentNflWeek} • {APP_CONFIG.CURRENT_NFL_SEASON}
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div 
              className="bg-brand-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(currentNflWeek / 18) * 100}%` }}
            />
          </div>
        </div>

        {/* Modern Grid Layout */}
        <div className="grid gap-6 lg:grid-cols-12">
          
          {/* Left Column - Live Scoring & Quick Actions */}
          <div className="lg:col-span-4 space-y-6">
            <LiveScoringWidget />
            
            <DashboardQuickActions
              leagues={leagues}
              currentWeek={currentNflWeek}
              lineupsComplete={lineupStatus.lineupsComplete}
              totalLeagues={lineupStatus.totalLeagues}
              nextGameTime={nextGameTime}
            />
          </div>

          {/* Middle Column - KPIs */}
          <div className="lg:col-span-4 space-y-6">
            {/* Lineup Status - Most Important */}
            <LineupStatusKPI
              lineupsSet={lineupStatus.lineupsSet}
              lineupsComplete={lineupStatus.lineupsComplete}
              totalLeagues={lineupStatus.totalLeagues}
              isLoading={lineupStatus.isLoading}
              currentWeek={currentNflWeek}
              nextLockTime={nextGameTime}
            />

            {/* League Standing */}
            <LeagueStandingKPI
              leagues={leagues}
              currentUserId={user?.uid}
              currentWeek={currentNflWeek}
            />

            {/* Weekly Progress */}
            <WeeklyProgressKPI
              currentWeek={currentNflWeek}
              totalWeeks={18}
            />
          </div>

          {/* Right Column - News & League Overview */}
          <div className="lg:col-span-4 space-y-6">
            <NewsCard />
            
            <MyLeaguesOverview 
              leagues={leagues} 
              currentUserId={user?.uid} 
              isLoadingLeagues={leaguesLoading} 
            />
            
            <WeeklyGamesSchedule currentNflWeek={currentNflWeek} />
          </div>
        </div>
      </PullToRefresh>
    </>
  );
}


