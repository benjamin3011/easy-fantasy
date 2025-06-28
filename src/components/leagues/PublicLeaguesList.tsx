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
            case 'functions/unauthenticated': message = "Authentication error. Please log in again."; break;
            case 'functions/not-found': message = "League not found."; break;
            case 'functions/already-exists': message = "You are already a member of this league."; break;
            case 'functions/invalid-argument': message = `Invalid input: ${err.message}`; break;
            default: message = `An unexpected error occurred (${err.code}): ${err.message}`; break;
        }
      } else if (err instanceof Error) { message = err.message; }
      alert(`Join failed: ${message}`);
    } finally {
      setJoiningLeagueId(null);
    }
  };

  // Don't render anything if logged out
  if (!user) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 shadow-sm">
      {/* Mobile-First Header */}
      <div className="px-4 pt-6 pb-4 sm:px-6">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            Public Leagues
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Join existing leagues
          </p>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="px-4 py-12 text-center sm:px-6">
          <div className="inline-flex items-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500 mr-3"></div>
            <span className="text-gray-600 dark:text-gray-400">Loading public leagues...</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="px-4 py-12 text-center sm:px-6">
          <div className="text-red-600 dark:text-red-400">
            <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <p className="text-sm mb-4">{error}</p>
            <Button size="sm" variant="outline" onClick={() => loadLeagues(false)}>
              Try Again
            </Button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && leagues.length === 0 && (
        <div className="px-4 py-12 text-center sm:px-6">
          <div className="text-gray-500 dark:text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
            <p className="text-sm">No public leagues found</p>
          </div>
        </div>
      )}

      {/* League Cards */}
      {!loading && !error && leagues.length > 0 && (
        <div>
          {leagues.map((league, index) => (
            <div 
              key={league.id} 
              className={`px-4 py-4 sm:px-6 ${index > 0 ? 'border-t border-gray-200 dark:border-gray-700' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                    {league.name}
                  </h4>
                  <div className="flex items-center mt-2 text-sm text-gray-600 dark:text-gray-400">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                    </svg>
                    {league.members?.length ?? 0} member{league.members?.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <div className="ml-4 flex-shrink-0">
                  <Button
                    onClick={() => handleJoin(league.id)}
                    disabled={joiningLeagueId === league.id}
                    size="sm"
                    variant="outline"
                    startIcon={joiningLeagueId === league.id ? undefined : <EnterIcon className="w-4 h-4" />}
                    className="min-w-[80px]"
                  >
                    {joiningLeagueId === league.id ? (
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Joining...
                      </div>
                    ) : (
                      "Join"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {/* Load More Button */}
          {hasNextPage && (
            <div className="px-4 py-6 text-center border-t border-gray-200 dark:border-gray-700 sm:px-6">
              <Button 
                onClick={() => loadLeagues(true)} 
                disabled={loadingMore}
                variant="outline"
                size="md"
                className="w-full sm:w-auto"
              >
                {loadingMore ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand-500 mr-2"></div>
                    Loading...
                  </div>
                ) : (
                  "Load More"
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
