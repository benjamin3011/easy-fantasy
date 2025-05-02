/* components/leagues/CreateLeagueDialog.tsx */
import { useState, FormEvent } from "react";
import { createLeague } from "../../utils/leagues"; // Uses callable function
import { useAuth } from "../../context/AuthContext";

import { Modal } from "../../components/ui/modal";
import Button from "../../components/ui/button/Button";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import { FunctionsError } from "firebase/functions"; // Import FunctionsError for specific codes

interface Props {
  isOpen : boolean;
  onClose(): void;
  onSuccess(): void; // Consider: onSuccess(leagueId: string);
}

// Helper type guard to check for Firebase Functions errors
function isFunctionsError(error: unknown): error is FunctionsError {
  return typeof error === 'object' && error !== null && 'code' in error && typeof (error as {code: unknown}).code === 'string';
}

export default function CreateLeagueDialog({ isOpen, onClose, onSuccess }: Props) {
  const { user } = useAuth();

  const [leagueName, setLeagueName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) {
      setError("You must be logged in to create a league.");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      // Call the wrapper - no uid needed
      await createLeague(
        leagueName.trim(),
        teamName.trim(),
        isPublic
      );
      // const result = await createLeague(...); // If you need the ID
      // onSuccess(result.id);
      onSuccess();
      onClose();
      setLeagueName("");
      setTeamName("");
      setIsPublic(false);
    } catch (err: unknown) { // Catch as unknown
      console.error("Error creating league:", err);
      let message = "Could not create league. Please try again.";

      if (isFunctionsError(err)) {
        // Handle specific Firebase Functions error codes
        switch (err.code) {
          case 'unauthenticated':
            message = "Authentication error. Please log in again.";
            break;
          case 'invalid-argument':
            message = `Invalid input: ${err.message}`; // Use function's error message
            break;
          // Add other specific codes if needed
          default:
            message = `An unexpected error occurred (${err.code}): ${err.message}`;
            break;
        }
      } else if (err instanceof Error) {
        // Handle generic JavaScript Error
        message = err.message;
      }
      setError(message);
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
              className="mr-2"
              disabled={loading}
            />
            <label htmlFor="isPublic" className="select-none">
              Public league (anyone can discover & join)
            </label>
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
