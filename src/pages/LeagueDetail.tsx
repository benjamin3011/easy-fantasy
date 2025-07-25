// pages/LeagueDetail.tsx
import { useParams, useNavigate, Link } from "react-router";
import { useEffect, useState } from "react";
import {
  League,
  listenToLeagueDetail,
  renameLeague,
  toggleLeagueVisibility,
  updateLeagueCaptainSettings,
  updateLeagueWeeklyTipsSettings
} from "../utils/leagues";
import { useAuth } from "../context/AuthContext";
import { useModal } from "../hooks/useModal";
import PageMeta from "../components/common/PageMeta";
import ComponentCard from "../components/common/ComponentCard";
import LeagueStandingsTable from "../components/leagues/LeagueStandingsTable";
import { Modal } from "../components/ui/modal";
import Button from "../components/ui/button/Button";
import Input from "../components/form/input/InputField";
import Switch from "../components/form/switch/Switch";
import toast from "react-hot-toast";
import { calculateCurrentNFLWeek } from "../utils/nflWeekHelper";
import Label from "../components/form/Label";
import { ProphetLeaderboard } from "../components/gamecenter/ProphetLeaderboard";
import { APP_CONFIG } from "../config/appConfig";

export default function LeagueDetail() {
  const { id }   = useParams<{ id: string }>();
  const nav      = useNavigate();
  const { user } = useAuth();
  const { isOpen, openModal, closeModal } = useModal();

  const [league, setLeague]   = useState<League | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentEnableCaptain, setCurrentEnableCaptain] = useState(false);
  const [currentCaptainMultiplier, setCurrentCaptainMultiplier] = useState(1.5);
  const [currentEnableWeeklyTips, setCurrentEnableWeeklyTips] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentNflWeek = calculateCurrentNFLWeek();

  useEffect(() => {
    if (!id) {
      setError("No league ID provided.");
      setLoading(false);
      setLeague(null);
      return;
    }

    setLoading(true);
    setError(null);
    // console.log(`Setting up listener for league ID: ${id}`); // Optional: for debugging

    const unsubscribe = listenToLeagueDetail(
      id,
      (updatedLeague) => {
        // console.log("Received league update:", updatedLeague); // Optional: for debugging
        setLeague(updatedLeague);
        if (updatedLeague) {
          // Keep captain settings in sync with the latest league data
          setCurrentEnableCaptain(updatedLeague.enableCaptainFeature ?? false);
          setCurrentCaptainMultiplier(updatedLeague.captainPointMultiplier ?? 1.5);
          setCurrentEnableWeeklyTips(updatedLeague.enableWeeklyTips ?? false);
        } else {
          // This case might occur if the league is deleted while the user is viewing
          setError("League not found or has been deleted.");
        }
        setLoading(false);
      },
      (err) => {
        // console.error(`Error listening to league ${id}:`, err); // Optional: for debugging
        setError(err.message);
        setLoading(false);
        setLeague(null);
      }
    );

    // Cleanup function
    return () => {
      // console.log(`Cleaning up listener for league ID: ${id}`); // Optional: for debugging
      unsubscribe();
    };
  }, [id]); // Re-run effect if id changes

  if (!id)         return null;
  if (loading)     return <p className="p-8">Loading league details…</p>;
  if (error)       return <p className="p-8">Error: {error}</p>;
  if (!league)     return <p className="p-8">League data could not be loaded or league not found.</p>;

  const isAdmin = user?.uid === league.adminUid;

  /** rename will optimistically update local state */
  async function handleRename(newName: string) {
    if (!league) return;
    try {
      await renameLeague(league.id, newName.trim());
      toast.success("League renamed");
    } catch {
      toast.error("Rename failed");
    }
  }

  /** toggle privacy likewise updates local state in-place */
  async function handleTogglePrivacy(checked: boolean) {
    if (!league) return;
    try {
      await toggleLeagueVisibility(league.id, checked);
      toast.success(
        checked ? "League is now public" : "League is now private"
      );
    } catch {
      toast.error("Could not change privacy");
    }
  }

  async function handleSaveCaptainSettings() {
    if (!league || !id) return;
    if (currentEnableCaptain && (currentCaptainMultiplier < 1 || currentCaptainMultiplier > 3)) {
        toast.error("Captain point multiplier must be between 1 and 3.");
        return;
    }
    try {
      await updateLeagueCaptainSettings({
        leagueId: id,
        enableCaptainFeature: currentEnableCaptain,
        captainPointMultiplier: currentCaptainMultiplier,
      });
      toast.success("Captain settings updated!");
    } catch (err) {
      toast.error("Failed to update captain settings.");
      console.error("Error updating captain settings:", err);
    }
  }

  async function handleSaveWeeklyTipsSettings() {
    if (!league || !id) return;
    try {
      await updateLeagueWeeklyTipsSettings({
        leagueId: id,
        enableWeeklyTips: currentEnableWeeklyTips,
      });
      toast.success("Weekly tips settings updated!");
    } catch (err) {
      toast.error("Failed to update weekly tips settings.");
      console.error("Error updating weekly tips settings:", err);
    }
  }

  return (
    <>
      <PageMeta title={`${league.name} | Easy Fantasy`} description="" />

      {/* Mobile-First Container */}
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          
          {/* Mobile-First Header */}
          <div className="pt-4 pb-6">
            {/* Back Button */}
            <div className="mb-4">
              <Button size="sm" variant="outline" onClick={() => nav(-1)}>
                ← Back
              </Button>
            </div>

            {/* League Info */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                {league.name}
              </h1>
              <div className="flex items-center gap-4 flex-wrap text-sm text-gray-600 dark:text-gray-400">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                  Code: {league.code}
                </span>
                <span>{league.members?.length ?? 0} member{league.members?.length !== 1 ? 's' : ''}</span>
              </div>
            </div>

            {/* Mobile-First Action Buttons */}
            <div className="space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-3">
              <Link to={`/leagues/${league.id}/lineup/${currentNflWeek}`}>
                <Button size="md" variant="primary" className="w-full sm:w-auto">
                  ⚡ Set Lineup (Week {currentNflWeek})
                </Button>
              </Link>
              
              <Link to="/tips">
                <Button size="md" variant="outline" className="w-full sm:w-auto">
                  🎯 Make Game Tips
                </Button>
              </Link>

              {isAdmin && (
                <Button
                  onClick={openModal}
                  size="md"
                  variant="outline"
                  className="w-full sm:w-auto"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit League
                </Button>
              )}
            </div>
          </div>

          {/* League Content */}
          <div className="space-y-6">
            {/* Standings Section */}
            <ComponentCard title="League Standings">
              <LeagueStandingsTable members={league.members} />
            </ComponentCard>

            {/* Prophet Leaderboard (if weekly tips enabled) */}
            {league.enableWeeklyTips && (
              <ComponentCard title="Prophet Leaderboard">
                <ProphetLeaderboard 
                  leagueId={league.id}
                  season={parseInt(APP_CONFIG.CURRENT_NFL_SEASON)}
                />
              </ComponentCard>
            )}
          </div>
        </div>
      </div>

      {/* Admin Modal */}
      <Modal isOpen={isOpen} onClose={closeModal} className="max-w-2xl p-6">
        <div className="space-y-6">
          {/* Modal Title */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Edit League</h2>
          </div>

          {/* Rename Section */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">League Name</h4>
            <RenameForm current={league.name} onSave={handleRename} />
          </div>

          {/* Privacy Section */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Privacy Settings</h4>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-700 dark:text-gray-300">Public League</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Allow others to find and join this league</p>
              </div>
              <Switch
                label=""
                defaultChecked={league.isPublic ?? false}
                onChange={handleTogglePrivacy}
              />
            </div>
          </div>

          {/* Captain Settings */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Captain Feature</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">Enable Captain</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Allow players to select a captain for bonus points</p>
                </div>
                                 <Switch
                   label=""
                   defaultChecked={currentEnableCaptain}
                   onChange={setCurrentEnableCaptain}
                 />
              </div>
              
              {currentEnableCaptain && (
                <div>
                  <Label htmlFor="multiplier">Captain Point Multiplier</Label>
                  <Input
                    id="multiplier"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="3"
                    step="0.1"
                    value={currentCaptainMultiplier}
                    onChange={(e) => setCurrentCaptainMultiplier(parseFloat(e.target.value))}
                    className="mt-1"
                  />
                </div>
              )}
              
              <Button onClick={handleSaveCaptainSettings} size="sm" variant="outline">
                Save Captain Settings
              </Button>
            </div>
          </div>

          {/* Weekly Tips Settings */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Weekly Tips</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">Enable Weekly Tips</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Allow members to make game predictions</p>
                </div>
                                 <Switch
                   label=""
                   defaultChecked={currentEnableWeeklyTips}
                   onChange={setCurrentEnableWeeklyTips}
                 />
              </div>
              
              <Button onClick={handleSaveWeeklyTipsSettings} size="sm" variant="outline">
                Save Tips Settings
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

// Rename Form Component
function RenameForm({
  current,
  onSave,
}: {
  current: string;
  onSave: (newName: string) => Promise<void>;
}) {
  const [name, setName] = useState(current);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name.trim() === current) return;
    
    setSaving(true);
    try {
      await onSave(name.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1"
        placeholder="League name"
      />
      <Button
        type="submit"
        size="sm"
        disabled={saving || !name.trim() || name.trim() === current}
      >
        {saving ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
