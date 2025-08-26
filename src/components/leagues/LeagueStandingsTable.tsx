// src/components/leagues/LeagueStandingsTable.tsx
"use client";

import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../ui/table";
import PaginationWithButton from "../common/PaginationWithButton";
import { InfoIcon } from "../../icons";
import { calculateCurrentNFLWeek } from "../../utils/nflWeekHelper";
import type { Member } from "../../utils/leagues";

interface Props {
  members: Member[];
}

export default function LeagueStandingsTable({ members }: Props) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const currentWeek = calculateCurrentNFLWeek();

  const filtered = useMemo(() => {
    return members
      .filter((m) =>
        m.teamName.toLowerCase().includes(search.toLowerCase())
      );
  }, [members, search]);

  const total = filtered.length;
  const pages = Math.ceil(total / perPage);
  const start = (page - 1) * perPage;
  const end = start + perPage;

  // Sort members by total points descending
  const sortedMembers = useMemo(() => {
    return filtered
      .slice()
      .sort((a, b) => (b.totalSeasonPoints || 0) - (a.totalSeasonPoints || 0))
      .slice(start, end);
  }, [filtered, start, end]);

  return (
    <div className="overflow-hidden rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      {/* Mobile-First Controls */}
      <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-700 space-y-4 sm:space-y-0 sm:flex sm:items-center sm:justify-between">
        {/* Entries Selector */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-600 dark:text-gray-400">Show</span>
          <select
            className="px-3 py-1 text-sm border border-gray-300 rounded-lg bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            value={perPage}
            onChange={(e) => {
              setPerPage(+e.target.value);
              setPage(1);
            }}
          >
            {[5, 10, 20].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="text-gray-600 dark:text-gray-400">entries</span>
        </div>

        {/* Search Input */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search team..."
            className="pl-10 pr-4 py-2 w-full sm:w-64 text-sm border border-gray-300 rounded-lg bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {/* Mobile Cards (visible on mobile only) */}
      <div className="block sm:hidden">
        {sortedMembers.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <div className="text-gray-500 dark:text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 919.288 0M15 7a3 3 0 11-6 0 3 3 0 616 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-sm">No teams found</p>
            </div>
          </div>
        ) : (
          sortedMembers.map((member, index) => {
            const position = start + index + 1;
            const thisWeek = Math.round((member.weeklyPoints?.[currentWeek] ?? 0) * 100) / 100;
            
            return (
              <div key={member.uid} className="px-4 py-4 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {/* Position Badge */}
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                      position === 1 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                      position === 2 ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' :
                      position === 3 ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                      'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                    }`}>
                      {position}
                    </div>
                    
                    {/* Team Info */}
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-white">
                        {member.teamName}
                      </h4>
                      <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
                        <span>Week {currentWeek}: {thisWeek} pts</span>
                        <span>Total: {Math.round((member.totalSeasonPoints ?? 0) * 100) / 100} pts</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Action Button */}
                  <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <InfoIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Table (hidden on mobile) */}
      <div className="hidden sm:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell isHeader className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  #
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Team
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Week {currentWeek}
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Total
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </TableCell>
              </TableRow>
            </TableHeader>
            
            <TableBody className="divide-y divide-gray-200 dark:divide-gray-700">
              {sortedMembers.length === 0 ? (
                <TableRow>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    No teams found
                  </td>
                </TableRow>
              ) : (
                sortedMembers.map((member, index) => {
                  const position = start + index + 1;
                  const thisWeek = Math.round((member.weeklyPoints?.[currentWeek] ?? 0) * 100) / 100;
                  
                  return (
                    <TableRow key={member.uid} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <TableCell className="px-4 py-4 text-sm font-medium text-gray-900 dark:text-white">
                        <div className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                          position === 1 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                          position === 2 ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' :
                          position === 3 ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                          'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                        }`}>
                          {position}
                        </div>
                      </TableCell>
                      
                      <TableCell className="px-4 py-4 text-sm font-medium text-gray-900 dark:text-white">
                        {member.teamName}
                      </TableCell>
                      
                      <TableCell className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">
                        {thisWeek}
                      </TableCell>
                      
                      <TableCell className="px-4 py-4 text-sm font-medium text-gray-900 dark:text-white">
                        {Math.round((member.totalSeasonPoints ?? 0) * 100) / 100}
                      </TableCell>
                      
                      <TableCell className="px-4 py-4 text-sm">
                        <button className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                          <InfoIcon className="w-5 h-5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="px-4 py-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex flex-col space-y-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <PaginationWithButton
              totalPages={pages}
              initialPage={page}
              onPageChange={(p) => setPage(p)}
            />
            <div className="text-sm text-gray-500 dark:text-gray-400 text-center sm:text-left">
              Showing {start + 1} to {Math.min(end, total)} of {total} entries
            </div>
          </div>
        </div>
      )}
    </div>
  );
}