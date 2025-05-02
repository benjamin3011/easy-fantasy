/* components/leagues/JoinLeagueDialog.tsx */
import { useState, FormEvent } from "react";
import { joinLeague } from "../../utils/leagues"; // Uses joinLeagueByCode callable
import { useAuth } from "../../context/AuthContext";

import { Modal } from "../../components/ui/modal";
import Button from "../../components/ui/button/Button";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import { FunctionsError } from "firebase/functions"; // Import FunctionsError

interface Props {
    isOpen : boolean;
    onClose(): void;
    onSuccess(): void; // Consider: onSuccess(leagueId: string);
}

// Reusable type guard (or place in a shared utils file)
function isFunctionsError(error: unknown): error is FunctionsError {
  return typeof error === 'object' && error !== null && 'code' in error && typeof (error as Record<string, unknown>).code === 'string';
}

export default function JoinLeagueDialog({ isOpen, onClose, onSuccess }: Props) {
  const { user } = useAuth();

  const [code, setCode] = useState("");
  const [teamName, setTeamName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) {
       setError("You must be logged in to join a league.");
       return;
    }
    setError(null);
    setLoading(true);

    try {
      // Call the wrapper - no uid needed
      await joinLeague(
        code.trim().toUpperCase(),
        teamName.trim()
      );
      // const result = await joinLeague(...); // If you need leagueId
      // onSuccess(result.leagueId);
      onSuccess();
      onClose();
      setCode("");
      setTeamName("");
    } catch (err: unknown) { // Catch as unknown
      console.error("Error joining league:", err);
      let message = "Could not join league. Please check the code and try again.";

      if (isFunctionsError(err)) {
        // Handle specific Firebase Functions error codes
        switch (err.code) {
            case 'unauthenticated':
                message = "Authentication error. Please log in again.";
                break;
            case 'not-found':
                message = "League with this code not found.";
                break;
            case 'already-exists':
                message = "You are already a member of this league.";
                break;
            case 'invalid-argument':
                message = `Invalid input: ${err.message}`;
                break;
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
          Join League by Code
        </h4>

        <div className="space-y-5">
          <div>
            <Label required>League code</Label>
            <Input
              placeholder="e.g., 123456"
              className="uppercase tracking-wider font-mono"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div>
            <Label required>Your team name</Label>
            <Input
              placeholder="e.g. Brady’s Bunch"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button size="sm" variant="outline" type="button" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button size="sm" type="submit" disabled={loading || !code.trim() || !teamName.trim()}>
            {loading ? "Joining…" : "Join"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
