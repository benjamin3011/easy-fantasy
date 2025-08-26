// pages/LeagueDetail.tsx
import { useParams, Link } from "react-router";
import { useEffect, useState } from "react";
import {
  listenToLeagueDetail
} from "../utils/leagues";
import type { League } from "../utils/leagues";
import { useAuth } from "../context/AuthContext";
import { useHeader } from "../context/HeaderContext";
import PageMeta from "../components/common/PageMeta";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getLeague } from '../utils/leagues';
import ComponentCard from "../components/common/ComponentCard";
import QueryBoundary from '../components/common/QueryBoundary';
import Button from "../components/ui/button/Button";
import { SkeletonPage } from "../components/ui/skeleton/SkeletonLoader";
import PullToRefresh from "../components/ui/PullToRefresh";
import CachedDataIndicator from "../components/common/CachedDataIndicator";
import LeagueDetailTabs from "../components/leagues/LeagueDetailTabs";
import StandingsTab from "../components/leagues/tabs/StandingsTab";

import SettingsTab from "../components/leagues/tabs/SettingsTab";
import LeaderboardTab from "../components/leagues/tabs/LeaderboardTab";

export default function LeagueDetail() {
  const { id }   = useParams<{ id: string }>();
  const { user } = useAuth();
  const { setHeaderTitle } = useHeader();
  const queryClient = useQueryClient();
  
  // Replace useState with useQuery
  const {
    data: league,
    isLoading: loading,
    error: queryError
  } = useQuery<League | null>({
    queryKey: ['league', id],
    queryFn: () => getLeague(id!),
    enabled: !!id,
    staleTime: 60000, // 1 minute
  });

  const [currentEnableCaptain, setCurrentEnableCaptain] = useState(false);
  const [currentCaptainMultiplier, setCurrentCaptainMultiplier] = useState(1.5);
  const [currentEnableWeeklyTips, setCurrentEnableWeeklyTips] = useState(false);
  
  // Auto-assistant settings state
  const [currentAutoLineupEnabled, setCurrentAutoLineupEnabled] = useState(false);
  const [currentAutoTipsEnabled, setCurrentAutoTipsEnabled] = useState(false);
  
  // State for tracking changes and save status
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savingChanges, setSavingChanges] = useState(false);
  const [autoSaveInProgress, setAutoSaveInProgress] = useState<string | null>(null);
  




  // Add real-time sync via listener (updates cache)
  useEffect(() => {
    if (!id) return;
    
    const unsubscribe = listenToLeagueDetail(
      id,
      (updatedLeague) => {
        // Update the query cache with real-time data
        queryClient.setQueryData(['league', id], updatedLeague);
      },
      (err) => {
        console.error("Real-time sync error:", err);
        // Don't set error state - let the query handle errors
      }
    );

    return () => unsubscribe();
  }, [id, queryClient]);

  // Set header title when league data changes
  useEffect(() => {
    if (league?.name) {
      setHeaderTitle(league.name);
    }
    
    // Cleanup: reset header title when component unmounts or league changes
    return () => {
      setHeaderTitle(null);
    };
  }, [league?.name, setHeaderTitle]);

  // Sync current state with league data when it loads/changes
  useEffect(() => {
    if (league) {
      setCurrentEnableCaptain(league.enableCaptainFeature ?? false);
      setCurrentCaptainMultiplier(league.captainPointMultiplier ?? 1.5);
      setCurrentEnableWeeklyTips(league.enableWeeklyTips ?? false);
      setCurrentAutoLineupEnabled(league.autoLineup?.enabled ?? false);
      setCurrentAutoTipsEnabled(league.autoTips?.enabled ?? false);
    }
  }, [league]);

  if (!id) {
    return (
      <div className="container mx-auto px-4 py-6">
        <ComponentCard title="League">
          <div className="p-6 text-center text-sm text-gray-600 dark:text-gray-300">
            Missing league id in route.
          </div>
        </ComponentCard>
      </div>
    );
  }
  
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6">
        <SkeletonPage type="dashboard" />
      </div>
    );
  }
  
  if (queryError) {
    return (
      <div className="container mx-auto px-4 py-6">
        <ComponentCard title="Unable to Load League">
          <div className="p-6 text-center">
            <p className="text-lg text-red-500 mb-4">{queryError.message}</p>
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
  
  if (!league) {
    return (
      <div className="container mx-auto px-4 py-6">
        <ComponentCard title="League Not Found">
          <div className="p-6 text-center">
            <p className="text-lg text-gray-600 dark:text-gray-300 mb-4">
              League data could not be loaded or league not found.
            </p>
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

  const isAdmin = user?.uid === league.adminUid;



  const handleRefresh = async () => {
    // Force a re-fetch of league data by reloading the page
    // In a more sophisticated implementation, we could refetch specific data
    window.location.reload();
  };

  return (
    <>
      <PageMeta title={`${league.name} | Easy Fantasy`} description="" />
      
      <PullToRefresh onRefresh={handleRefresh}>
        <div className="container mx-auto px-2 py-6 pb-content-safe">
          {/* Header Section */}
          <div className="mb-6">
            {/* Desktop: Show page title */}
            <div className="hidden md:flex items-center justify-between mb-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {league.name}
              </h1>
              <CachedDataIndicator queryKey={['league', league.id]} />
            </div>
            
            {/* Mobile & Desktop: League info */}
            <div className="flex items-center justify-between">
              <div className="text-gray-600 dark:text-gray-300 text-sm flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                  Code: {league.code}
                </span>
                <span>•</span>
                <span>{league.members?.length ?? 0} member{league.members?.length !== 1 ? 's' : ''}</span>
                {league.isPublic && (
                  <>
                    <span>•</span>
                    <span className="text-green-600 dark:text-green-400">Public</span>
                  </>
                )}
              </div>
              {/* Mobile: Show cached data indicator */}
              <div className="md:hidden">
                <CachedDataIndicator queryKey={['league', league.id]} />
              </div>
            </div>
          </div>

          {/* Mobile: Responsive Tabs (< 768px) + Desktop: Tabs (≥ 768px) */}
          <QueryBoundary>
            <LeagueDetailTabs
            tabs={[
              {
                id: 'standings',
                label: '🏆 Standings',
                component: <StandingsTab league={league} />
              },
              ...(league.enableWeeklyTips ? [{
                id: 'leaderboard',
                label: '🎯 Leaderboard',
                component: <LeaderboardTab league={league} />
              }] : []),
              ...(isAdmin ? [{
                id: 'settings',
                label: '⚙️ Settings',
                component: (
                  <SettingsTab
                    league={league}
                    currentEnableCaptain={currentEnableCaptain}
                    setCurrentEnableCaptain={setCurrentEnableCaptain}
                    currentCaptainMultiplier={currentCaptainMultiplier}
                    setCurrentCaptainMultiplier={setCurrentCaptainMultiplier}
                    currentEnableWeeklyTips={currentEnableWeeklyTips}
                    setCurrentEnableWeeklyTips={setCurrentEnableWeeklyTips}
                    currentAutoLineupEnabled={currentAutoLineupEnabled}
                    setCurrentAutoLineupEnabled={setCurrentAutoLineupEnabled}
                    currentAutoTipsEnabled={currentAutoTipsEnabled}
                    setCurrentAutoTipsEnabled={setCurrentAutoTipsEnabled}
                    hasUnsavedChanges={hasUnsavedChanges}
                    setHasUnsavedChanges={setHasUnsavedChanges}
                    savingChanges={savingChanges}
                    setSavingChanges={setSavingChanges}
                    autoSaveInProgress={autoSaveInProgress}
                    setAutoSaveInProgress={setAutoSaveInProgress}
                  />
                ),
                adminOnly: true
              }] : [])
            ]}
          />
          </QueryBoundary>
        </div>
      </PullToRefresh>

      {/* Keep modal for legacy support - but it won't be used since Settings is now a tab */}
      {/* {isOpen && (
        <Modal isOpen={isOpen} onClose={closeModal} className="max-w-2xl p-6">
          <div className="p-6 text-center">
            <p className="text-gray-600 dark:text-gray-400">Settings have moved to the Settings tab!</p>
            <Button onClick={closeModal} className="mt-4">Close</Button>
          </div>
        </Modal>
      )} */}
    </>
  );
}


