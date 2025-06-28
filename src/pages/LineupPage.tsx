import { useState, useEffect } from 'react';
import PageMeta from "../components/common/PageMeta";
import { useAuth } from '../context/AuthContext';
import { useParams, useNavigate, useLocation } from 'react-router';
import { APP_CONFIG, MAX_NFL_WEEKS } from '../config/appConfig';
import { calculateCurrentNFLWeek } from '../utils/nflWeekHelper';
import { listenToUserLeagues, League } from '../utils/leagues';
import Select from '../components/form/Select';
import LoadingOverlay from '../components/ui/LoadingOverlay';
import ComponentCard from '../components/common/ComponentCard';
import Button from '../components/ui/button/Button';
import { Link } from 'react-router';

// Import our new Zustand-powered components
import SimpleLineupGrid from '../components/lineup/SimpleLineupGrid';
import { useLineupStore } from '../store/lineupStore';

export default function LineupPage() {
  const { leagueId: urlLeagueId, week: weekString } = useParams<{ leagueId: string; week: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();

  // Initialize Zustand store
  const { initializeContext, cleanup } = useLineupStore();

  // Route detection
  const isParameterizedRoute = urlLeagueId && weekString;
  const isDirectRoute = location.pathname === '/lineup';

  // State for smart route handling
  const [userLeagues, setUserLeagues] = useState<League[]>([]);
  const [leaguesLoading, setLeaguesLoading] = useState(false);
  const [leaguesError, setLeaguesError] = useState<string | null>(null);

  // Resolved parameters (from URL or smart defaults)
  const [resolvedLeagueId, setResolvedLeagueId] = useState<string | null>(urlLeagueId || null);
  const [resolvedWeek, setResolvedWeek] = useState<number>(() => {
    if (weekString) {
      const parsed = parseInt(weekString, 10);
      return isNaN(parsed) ? calculateCurrentNFLWeek() : parsed;
    }
    return calculateCurrentNFLWeek();
  });

  const currentSeasonString = APP_CONFIG.CURRENT_NFL_SEASON;
  const currentSeason = parseInt(currentSeasonString, 10);
  const userId = user?.uid;

  // Top-level loading state
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // Cleanup effect - runs when component unmounts or key parameters change
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup, resolvedLeagueId, resolvedWeek]);

  // Initialize store context when we have all required data
  useEffect(() => {
    if (userId && resolvedLeagueId && resolvedWeek && currentSeason && !isPageLoading) {
      initializeContext(userId, resolvedLeagueId, resolvedWeek, currentSeason);
    }
  }, [userId, resolvedLeagueId, resolvedWeek, currentSeason, isPageLoading, initializeContext]);

  // Smart route handling: Fetch user leagues when on direct route
  useEffect(() => {
    if (isDirectRoute && userId && !authLoading) {
      setLeaguesLoading(true);
      setLeaguesError(null);
      
      const unsubscribe = listenToUserLeagues(
        userId,
        (fetchedLeagues) => {
          setUserLeagues(fetchedLeagues);
          setLeaguesLoading(false);
          
          // Auto-select first league if none is resolved yet
          if (!resolvedLeagueId && fetchedLeagues.length > 0) {
            setResolvedLeagueId(fetchedLeagues[0].id);
          }
        },
        (error) => {
          console.error("Error fetching user leagues for lineup:", error);
          setLeaguesError("Failed to load your leagues.");
          setLeaguesLoading(false);
        }
      );
      
      return () => unsubscribe();
    }
  }, [isDirectRoute, userId, authLoading, resolvedLeagueId]);

  // Main page loading logic
  useEffect(() => {
    if (authLoading) {
      setIsPageLoading(true);
      setPageError(null);
      return;
    }

    if (!userId) {
      setPageError("Authentication required.");
      setIsPageLoading(false);
      return;
    }

    if (isParameterizedRoute) {
      // Parameterized route: Check if we have all required params
      if (!urlLeagueId || resolvedWeek < 1 || !currentSeason) {
        setPageError("Invalid lineup parameters.");
        setIsPageLoading(false);
      } else {
        setResolvedLeagueId(urlLeagueId);
        setIsPageLoading(false);
        setPageError(null);
      }
    } else if (isDirectRoute) {
      // Direct route: Wait for leagues to load, then check if we can resolve
      if (leaguesLoading) {
        setIsPageLoading(true);
        setPageError(null);
      } else if (leaguesError) {
        setPageError(leaguesError);
        setIsPageLoading(false);
      } else if (userLeagues.length === 0) {
        setPageError(null); // Will show "no leagues" UI instead
        setIsPageLoading(false);
      } else if (resolvedLeagueId && resolvedWeek >= 1 && currentSeason) {
        setIsPageLoading(false);
        setPageError(null);
      } else {
        setPageError("Unable to resolve lineup parameters.");
        setIsPageLoading(false);
      }
    } else {
      setPageError("Invalid route.");
      setIsPageLoading(false);
    }
  }, [
    authLoading, 
    userId, 
    isParameterizedRoute, 
    isDirectRoute, 
    urlLeagueId, 
    resolvedWeek, 
    currentSeason, 
    leaguesLoading, 
    leaguesError, 
    userLeagues.length, 
    resolvedLeagueId
  ]);

  const handleWeekChange = (newWeekValue: string) => {
    const newWeek = parseInt(newWeekValue, 10);
    if (newWeek >= 1 && newWeek <= MAX_NFL_WEEKS && resolvedLeagueId) {
      if (isParameterizedRoute) {
        navigate(`/leagues/${resolvedLeagueId}/lineup/${newWeek}`);
      } else {
        setResolvedWeek(newWeek);
      }
    }
  };

  const handleLeagueChange = (newLeagueId: string) => {
    if (isDirectRoute) {
      setResolvedLeagueId(newLeagueId);
    } else {
      // For parameterized routes, navigate to the new league
      navigate(`/leagues/${newLeagueId}/lineup/${resolvedWeek}`);
    }
  };

  // Loading state
  if (isPageLoading) {
    return (
      <LoadingOverlay 
        text={leaguesLoading ? "Loading your leagues..." : "Loading lineup..."} 
        fullScreen={true} 
      />
    );
  }

  // Error state
  if (pageError) {
    return (
      <div className="container mx-auto text-center py-10">
        <ComponentCard title="Unable to Load Lineup">
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

  // No leagues state (only for direct route)
  if (isDirectRoute && userLeagues.length === 0) {
    return (
      <>
        <PageMeta title="Lineup | Easy Fantasy" description="NFL Fantasy Football" />
        <div className="container mx-auto text-center py-10">
          <ComponentCard title="No Leagues Found">
            <div className="p-6 text-center">
              <p className="text-lg text-gray-600 dark:text-gray-300 mb-4">
                You need to join a league to set lineups.
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

  // Generate week options
  const weekOptions = Array.from({ length: MAX_NFL_WEEKS }, (_, i) => ({
    value: (i + 1).toString(),
    label: `Week ${i + 1}`,
  }));

  // Generate league options
  const leagueOptions = userLeagues.map(league => ({
    value: league.id,
    label: league.name,
  }));

  const selectedLeague = userLeagues.find(league => league.id === resolvedLeagueId);

  return (
    <>
      <PageMeta 
        title={`Week ${resolvedWeek} Lineup | Easy Fantasy`} 
        description="Set your weekly fantasy football lineup" 
      />
      
      <div className="container mx-auto px-4 py-6">
        {/* Header with Controls */}
        <div className="mb-4">
          <div className="flex flex-col gap-3">
            {/* Title and League Info */}
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                Week {resolvedWeek} Lineup
              </h1>
              {selectedLeague && (
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5 truncate">
                  {selectedLeague.name} • {currentSeasonString} Season
                </p>
              )}
            </div>
            
            {/* Selectors Row */}
            <div className="flex gap-2">
              {/* League Selector (only for direct route) - Takes 2/3 width */}
              {isDirectRoute && leagueOptions.length > 1 && (
                <div className="flex-[2] min-w-0">
                  <Select
                    defaultValue={resolvedLeagueId || ''}
                    onChange={handleLeagueChange}
                    options={leagueOptions}
                    placeholder="Select League"
                  />
                </div>
              )}
              
              {/* Week Selector - Takes 1/3 width or full width if no league selector */}
              <div className={`${isDirectRoute && leagueOptions.length > 1 ? 'flex-1' : 'w-full max-w-32'} min-w-0`}>
                <Select
                  defaultValue={resolvedWeek.toString()}
                  onChange={handleWeekChange}
                  options={weekOptions}
                  placeholder="Week"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Main Lineup Interface */}
        <SimpleLineupGrid 
          enableCaptainFeature={selectedLeague?.enableCaptainFeature ?? false}
          captainPointMultiplier={selectedLeague?.captainPointMultiplier ?? 1.5}
        />
      </div>
    </>
  );
}