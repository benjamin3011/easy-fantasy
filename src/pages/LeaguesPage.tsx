/* pages / LeaguesPage.tsx */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PageMeta from "../components/common/PageMeta";
// Uses the listener function
import { listenToUserLeagues, getUserLeagues } from "../utils/leagues";
import type { League } from "../utils/leagues";
import { useAuth } from "../context/AuthContext";
import { useModal } from "../hooks/useModal";

import LeagueList from "../components/leagues/LeagueList";
import PullToRefresh from '../components/ui/PullToRefresh';
import PublicLeaguesList from "../components/leagues/PublicLeaguesList";
import CreateLeagueDialog from "../components/leagues/CreateLeagueDialog";
import QueryBoundary from '../components/common/QueryBoundary';
import JoinLeagueDialog from "../components/leagues/JoinLeagueDialog";
import ResponsiveLeaguesTabs from "../components/leagues/ResponsiveLeaguesTabs";

export default function LeaguesPage() {
  /* auth + state */
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Replace useState with useQuery
  const {
    data: myLeagues = [],
    isLoading: isLoadingMyLeagues,
    error: errorMyLeagues
  } = useQuery<League[]>({
    queryKey: ['myLeagues', user?.uid],
    queryFn: () => getUserLeagues(user!.uid),
    enabled: !!user?.uid,
    staleTime: 60000, // 1 minute
  });
  // *** ADD state for refresh key ***
  const [publicListRefreshKey, setPublicListRefreshKey] = useState(0);

  /* dialogs */
  const createModal = useModal();
  const joinModal = useModal();

  // Optional: Add real-time sync via listener (updates cache)
  useEffect(() => {
    if (!user?.uid) return;
    
    const unsubscribe = listenToUserLeagues(
      user.uid,
      (leaguesData) => {
        // Update the query cache with real-time data
        queryClient.setQueryData(['myLeagues', user.uid], leaguesData);
      },
      (error) => {
        console.error("Real-time sync error:", error);
        // Don't set error state - let the query handle errors
      }
    );
    
    return () => unsubscribe();
  }, [user?.uid, queryClient]);

  // *** UPDATE Dialog Success Handler ***
  const handleDialogSuccess = () => {
      // Invalidate queries to refetch fresh data
      queryClient.invalidateQueries({ queryKey: ['myLeagues', user?.uid] });
      // Increment the key to force PublicLeaguesList remount/refetch
      setPublicListRefreshKey(key => key + 1);
  };

  /* UI */
  return (
    <>
      <PageMeta title="Leagues | Easy Fantasy" description="NFL Fantasy Football" />

      {/* Pull to refresh wrapper */}
      <PullToRefresh onRefresh={async () => window.location.reload()} disabled={createModal.isOpen || joinModal.isOpen}>
      <div className="container mx-auto px-2 py-6 pb-content-safe">
        {/* Header with Controls */}
        <div className="mb-4">
          {/* Desktop: Show page title */}
          <div className="hidden md:flex items-center justify-between mb-2">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              Leagues
            </h1>
          </div>
          
          {/* Mobile & Desktop: Description */}
          <div className="flex items-center justify-between">
            <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">
              Join or create fantasy football leagues
            </div>
          </div>
        </div>

        {/* Mobile: Responsive Tabs (< 1024px) */}
        <div className="block lg:hidden">
          <ResponsiveLeaguesTabs
            myLeagues={myLeagues}
            isLoadingMyLeagues={isLoadingMyLeagues}
            errorMyLeagues={errorMyLeagues?.message || null}
            onCreate={createModal.openModal}
            onJoin={joinModal.openModal}
            publicListRefreshKey={publicListRefreshKey}
          />
        </div>

        {/* Desktop: Side-by-side Layout (>= 1024px) */}
        <div className="hidden lg:grid lg:grid-cols-3 lg:gap-8">
          {/* My Leagues - 2/3 on desktop */}
          <div className="lg:col-span-2">
            <QueryBoundary>
              <LeagueList
                leagues={myLeagues}
                isLoading={isLoadingMyLeagues}
                error={errorMyLeagues?.message || null}
                onCreate={createModal.openModal}
                onJoin={joinModal.openModal}
              />
            </QueryBoundary>
          </div>

          {/* Public Leagues - 1/3 on desktop */}
          <div className="lg:col-span-1">
            <QueryBoundary>
              <PublicLeaguesList key={publicListRefreshKey} />
            </QueryBoundary>
          </div>
        </div>
      </div>
      </PullToRefresh>
      {/* dialogs - use updated success handler */}
      <CreateLeagueDialog
        isOpen={createModal.isOpen}
        onClose={createModal.closeModal}
        onSuccess={handleDialogSuccess} // This now triggers public list refresh
      />
      <JoinLeagueDialog
        isOpen={joinModal.isOpen}
        onClose={joinModal.closeModal}
        onSuccess={handleDialogSuccess} // This now triggers public list refresh
      />
    </>
  );
}
