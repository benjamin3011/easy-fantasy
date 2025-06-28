/* ------------------------------------------------------------------
 *  components / leagues / LeagueList.tsx
 *  → Mobile-first league list with cards on mobile, table on desktop
 *    Parents only provide:
 *      • leagues   – data
 *      • onCreate  – open "Create League" dialog
 *      • onJoin    – open "Join League" dialog
 * ------------------------------------------------------------------ */
import { Link } from "react-router";
import Button from "../ui/button/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../ui/table";
import { League } from "../../utils/leagues";
import { SkeletonList } from "../ui/skeleton/SkeletonLoader";

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
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 shadow-sm">
      {/* Mobile-First Header */}
      <div className="px-4 pt-6 pb-4 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              My Leagues
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {leagues.length} league{leagues.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Mobile-First Action Buttons */}
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-3">
            <Button 
              size="md" 
              variant="primary" 
              onClick={onCreate}
              className="w-full sm:w-auto"
            >
              Create League
            </Button>
            <Button 
              size="md" 
              variant="outline" 
              onClick={onJoin}
              className="w-full sm:w-auto"
            >
              Join League
            </Button>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="px-4 py-12 text-center sm:px-6">
          <div className="inline-flex items-center">
                    <SkeletonList items={3} showAvatar={false} />
          </div>
        </div>
      )}

      {/* Error State */}
      {!isLoading && error && (
        <div className="px-4 py-12 text-center sm:px-6">
          <div className="text-red-600 dark:text-red-400">
            <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && leagues.length === 0 && (
        <div className="px-4 py-12 text-center sm:px-6">
          <div className="text-gray-500 dark:text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-sm mb-4">{emptyMsg}</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button size="sm" variant="primary" onClick={onCreate}>
                Create Your First League
              </Button>
              <Button size="sm" variant="outline" onClick={onJoin}>
                Join Existing League
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Cards (visible on mobile only) */}
      {!isLoading && !error && leagues.length > 0 && (
        <div className="block sm:hidden">
          {leagues.map((league) => (
            <div key={league.id} className="border-t border-gray-200 dark:border-gray-700 px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                    {league.name}
                  </h4>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                    <span className="flex items-center">
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                      {league.code}
                    </span>
                    <span className="flex items-center">
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                      </svg>
                      {league.members?.length ?? 0} member{league.members?.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                <div className="ml-4">
                  <Link to={`/leagues/${league.id}`}>
                    <Button size="sm" variant="primary">
                      View
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Desktop Table (hidden on mobile) */}
      {!isLoading && !error && leagues.length > 0 && (
        <div className="hidden sm:block">
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader className="border-t border-gray-200 dark:border-gray-700">
                <TableRow>
                  <TableCell isHeader className="px-4 py-3 sm:px-6 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    League
                  </TableCell>
                  <TableCell isHeader className="px-4 py-3 sm:px-6 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Code
                  </TableCell>
                  <TableCell isHeader className="px-4 py-3 sm:px-6 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Members
                  </TableCell>
                  <TableCell isHeader className="px-4 py-3 sm:px-6 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Action
                  </TableCell>
                </TableRow>
              </TableHeader>

              <TableBody className="divide-y divide-gray-200 dark:divide-gray-700">
                {leagues.map((league) => (
                  <TableRow key={league.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <TableCell className="px-4 py-4 sm:px-6 text-sm font-medium text-gray-900 dark:text-white">
                      {league.name}
                    </TableCell>
                    <TableCell className="px-4 py-4 sm:px-6 text-sm font-mono text-gray-600 dark:text-gray-400">
                      {league.code}
                    </TableCell>
                    <TableCell className="px-4 py-4 sm:px-6 text-sm text-gray-600 dark:text-gray-400">
                      {league.members?.length ?? 0} member{league.members?.length !== 1 ? "s" : ""}
                    </TableCell>
                    <TableCell className="px-4 py-4 sm:px-6 text-sm">
                      <Link to={`/leagues/${league.id}`}>
                        <Button size="sm" variant="outline">
                          View
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
