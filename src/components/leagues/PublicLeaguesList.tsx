// components/leagues/PublicLeaguesList.tsx
import { useEffect, useState, useCallback } from "react";
// getPublicLeagues now returns { leagues: ..., nextCursor: ... }
import { getPublicLeagues, joinLeagueById, League } from "../../utils/leagues";
import { useAuth } from "../../context/AuthContext";
import Button from "../ui/button/Button";
import { EnterIcon } from "../../icons";
import { FunctionsError } from "firebase/functions";
// Import type needed for pagination state
import { QueryDocumentSnapshot, DocumentData } from "firebase/firestore";

// Reusable type guard (or place in a shared utils file)
function isFunctionsError(error: unknown): error is FunctionsError {
  return typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code: unknown }).code === 'string';
}

export default function PublicLeaguesList() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]); // State for the list of leagues
  const [loading, setLoading] = useState(false); // For initial load indicator
  const [error, setError] = useState<string | null>(null); // For fetch errors
  const [loadingMore, setLoadingMore] = useState(false); // For "Load More" button indicator
  // State to hold the cursor for the next page
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasNextPage, setHasNextPage] = useState(true); // Assume there's a next page initially
  const [joiningLeagueId, setJoiningLeagueId] = useState<string | null>(null); // For join button loading state

  // useCallback to memoize the fetch function
  const loadLeagues = useCallback(async (loadMore = false) => {
    // Prevent loading more if we know there are no more pages or already loading
    if ((!hasNextPage && loadMore) || loading || loadingMore) return;

    setLoading(!loadMore); // Show initial loading indicator only
    setLoadingMore(loadMore); // Show "Load More" loading indicator
    setError(null); // Clear previous errors

    try {
      // Call getPublicLeagues, passing the cursor if loading more
      const result = await getPublicLeagues(10, loadMore ? lastVisible : null);

      // Update state: Append if loading more, replace if initial load
      setLeagues(prev => loadMore ? [...prev, ...result.leagues] : result.leagues);
      setLastVisible(result.nextCursor ?? null); // Store the new cursor
      setHasNextPage(!!result.nextCursor); // Update whether there's a next page
    } catch (err) {
      console.error("Failed to load public leagues:", err);
      setError("Could not load public leagues. Please try again.");
    } finally {
      setLoading(false); // Clear initial loading
      setLoadingMore(false); // Clear "Load More" loading
    }
  // Dependencies: Recreate function if lastVisible or hasNextPage state changes
  }, [lastVisible, hasNextPage, loading, loadingMore]);

  // useEffect to trigger the initial load when the component mounts
  useEffect(() => {
    loadLeagues(false); // Call the memoized function for the initial load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array: Run only once on mount

  // Handle Join button click (logic unchanged, uses correct callable wrapper)
  const handleJoin = async (leagueId: string) => {
    if (!user) {
      alert("Please log in to join a league.");
      return;
    }
    const teamName = prompt("Enter your team name:");
    if (!teamName || !teamName.trim()) {
      return;
    }
    setJoiningLeagueId(leagueId);
    try {
      await joinLeagueById(leagueId, teamName.trim());
      alert("Successfully joined the league!");
      // TODO: Optionally refresh user's league list or navigate
    } catch (err: unknown) { // Catch as unknown
      console.error(`Error joining league ${leagueId}:`, err);
      let message = "Could not join league. Please try again.";
      if (isFunctionsError(err)) {
        switch (err.code) {
            case 'unauthenticated': message = "Authentication error. Please log in again."; break;
            case 'not-found': message = "League not found."; break;
            case 'already-exists': message = "You are already a member of this league."; break;
            case 'invalid-argument': message = `Invalid input: ${err.message}`; break;
            default: message = `An unexpected error occurred (${err.code}): ${err.message}`; break;
        }
      } else if (err instanceof Error) { message = err.message; }
      alert(`Join failed: ${message}`);
    } finally {
      setJoiningLeagueId(null);
    }
  };

  // Render loading state for initial load
  if (loading) return <p className="p-4 text-center text-gray-500">Loading leagues...</p>;

  // Render error state
  if (error) return <p className="p-4 text-center text-red-600 dark:text-red-400">{error}</p>;

  // Render message if logged in but no leagues found
  if (user && leagues.length === 0) {
    return <p className="p-4 text-center text-gray-500">No public leagues found.</p>;
  }

  // Don't render anything if logged out and no leagues (or initial state before loading finishes)
  if (!user) return null;


  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200
                    bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
      {/* header */}
      <div className="px-4 pt-4 sm:px-6">
        <div className="mb-4 flex flex-col gap-2
                        sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Public Leagues
          </h3>
        </div>
      </div>
      {leagues.map(lg => (
         <div key={lg.id} className="flex justify-between items-center px-4 p-4 sm:px-6 border-t">
            <div>
              <p className="font-medium">{lg.name}</p>
              <p className="text-xs text-gray-500">{lg.members?.length ?? 0} members</p>
            </div>
            <Button
                onClick={() => handleJoin(lg.id)}
                disabled={joiningLeagueId === lg.id}
              size="sm"
              variant="outline"
              startIcon={<EnterIcon className="size-5" />}
            >
              {joiningLeagueId === lg.id ? "Joining..." : "Join"}
            </Button>
         </div>
      ))}
      {/* Show "Load More" button only if there is potentially a next page */}
      {hasNextPage && (
        <div className="text-center mt-4">
            <Button onClick={() => loadLeagues(true)} disabled={loadingMore}>
                {loadingMore ? "Loading..." : "Load More"}
            </Button>
        </div>
      )}
    </div>
  );
}
