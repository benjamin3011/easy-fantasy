/* components/leagues/CreateLeagueDialog.tsx */
import { useState, FormEvent } from "react";
import { createLeague } from "../../utils/leagues"; // Uses callable function
import { useAuth } from "../../context/AuthContext";

import { Modal } from "../../components/ui/modal";
import Button from "../../components/ui/button/Button";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import Switch from "../form/switch/Switch"; // Assuming you have a Switch component
import { CreateLeagueResult } from "../../utils/leagues";

interface Props {
  isOpen : boolean;
  onClose(): void;
  onSuccess(result?: CreateLeagueResult): void;
}

export default function CreateLeagueDialog({ isOpen, onClose, onSuccess }: Props) {
  const { user } = useAuth();

  const [leagueName, setLeagueName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [enableCaptainFeature, setEnableCaptainFeature] = useState(false);
  const [captainPointMultiplier, setCaptainPointMultiplier] = useState(1.5);
  const [enableWeeklyTips, setEnableWeeklyTips] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) {
      setError("You must be logged in to create a league.");
      return;
    }
    // Validate multiplier if feature is enabled
    if (enableCaptainFeature && (captainPointMultiplier < 1 || captainPointMultiplier > 3)) {
        setError("Captain point multiplier must be between 1 and 3.");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const result = await createLeague(
        leagueName.trim(),
        teamName.trim(),
        isPublic,
        enableCaptainFeature,
        captainPointMultiplier,
        enableWeeklyTips
      );
      onSuccess(result);
      onClose();
      setLeagueName("");
      setTeamName("");
      setIsPublic(false);
      setEnableCaptainFeature(false); // Reset state
      setCaptainPointMultiplier(1.5); // Reset state
    } catch (error) {
      const errorObj = error as { code: string; message: string };
      setError(errorObj.message || "Failed to create league. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-[480px] p-5 lg:p-8">
      <form onSubmit={handleSubmit}>
        <h4 className="mb-6 text-lg font-semibold text-gray-800 dark:text-white/90">
          Create League
        </h4>

        <div className="space-y-5">
          <div>
            <Label required>League name</Label>
            <Input
              placeholder="e.g. Sunday Night Heroes"
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div>
            <Label required>Your team name</Label>
            <Input
              placeholder="e.g. Hail Marys"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="flex items-center">
            <input
              id="isPublic"
              type="checkbox"
              checked={isPublic}
              onChange={e => setIsPublic(e.target.checked)}
              className="mr-2 h-4 w-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
              disabled={loading}
            />
            <label htmlFor="isPublic" className="select-none text-sm text-gray-700 dark:text-gray-300">
              Public league (anyone can discover & join)
            </label>
          </div>

          {/* Captain Feature Toggle */}
          <div className="flex items-center justify-between py-2">
            <Label htmlFor="enableCaptainFeature">Enable Captain Feature</Label>
            <Switch 
              label=""
              defaultChecked={enableCaptainFeature}
              onChange={setEnableCaptainFeature} 
              disabled={loading}
            />
            {/* Hidden input for form association if Switch doesn't have one or for semantic meaning */}
            <input type="checkbox" id="enableCaptainFeature" checked={enableCaptainFeature} readOnly className="hidden" />
          </div>

          {/* Captain Point Multiplier Input (conditional) */}
          {enableCaptainFeature && (
            <div>
              <Label required htmlFor="captainMultiplier">Captain Point Multiplier (1 to 3)</Label>
              <Input
                id="captainMultiplier"
                type="number"
                inputMode="numeric"
                value={captainPointMultiplier}
                onChange={(e) => setCaptainPointMultiplier(parseFloat(e.target.value))}
                min="1"
                max="3"
                step="0.1"
                required
                disabled={loading}
                className="w-full"
              />
            </div>
          )}

          {/* Weekly Tips Toggle */}
          <div className="flex items-center justify-between py-2">
            <Label htmlFor="enableWeeklyTips">Enable Weekly Tips</Label>
            <Switch 
              label=""
              defaultChecked={enableWeeklyTips}
              onChange={setEnableWeeklyTips} 
              disabled={loading}
            />
            <input type="checkbox" id="enableWeeklyTips" checked={enableWeeklyTips} readOnly className="hidden" />
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button size="sm" variant="outline" type="button" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button size="sm" type="submit" disabled={loading || !leagueName.trim() || !teamName.trim()}>
            {loading ? "Creating…" : "Create"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
