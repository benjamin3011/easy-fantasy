/* ------------------------------------------------------------------
 *  components / leagues / LeagueList.tsx
 *  → Modern card-based league list with beautiful design
 *    Parents only provide:
 *      • leagues   – data
 *      • onCreate  – open "Create League" dialog
 *      • onJoin    – open "Join League" dialog
 * ------------------------------------------------------------------ */
import { useNavigate } from "react-router";
import Button from "../ui/button/Button";
import { League } from "../../utils/leagues";
import { useAuth } from "../../context/AuthContext";

interface Props {
  leagues: League[];
  isLoading: boolean;
  error: string | null;
  onCreate: () => void;
  onJoin: () => void;
  emptyMsg?: string;
}

export default function LeagueList({
  leagues,
  isLoading,
  error,
  onCreate,
  onJoin,
  emptyMsg = "You haven't joined or created a league yet.",
}: Props) {
  const { user } = useAuth();
  const currentUserId = user?.uid;
  const navigate = useNavigate();

  // Helper function to check if user is admin
  const isAdmin = (league: League) => currentUserId && league.adminUid === currentUserId;

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">
      {/* Header */}
      <div className="px-4 py-6 border-b border-gray-200 dark:border-gray-700 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              My Leagues
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {leagues.length} league{leagues.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <Button size="sm" variant="primary" onClick={onCreate}>
              ⚡ Create League
            </Button>
            <Button size="sm" variant="outline" onClick={onJoin}>
              🚀 Join League
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 sm:p-6">
        {/* Loading State */}
        {isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-gray-100 dark:bg-gray-700 rounded-lg h-20 animate-pulse" />
            ))}
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-center">
              <div className="text-red-600 dark:text-red-400 mr-3">❌</div>
              <div>
                <h4 className="font-medium text-red-800 dark:text-red-200">Error loading leagues</h4>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && leagues.length === 0 && (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">🏈</div>
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              No Leagues Yet
            </h4>
            <p className="text-gray-600 dark:text-gray-400">{emptyMsg}</p>
          </div>
        )}

        {/* League Cards */}
        {!isLoading && !error && leagues.length > 0 && (
          <div className="space-y-4">
            {leagues.map((league) => {
              const memberCount = league.members?.length ?? 0;
              const userIsAdmin = isAdmin(league);

              return (
                <div
                  key={league.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-200"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold text-lg text-gray-900 dark:text-white truncate">
                          {league.name}
                        </h4>
                        {userIsAdmin && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                            👑 Admin
                          </span>
                        )}
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          league.isPublic 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                        }`}>
                          {league.isPublic ? '🌍 Public' : '🔒 Private'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          🔖 <span className="font-mono">{league.code}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          👥 {memberCount} member{memberCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <div className="ml-4">
                      <button
                        type="button"
                        onMouseEnter={() => {
                          // Preload LeagueDetail chunk on hover
                          import('../../pages/LeagueDetail');
                        }}
                        onTouchStart={() => {
                          // Preload LeagueDetail chunk on touch
                          import('../../pages/LeagueDetail');
                        }}
                        onClick={() => navigate(`/leagues/${league.id}`)}
                        className="shadow-theme-xs inline-flex h-6 items-center justify-center rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
                        aria-label={`View league ${league.name}`}
                      >
                        View
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}