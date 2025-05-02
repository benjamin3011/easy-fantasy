/* pages / LeaguesPage.tsx */
import { useCallback, useEffect, useState } from "react";
import PageMeta from "../components/common/PageMeta";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import { League, getUserLeagues } from "../utils/leagues";
import { useAuth } from "../context/AuthContext";
import { useModal } from "../hooks/useModal";

import LeagueList from "../components/leagues/LeagueList";
import PublicLeaguesList from "../components/leagues/PublicLeaguesList";
import CreateLeagueDialog from "../components/leagues/CreateLeagueDialog";
import JoinLeagueDialog from "../components/leagues/JoinLeagueDialog";

export default function LeaguesPage() {
  /* auth + state */
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);

  /* dialogs */
  const createModal = useModal();
  const joinModal = useModal();

  /* load leagues */
  const reload = useCallback(async () => {
    if (!user) return;
    setLeagues(await getUserLeagues(user.uid));
  }, [user]);

  useEffect(() => { void reload(); }, [reload]);
  if (!user) return null;

  /* UI */
  return (
    <>
      <PageMeta title="Leagues | Easy Fantasy" description="NFL Fantasy Football" />
      <PageBreadcrumb pageTitle="Leagues" />

      {/* dialogs */}
      <CreateLeagueDialog
        isOpen={createModal.isOpen}
        onClose={createModal.closeModal}
        onSuccess={reload}
      />
      <JoinLeagueDialog
        isOpen={joinModal.isOpen}
        onClose={joinModal.closeModal}
        onSuccess={reload}
      />

      {/* grid wrapper in case you add more cards later */}
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 xl:col-span-7">
          <LeagueList
            leagues={leagues}
            onCreate={createModal.openModal}
            onJoin={joinModal.openModal}
          />
        </div>
        <div className="col-span-12 xl:col-span-5">
          <PublicLeaguesList />
        </div>
      </div>
    </>
  );
}
