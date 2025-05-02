// pages/LeagueDetail.tsx
import { useParams, useNavigate } from "react-router";
import { useCallback, useEffect, useState } from "react";
import {
  League,
  getLeague,
  renameLeague,
  toggleLeagueVisibility,
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

export default function LeagueDetail() {
  const { id }   = useParams<{ id: string }>();
  const nav      = useNavigate();
  const { user } = useAuth();
  const { isOpen, openModal, closeModal } = useModal();

  const [league, setLeague]   = useState<League | null>(null);
  const [loading, setLoading] = useState(true);

  /** load once on mount */
  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const data = await getLeague(id);
    setLeague(data);
    setLoading(false);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (!id)         return null;
  if (loading)     return <p className="p-8">Loading…</p>;
  if (!league)     return <p className="p-8">League not found.</p>;

  const isAdmin = user?.uid === league.adminUid;

  /** rename will optimistically update local state */
  async function handleRename(newName: string) {
    if (!league) return;
    try {
      await renameLeague(league.id, newName.trim());
      setLeague(lg => lg ? { ...lg, name: newName.trim() } : lg);
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
      setLeague(lg => lg ? { ...lg, isPublic: checked } : lg);
      toast.success(
        checked ? "League is now public" : "League is now private"
      );
    } catch {
      toast.error("Could not change privacy");
    }
  }

  return (
    <>
      <PageMeta title={`${league.name} | Easy Fantasy`} description="" />

      {/* ← Back + Title */}
      <div className="mb-6 flex items-center gap-4">
        <Button size="sm" variant="outline" onClick={() => nav(-1)}>
          ← Back
        </Button>
        <h1 className="text-2xl font-semibold">{league.name}</h1>
        <span className="rounded bg-gray-100 px-2 py-1 text-xs font-mono tracking-wider">
          Code {league.code}
        </span>
        {isAdmin && (
          <button
          onClick={openModal}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200 lg:inline-flex lg:w-auto"
        >
          <svg
            className="fill-current"
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M15.0911 2.78206C14.2125 1.90338 12.7878 1.90338 11.9092 2.78206L4.57524 10.116C4.26682 10.4244 4.0547 10.8158 3.96468 11.2426L3.31231 14.3352C3.25997 14.5833 3.33653 14.841 3.51583 15.0203C3.69512 15.1996 3.95286 15.2761 4.20096 15.2238L7.29355 14.5714C7.72031 14.4814 8.11172 14.2693 8.42013 13.9609L15.7541 6.62695C16.6327 5.74827 16.6327 4.32365 15.7541 3.44497L15.0911 2.78206ZM12.9698 3.84272C13.2627 3.54982 13.7376 3.54982 14.0305 3.84272L14.6934 4.50563C14.9863 4.79852 14.9863 5.2734 14.6934 5.56629L14.044 6.21573L12.3204 4.49215L12.9698 3.84272ZM11.2597 5.55281L5.6359 11.1766C5.53309 11.2794 5.46238 11.4099 5.43238 11.5522L5.01758 13.5185L6.98394 13.1037C7.1262 13.0737 7.25666 13.003 7.35947 12.9002L12.9833 7.27639L11.2597 5.55281Z"
              fill=""
            />
          </svg>
          Edit
        </button>
        )}
      </div>

      <ComponentCard title="Standings">
        <LeagueStandingsTable members={league.members} />
      </ComponentCard>

      {isAdmin && (
        <Modal isOpen={isOpen} onClose={closeModal} className="max-w-lg p-6">
          <h2 className="text-xl font-semibold mb-4">League Settings</h2>

          {/* Rename */}
          <div className="space-y-2 mb-6">
            <h4 className="font-medium">Rename League</h4>
            <RenameForm current={league.name} onSave={handleRename} />
          </div>

          {/* Privacy */}
          <div className="space-y-2 mb-6">
            <h4 className="font-medium">Privacy</h4>
            <div className="flex items-center gap-2">
              <Switch label={league.isPublic
                  ? "Public (anyone can discover)"
                  : "Private (invite code only)"}
                defaultChecked={league.isPublic}
                onChange={handleTogglePrivacy}
              />
              
            </div>
          </div>

          {/* Invite Code */}
          <div className="space-y-2">
            <h4 className="font-medium">Invite Code</h4>
            <p className="font-mono text-lg">{league.code}</p>
            <p className="text-sm text-gray-500">
              Share this or send&nbsp;
              <a
                href={`${window.location.origin}/leagues/${league.id}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                this link
              </a>.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}

/** inline form for renaming without reloading */
function RenameForm({
  current,
  onSave,
}: {
  current: string;
  onSave: (newName: string) => Promise<void>;
}) {
  const [name, setName]     = useState(current);
  const [saving, setSaving] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onSave(name);
        setSaving(false);
      }}
      className="flex gap-2"
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <Button size="sm" type="submit" disabled={saving || name === current}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
