/* pages / LeaguesPage.tsx */
import { useEffect, useState } from "react"; // Keep useState
import PageMeta from "../components/common/PageMeta";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
// Uses the listener function
import { League, listenToUserLeagues } from "../utils/leagues";
import { useAuth } from "../context/AuthContext";
import { useModal } from "../hooks/useModal";

import LeagueList from "../components/leagues/LeagueList";
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
      console.log("Dialog action successful, triggering public list refresh.");
      // Increment the key to force PublicLeaguesList remount/refetch
      setPublicListRefreshKey(key => key + 1);
      // No need to manually reload myLeagues, listener handles it
  };

  /* UI */
  return (
    <>
      <PageMeta title="Leagues | Easy Fantasy" description="NFL Fantasy Football" />
      <PageBreadcrumb pageTitle="Leagues" />

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

      {/* grid wrapper */}
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 xl:col-span-7">
          <LeagueList
            leagues={myLeagues}
            isLoading={isLoadingMyLeagues}
            error={errorMyLeagues}
            onCreate={createModal.openModal}
            onJoin={joinModal.openModal}
          />
        </div>
        <div className="col-span-12 xl:col-span-5">
          {/* *** ADD key prop *** */}
          <PublicLeaguesList key={publicListRefreshKey} />
        </div>
      </div>
    </>
  );
}
