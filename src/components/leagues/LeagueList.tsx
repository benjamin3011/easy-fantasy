/* ------------------------------------------------------------------
 *  components / leagues / LeagueCard.tsx
 *  → Self-contained UI: header + buttons + table.
 *    Parents only provide:
 *      • leagues   – data
 *      • onCreate  – open “Create League” dialog
 *      • onJoin    – open “Join League” dialog
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

interface Props {
  leagues: League[];
  isLoading: boolean; // Add isLoading prop
  error: string | null; // Add error prop
  onCreate: () => void;
  onJoin: () => void;
  emptyMsg?: string;
}

export default function LeagueCard({
  leagues,
  isLoading, // Destructure new props
  error,
  onCreate,
  onJoin,
  emptyMsg = "You haven’t joined or created a league yet.",
}: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200
                    bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
      {/* header */}
      <div className="px-4 pt-4 sm:px-6">
        <div className="mb-4 flex flex-col gap-2
                        sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            My Leagues
          </h3>

          <div className="flex items-center gap-3">
            <Button size="sm" onClick={onJoin}>
              Join&nbsp;League
            </Button>
            <Button size="sm" variant="outline" onClick={onCreate}>
              Create&nbsp;League
            </Button>
          </div>
        </div>
      </div>

      {/* table */}
      <div className="max-w-full overflow-x-auto">
        <Table>
          <TableHeader className="border-y border-gray-100 dark:border-white/[0.05]">
            <TableRow>
              <TableCell isHeader className="px-4 py-3 sm:px-6 text-theme-xs font-medium text-start text-gray-500 dark:text-gray-400">
                League
              </TableCell>
              <TableCell isHeader className="px-4 py-3 sm:px-6 text-theme-xs font-medium text-start text-gray-500 dark:text-gray-400">
                Code
              </TableCell>
              <TableCell isHeader className="px-4 py-3 sm:px-6 text-theme-xs font-medium text-start text-gray-500 dark:text-gray-400">
                Members
              </TableCell>
              <TableCell isHeader className="px-4 py-3 sm:px-6 text-theme-xs font-medium text-start text-gray-500 dark:text-gray-400">
                Action
              </TableCell>
            </TableRow>
          </TableHeader>

          <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
            {/* Handle Loading State */}
            {isLoading && (
                 <TableRow>
                    <TableCell className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                      Loading your leagues...
                    </TableCell>
                </TableRow>
            )}
            {/* Handle Error State */}
            {!isLoading && error && (
                 <TableRow>
                    <TableCell className="px-4 py-10 text-center text-sm text-red-600 dark:text-red-400">
                      {error}
                    </TableCell>
                </TableRow>
            )}
            {/* Handle Empty State */}
            {!isLoading && !error && leagues.length === 0 && (
              <TableRow>
                <TableCell className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                  {emptyMsg}
                </TableCell>
              </TableRow>
            )}
            {/* Render League Rows */}
            {!isLoading && !error && leagues.length > 0 && (
              leagues.map((lg) => (
                <TableRow key={lg.id}>
                  <TableCell className="px-4 py-3 sm:px-6 text-theme-sm font-medium text-gray-800 dark:text-white/90">
                    {lg.name}
                  </TableCell>
                  <TableCell className="px-4 py-3 sm:px-6 text-theme-sm font-mono text-gray-600 dark:text-gray-400">
                    {/* Show code only for admin? Or always? Consider security/privacy */}
                    {lg.code}
                  </TableCell>
                  <TableCell className="px-4 py-3 sm:px-6 text-theme-sm text-gray-600 dark:text-gray-400">
                    {lg.members?.length ?? 0} member{lg.members?.length !== 1 ? "s" : ""}
                  </TableCell>
                  <TableCell className="px-4 py-3 sm:px-6 text-theme-sm text-gray-600 dark:text-gray-400">
                    {/* Ensure Link component is correctly imported */}
                    <Link to={`/leagues/${lg.id}`}>
                      <Button size="sm" variant="outline">View</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
