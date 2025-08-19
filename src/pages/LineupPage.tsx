import { useState, useEffect } from 'react';
import PageMeta from "../components/common/PageMeta";
import { useAuth } from '../context/AuthContext';
import { useLeagueContext } from '../context/LeagueContext';
import { useParams, useLocation } from 'react-router';
import { APP_CONFIG } from '../config/appConfig';

import { SkeletonPage } from '../components/ui/skeleton/SkeletonLoader';
import ComponentCard from '../components/common/ComponentCard';
import Button from '../components/ui/button/Button';
import { Link } from 'react-router';

// Import our new Zustand-powered components
import { Suspense, lazy } from 'react';
import QueryBoundary from '../components/common/QueryBoundary';
import PullToRefresh from '../components/ui/PullToRefresh';
import CachedDataIndicator from '../components/common/CachedDataIndicator';
import InlineLeagueSelector from '../components/common/InlineLeagueSelector';
import InlineWeekSelector from '../components/common/InlineWeekSelector';
const SimpleLineupGrid = lazy(() => import('../components/lineup/SimpleLineupGrid'));
import { useLineupStore } from '../store/lineupStore';



export default function LineupPage() {
  const { leagueId: urlLeagueId, week: weekString } = useParams<{ leagueId: string; week: string }>();

  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  
  // Use global league context
  const {
    leagues,
    leaguesLoading,
    leaguesError,
    selectedLeagueId,
    selectedLeague,
    effectiveWeek,
    setSelectedLeagueId,
    setSelectedWeek
  } = useLeagueContext();

  // Initialize Zustand store
  const { initializeContext, cleanup } = useLineupStore();

  // Route detection
  const isParameterizedRoute = urlLeagueId && weekString;
  const isDirectRoute = location.pathname === '/lineup';



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
  }, [cleanup, selectedLeagueId, effectiveWeek]);

  // Initialize store context when we have all required data
  useEffect(() => {
    if (userId && selectedLeagueId && effectiveWeek && currentSeason && !isPageLoading) {
      initializeContext(userId, selectedLeagueId, effectiveWeek, currentSeason);
    }
  }, [userId, selectedLeagueId, effectiveWeek, currentSeason, isPageLoading, initializeContext]);

  // Sync URL parameters with global context
  useEffect(() => {
    if (isParameterizedRoute) {
      // For parameterized routes, sync URL parameters with global context
      if (urlLeagueId && urlLeagueId !== selectedLeagueId) {
        setSelectedLeagueId(urlLeagueId);
      }
      if (weekString) {
        const parsed = parseInt(weekString, 10);
        if (!isNaN(parsed) && parsed !== effectiveWeek) {
          setSelectedWeek(parsed);
        }
      }
    }
  }, [isParameterizedRoute, urlLeagueId, weekString, selectedLeagueId, effectiveWeek, setSelectedLeagueId, setSelectedWeek]);

  // Auto-select first league for direct routes
  useEffect(() => {
    if (isDirectRoute && !selectedLeagueId && leagues.length > 0) {
      setSelectedLeagueId(leagues[0].id);
    }
  }, [isDirectRoute, selectedLeagueId, leagues, setSelectedLeagueId]);

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
              if (!urlLeagueId || effectiveWeek < 1 || !currentSeason) {
        setPageError("Invalid lineup parameters.");
        setIsPageLoading(false);
      } else {
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
      } else if (leagues.length === 0) {
        setPageError(null); // Will show "no leagues" UI instead
        setIsPageLoading(false);
      } else if (selectedLeagueId && effectiveWeek >= 1 && currentSeason) {
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
    effectiveWeek, 
    currentSeason, 
    leaguesLoading, 
    leaguesError, 
    leagues.length, 
    selectedLeagueId
  ]);



  // The inline selectors handle their own state changes through the global context

  // Loading state
  if (isPageLoading) {
    return (
      <div className="container mx-auto px-4 py-6">
        <SkeletonPage type="dashboard" />
      </div>
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
  if (isDirectRoute && leagues.length === 0 && !leaguesLoading) {
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

  // Use global context data
  const currentNflWeek = effectiveWeek;

  return (
    <>
      <PageMeta 
        title={`Week ${effectiveWeek} Lineup | Easy Fantasy`} 
        description="Set your weekly fantasy football lineup" 
      />
      
      <PullToRefresh onRefresh={async () => window.location.reload()}> 
      <div className="container mx-auto px-2 py-6 pb-content-safe">
        {/* Header with Controls */}
        <div className="mb-4">
          {/* Desktop: Show page title */}
          <div className="hidden md:flex items-center justify-between mb-2">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              Lineup Builder
            </h1>
            {userId && selectedLeagueId && (
              <CachedDataIndicator queryKey={['lineup', userId, selectedLeagueId, currentNflWeek.toString()]} />
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
              {userId && selectedLeagueId && (
                <CachedDataIndicator queryKey={['lineup', userId, selectedLeagueId, currentNflWeek.toString()]} />
              )}
            </div>
          </div>
        </div>

        {/* Main Lineup Interface */}
        <QueryBoundary>
          <Suspense fallback={<SkeletonPage type="dashboard" />}> 
            <SimpleLineupGrid 
            enableCaptainFeature={selectedLeague?.enableCaptainFeature ?? false}
            captainPointMultiplier={selectedLeague?.captainPointMultiplier ?? 1.5}
          />
          </Suspense>
        </QueryBoundary>
      </div>
      </PullToRefresh>
    </>
  );
}