/* pages / LeaguesPage.tsx */
import { useEffect, useState } from "react"; // Keep useState
import PageMeta from "../components/common/PageMeta";
// Uses the listener function
import { League, listenToUserLeagues } from "../utils/leagues";
import { useAuth } from "../context/AuthContext";
import { useModal } from "../hooks/useModal";

import LeagueList from "../components/leagues/LeagueList";
import PullToRefresh from '../components/ui/PullToRefresh';
import PublicLeaguesList from "../components/leagues/PublicLeaguesList";
import CreateLeagueDialog from "../components/leagues/CreateLeagueDialog";
import JoinLeagueDialog from "../components/leagues/JoinLeagueDialog";

export default function LeaguesPage() {
  /* auth + state */
  const { user } = useAuth();
  const [myLeagues, setMyLeagues] = useState<League[]>([]);
  const [isLoadingMyLeagues, setIsLoadingMyLeagues] = useState(true);
  const [errorMyLeagues, setErrorMyLeagues] = useState<string | null>(null);
  // *** ADD state for refresh key ***
  const [publicListRefreshKey, setPublicListRefreshKey] = useState(0);

  /* dialogs */
  const createModal = useModal();
  const joinModal = useModal();

  /* Listener for User Leagues */
  useEffect(() => {
    setIsLoadingMyLeagues(true);
    setErrorMyLeagues(null);
    setMyLeagues([]);

    if (user?.uid) {
      const unsubscribe = listenToUserLeagues(
        user.uid,
        (leaguesData) => { /* Success callback */
          setMyLeagues(leaguesData);
          setIsLoadingMyLeagues(false);
          setErrorMyLeagues(null);
        },
        (error) => { /* Error callback */
          console.error("Listener error:", error);
          if (error.message.includes('query requires an index') || error.message.includes('currently building')) {
              setErrorMyLeagues("Database index needed for 'My Leagues' is building. Please wait and refresh.");
          } else {
              setErrorMyLeagues("Could not load your leagues in real-time.");
          }
          setIsLoadingMyLeagues(false);
        }
      );
      return () => unsubscribe();
    } else {
      setIsLoadingMyLeagues(false);
      setMyLeagues([]);
      return () => {};
    }
  }, [user]);

  // *** UPDATE Dialog Success Handler ***
  const handleDialogSuccess = () => {
      
      // Increment the key to force PublicLeaguesList remount/refetch
      setPublicListRefreshKey(key => key + 1);
      // No need to manually reload myLeagues, listener handles it
  };

  /* UI */
  return (
    <>
      <PageMeta title="Leagues | Easy Fantasy" description="NFL Fantasy Football" />

      {/* Pull to refresh wrapper */}
      <PullToRefresh onRefresh={async () => window.location.reload()} disabled={createModal.isOpen || joinModal.isOpen}>
      <div className="container mx-auto px-4 py-6 pb-content-safe">
          {/* Mobile-First Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Leagues
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Join or create fantasy football leagues
            </p>
          </div>

          {/* Mobile-First Layout: Single column on mobile, responsive grid on larger screens */}
          <div className="space-y-6 lg:grid lg:grid-cols-3 lg:gap-8 lg:space-y-0">
            {/* My Leagues - Full width on mobile, 2/3 on desktop */}
            <div className="lg:col-span-2">
              <LeagueList
                leagues={myLeagues}
                isLoading={isLoadingMyLeagues}
                error={errorMyLeagues}
                onCreate={createModal.openModal}
                onJoin={joinModal.openModal}
              />
            </div>

            {/* Public Leagues - Full width on mobile, 1/3 on desktop */}
            <div className="lg:col-span-1">
              {/* *** ADD key prop *** */}
              <PublicLeaguesList key={publicListRefreshKey} />
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
