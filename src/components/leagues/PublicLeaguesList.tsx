// components/leagues/PublicLeaguesList.tsx
import { useEffect, useState } from "react";
import { getPublicLeagues, joinLeagueById, League } from "../../utils/leagues"; // Uses callable
import { useAuth } from "../../context/AuthContext";
import Button from "../ui/button/Button";
import { FunctionsError } from "firebase/functions"; // Import FunctionsError

// Reusable type guard
function isFunctionsError(error: unknown): error is FunctionsError {
  return typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code: unknown }).code === 'string';
}

export default function PublicLeaguesList() {
  const { user } = useAuth();
  const [list, setList] = useState<League[]>([]);
  const [loadingLeagueId, setLoadingLeagueId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null); // Add state for general list errors

  useEffect(() => {
    setError(null); // Clear error on load/reload
    getPublicLeagues()
      .then(setList)
      .catch(err => {
        console.error("Failed to load public leagues:", err);
        setError("Could not load public leagues. Please refresh."); // Show error message
      });
  }, []); // Dependency array is empty, runs once on mount

  const handleJoin = async (leagueId: string) => {
    if (!user) {
      alert("Please log in to join a league.");
      return;
    }
    const teamName = prompt("Enter your team name:");
    if (!teamName || !teamName.trim()) {
      return;
    }

    setLoadingLeagueId(leagueId);

    try {
      // Call updated joinLeagueById - no uid needed
      await joinLeagueById(leagueId, teamName.trim());
      alert("Successfully joined the league!");
      // Optionally: Refresh user's leagues or navigate
    } catch (err: unknown) { // Catch as unknown
      console.error(`Error joining league ${leagueId}:`, err);
      let message = "Could not join league. Please try again.";

      if (isFunctionsError(err)) {
        switch (err.code) {
            case 'unauthenticated':
                message = "Authentication error. Please log in again.";
                break;
            case 'not-found':
                message = "League not found.";
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
        message = err.message;
      }
      alert(`Join failed: ${message}`); // Show error in an alert for simplicity here
    } finally {
      setLoadingLeagueId(null);
    }
  };

  if (error) {
     return <p className="text-red-600 dark:text-red-400">{error}</p> // Show list loading error
  }

  // Still return null if logged out or no leagues (and no error)
  if (!user || list.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Discover Public Leagues</h3>
      {list.map(lg => (
        <div key={lg.id} className="flex justify-between items-center p-4 border rounded">
          <div>
            <p className="font-medium">{lg.name}</p>
            <p className="text-xs text-gray-500">{lg.members?.length ?? 0} members</p>
          </div>
          <Button
            onClick={() => handleJoin(lg.id)}
            disabled={loadingLeagueId === lg.id}
          >
            {loadingLeagueId === lg.id ? "Joining..." : "Join League"}
          </Button>
        </div>
      ))}
    </div>
  );
}
