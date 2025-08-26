// components/leagues/PublicLeaguesList.tsx
import { useEffect, useState } from "react";
import { getPublicLeagues, League } from "../../utils/leagues";
import { QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import JoinLeagueDialog from "./JoinLeagueDialog";

export default function PublicLeaguesList() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true); // Start with loading true to prevent flicker
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [selectedLeagueCode, setSelectedLeagueCode] = useState<string>("");

  // Function to load leagues
  const loadLeagues = async (loadMore = false) => {
    console.log('loadLeagues called:', { loadMore, hasNextPage, loading, loadingMore });
    
    // Only prevent if trying to load more when there's no next page, or if already loading more
    if ((!hasNextPage && loadMore) || loadingMore) {
      console.log('loadLeagues early return:', { hasNextPage, loadMore, loading, loadingMore });
      return;
    }

    console.log('Starting API call...');
    if (!loadMore) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);

    try {
      console.log('Calling getPublicLeagues...');
      const result = await getPublicLeagues(10, loadMore ? lastVisible : null);
      console.log('API result:', result);
      
      // Update leagues
      if (loadMore) {
        setLeagues(prev => [...prev, ...result.leagues]);
      } else {
        setLeagues(result.leagues);
      }
      
      // Update pagination
      setLastVisible(result.nextCursor ?? null);
      setHasNextPage(!!result.nextCursor);
      
      // Debug logging
      console.log('Loaded leagues:', result.leagues.length, 'Has next:', !!result.nextCursor);
    } catch (err) {
      console.error("Failed to load public leagues:", err);
      setError("Could not load public leagues. Please try again.");
    } finally {
      console.log('Setting loading to false');
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Initial load - only run once on mount
  useEffect(() => {
    loadLeagues();
  }, []);

  const handleJoinClick = (leagueCode: string) => {
    setSelectedLeagueCode(leagueCode);
    setJoinDialogOpen(true);
  };

  const handleJoinSuccess = () => {
    // Refresh the leagues list after successful join
    loadLeagues();
    setError(null);
  };

  const getActivityBadge = (memberCount: number) => {
    if (memberCount >= 8) {
      return { text: 'Very Active', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', icon: '🔥' };
    } else if (memberCount >= 4) {
      return { text: 'Active', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', icon: '⚡' };
    } else {
      return { text: 'New League', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', icon: '🌟' };
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">
      {/* Header */}
      <div className="px-4 py-6 border-b border-gray-200 dark:border-gray-700 sm:px-6">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">
          Discover Public Leagues
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Join exciting leagues created by other players
        </p>
      </div>

      {/* Content */}
      <div className="p-4 sm:p-6">
        {/* Error State */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
            <div className="flex items-center">
              <div className="text-red-600 dark:text-red-400 mr-3">⚠️</div>
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        )}

        {/* Loading State - Initial */}
        {loading && leagues.length === 0 && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-gray-100 dark:bg-gray-700 rounded-lg h-20 animate-pulse" />
            ))}
            <div className="text-xs text-gray-500 text-center">
              Debug: loading={loading.toString()}, leagues={leagues.length}, error={error || 'null'}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && leagues.length === 0 && (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">🌍</div>
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              No Public Leagues Found
            </h4>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Be the first to create a public league for others to join!
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="shadow-theme-xs inline-flex h-8 items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
            >
              🔄 Refresh
            </button>
          </div>
        )}

        {/* Leagues List */}
        {leagues.length > 0 && (
          <div className="space-y-4">
            {leagues.map((league) => {
              const memberCount = league.members?.length ?? 0;
              const activityBadge = getActivityBadge(memberCount);


              return (
                <div
                  key={league.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-200"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-lg text-gray-900 dark:text-white truncate mb-2">
                        {league.name}
                      </h4>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${activityBadge.color}`}>
                          {activityBadge.icon} {activityBadge.text}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        👥 {memberCount} member{memberCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleJoinClick(league.code.toString())}
                      className="shadow-theme-xs inline-flex h-6 items-center justify-center rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200 ml-4"
                      title="Join League"
                    >
                      Join
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Load More Button */}
            {hasNextPage && (
              <div className="text-center pt-4">
                              <button 
                onClick={() => loadLeagues(true)} 
                disabled={loadingMore}
                className="shadow-theme-xs inline-flex h-8 items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed w-full"
              >
                {loadingMore ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border border-gray-400 border-t-transparent"></div>
                    <span>Loading...</span>
                  </div>
                ) : (
                  "🔍 Load More Leagues"
                )}
              </button>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Join League Dialog */}
      <JoinLeagueDialog
        isOpen={joinDialogOpen}
        onClose={() => setJoinDialogOpen(false)}
        onSuccess={handleJoinSuccess}
        prefillCode={selectedLeagueCode}
      />
    </div>
  );
}