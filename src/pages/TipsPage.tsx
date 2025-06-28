import { useState, useEffect } from 'react';
import PageMeta from "../components/common/PageMeta";
import { useAuth } from '../context/AuthContext';
import { listenToUserLeagues, League } from '../utils/leagues';
import { calculateCurrentNFLWeek } from '../utils/nflWeekHelper';
import { WeeklyTips } from '../components/gamecenter/WeeklyTips';
import { ProphetLeaderboard } from '../components/gamecenter/ProphetLeaderboard';
import { MAX_NFL_WEEKS } from '../config/appConfig';
import Select from '../components/form/Select';
import { SkeletonPage } from '../components/ui/skeleton/SkeletonLoader';

export default function TipsPage() {
  const { user, loading: authLoading } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [leaguesLoading, setLeaguesLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number>(calculateCurrentNFLWeek());
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'tips' | 'leaderboard'>('tips');

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

  if (authLoading || leaguesLoading) {
    return <SkeletonPage type="list" />;
  }

  if (tipsEnabledLeagues.length === 0) {
    return (
      <>
        <PageMeta
          title="Weekly Tips | Easy Fantasy"
          description="Make your weekly NFL game predictions"
        />
        
        <div className="text-center py-12 px-4">
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
      
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Mobile-First Header */}
      <div className="mb-6">
        <div className="mb-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Weekly Tips
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm sm:text-base">
            Predict NFL game winners and earn Prophet Points
          </p>
        </div>

        {/* Compact Selectors Bar - Mobile Only */}
        <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-3 mb-4 -mx-1 sm:hidden">
          {/* League Selector - Takes up more space */}
          <div className="flex items-center gap-2 flex-1 min-w-0 mr-4">
            <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 0 0-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 0 1 5.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 0 1 9.288 0M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm6 3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM7 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
            </svg>
            {tipsEnabledLeagues.length === 1 ? (
              <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{tipsEnabledLeagues[0].name}</span>
            ) : (
              <select
                value={selectedLeagueId || ''}
                onChange={(e) => handleLeagueChange(e.target.value)}
                className="text-sm bg-transparent border-0 focus:ring-0 text-gray-700 dark:text-gray-300 pr-6 min-w-0 flex-1 truncate"
              >
                {tipsEnabledLeagues.map((league) => (
                  <option key={league.id} value={league.id} className="dark:bg-gray-800">
                    {league.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          
          {/* Week Selector - Right-aligned */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 002 2z" />
            </svg>
            <select
              value={selectedWeek.toString()}
              onChange={(e) => handleWeekChange(e.target.value)}
              className="text-sm bg-transparent border-0 focus:ring-0 text-gray-700 dark:text-gray-300 pr-6"
            >
              {Array.from({ length: MAX_NFL_WEEKS }, (_, i) => (
                <option key={i + 1} value={(i + 1).toString()} className="dark:bg-gray-800">
                  Week {i + 1}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Desktop Selectors - Desktop Only */}
        <div className="hidden sm:flex sm:items-center sm:justify-between sm:mb-6">
          <div className="flex items-center gap-6">
            {/* League selector for desktop */}
            {tipsEnabledLeagues.length > 1 && (
              <div className="flex items-center gap-2">
                <label htmlFor="league-select" className="text-md text-gray-700 dark:text-gray-200 whitespace-nowrap">League:</label>
                <div className="w-48">
                  <Select
                    options={tipsEnabledLeagues.map(league => ({
                      value: league.id,
                      label: league.name
                    }))}
                    onChange={handleLeagueChange}
                    defaultValue={selectedLeagueId || ''}
                    className="text-sm"
                  />
                </div>
              </div>
            )}
            {/* Week selector for desktop */}
            <div className="flex items-center gap-2">
              <label htmlFor="week-select" className="text-md text-gray-700 dark:text-gray-200 whitespace-nowrap">Week:</label>
              <div className="w-32">
                <Select
                  options={Array.from({ length: MAX_NFL_WEEKS }, (_, i) => ({
                    value: (i + 1).toString(),
                    label: `Week ${i + 1}`
                  }))}
                  onChange={handleWeekChange}
                  defaultValue={selectedWeek.toString()}
                  className="text-md" 
                />
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Tab Navigation */}
        <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl shadow-sm">
          <button
            onClick={() => setActiveTab('tips')}
            className={`flex-1 py-3 px-4 text-sm font-medium rounded-lg transition-all duration-200 min-h-[48px] flex items-center justify-center gap-2 ${
              activeTab === 'tips'
                ? 'bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-sm ring-1 ring-gray-200 dark:ring-gray-600'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            🎯 Make Picks
          </button>
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`flex-1 py-3 px-4 text-sm font-medium rounded-lg transition-all duration-200 min-h-[48px] flex items-center justify-center gap-2 ${
              activeTab === 'leaderboard'
                ? 'bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-sm ring-1 ring-gray-200 dark:ring-gray-600'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            🏆 Leaderboard
          </button>
        </div>
      </div>

      {/* Content - Single League */}
      {selectedLeague && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
                  {selectedLeague.name}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 flex items-center gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300">
                    {selectedLeague.members.length} member{selectedLeague.members.length !== 1 ? 's' : ''}
                  </span>
                  <span>•</span>
                  <span>Week {selectedWeek}</span>
                </p>
              </div>
              
              {/* League Status Indicator */}
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-xs text-green-600 dark:text-green-400 font-medium hidden sm:inline">
                  Active
                </span>
              </div>
            </div>
          </div>
          
          <div className="p-4 sm:p-6">
            {activeTab === 'tips' ? (
              <WeeklyTips
                leagueId={selectedLeague.id}
                week={selectedWeek}
                season={2025}
              />
            ) : (
              <ProphetLeaderboard
                leagueId={selectedLeague.id}
                season={2025}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
} 