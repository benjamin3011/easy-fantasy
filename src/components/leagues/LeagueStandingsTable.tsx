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
import { InfoIcon } from "../../icons";
import PaginationWithButton from "../common/PaginationWithButton";
import { calculateCurrentNFLWeek } from "../../utils/nflWeekHelper";
import type { Member } from "../../utils/leagues";

interface Props {
  members: Member[];
}

export default function LeagueStandingsTable({ members }: Props) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const [search, setSearch] = useState("");
  const currentWeek = calculateCurrentNFLWeek();

  const rows = useMemo(
    () =>
      members.map((m) => ({
        uid: m.uid,
        teamName: m.teamName,
        weekly: m.fantasyPoints?.[currentWeek] ?? 0,
        total: m.fantasyPointsTotal,
      })),
    [members, currentWeek]
  );

  const filtered = useMemo(() => {
    return rows
      .filter((r) =>
        r.teamName.toLowerCase().includes(search.toLowerCase())
      );
  }, [rows, search]);

  const total = filtered.length;
  const pages = Math.ceil(total / perPage);
  const start = (page - 1) * perPage;
  const end = start + perPage;

  return (
    <div className="overflow-hidden rounded-xl bg-white dark:bg-white/[0.03]">
      {/* controls */}
      <div className="flex flex-col gap-2 px-4 py-4 border border-b-0 border-gray-100 dark:border-white/[0.05] rounded-t-xl sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
            <span className="text-gray-500 dark:text-gray-400"> Show </span>
            <div className="relative z-20 bg-transparent">
                <select
                    className="w-full py-2 pl-3 pr-8 text-sm text-gray-800 bg-transparent border border-gray-300 rounded-lg appearance-none dark:bg-dark-900 h-9 bg-none shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                    value={perPage}
                    onChange={(e) => {
                    setPerPage(+e.target.value);
                    setPage(1);
                    }}
                >
                    {[5, 10, 20].map((n) => (
                    <option key={n} value={n} className="text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                        {n}
                    </option>
                    ))}
                </select>
                <span className="absolute z-30 text-gray-500 -translate-y-1/2 right-2 top-1/2 dark:text-gray-400">
                <svg
                    className="stroke-current"
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                    d="M3.8335 5.9165L8.00016 10.0832L12.1668 5.9165"
                    stroke=""
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    />
                </svg>
                </span>
            </div>
            <span className="text-gray-500 dark:text-gray-400"> entries </span>
        </div>
        <div className="relative">
          <span className="absolute text-gray-500 -translate-y-1/2 pointer-events-none left-4 top-1/2 dark:text-gray-400">
            <svg
              className="fill-current"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M3.04199 9.37363C3.04199 5.87693 5.87735 3.04199 9.37533 3.04199C12.8733 3.04199 15.7087 5.87693 15.7087 9.37363C15.7087 12.8703 12.8733 15.7053 9.37533 15.7053C5.87735 15.7053 3.04199 12.8703 3.04199 9.37363ZM9.37533 1.54199C5.04926 1.54199 1.54199 5.04817 1.54199 9.37363C1.54199 13.6991 5.04926 17.2053 9.37533 17.2053C11.2676 17.2053 13.0032 16.5344 14.3572 15.4176L17.1773 18.238C17.4702 18.5309 17.945 18.5309 18.2379 18.238C18.5308 17.9451 18.5309 17.4703 18.238 17.1773L15.4182 14.3573C16.5367 13.0033 17.2087 11.2669 17.2087 9.37363C17.2087 5.04817 13.7014 1.54199 9.37533 1.54199Z"
                fill=""
              />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Search team…"
            className="dark:bg-dark-900 h-11 w-full rounded-lg border border-gray-300 bg-transparent py-2.5 pl-11 pr-4 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 xl:w-[300px]"
            value={search}
            onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
            }}
            />
        </div>
        
      </div>

      {/* table */}
      <div className="max-w-full overflow-x-auto custom-scrollbar">
        <div>
        <Table>
          <TableHeader className="border-t border-gray-100 dark:border-white/[0.05]">
            <TableRow>
            <TableCell
                isHeader
                className="min-w-[40px] px-4 py-3 border border-gray-100 dark:border-white/[0.05]" 
              >
                <div className="flex items-center justify-between cursor-pointer">
                      <p className="font-medium text-gray-700 text-theme-xs dark:text-gray-400">
                      #
                      </p>
                    </div>
              </TableCell>
              <TableCell
                isHeader
                className="min-w-[250px] px-4 py-3 border border-gray-100 dark:border-white/[0.05]" 
              >
                <div className="flex items-center justify-between cursor-pointer">
                      <p className="font-medium text-gray-700 text-theme-xs dark:text-gray-400">
                      Team
                      </p>
                      
                    </div>
              </TableCell>
              <TableCell
                isHeader
                className="min-w-[120px] px-4 py-3 border border-gray-100 dark:border-white/[0.05]" 
              >
                <div className="flex items-center justify-between cursor-pointer">
                      <p className="font-medium text-gray-700 text-theme-xs dark:text-gray-400">
                      Week {currentWeek}
                      </p>
                    </div>
              </TableCell>
              <TableCell
                isHeader
                className="min-w-[120px] px-4 py-3 border border-gray-100 dark:border-white/[0.05]" 
              >
                <div className="flex items-center justify-between cursor-pointer">
                      <p className="font-medium text-gray-700 text-theme-xs dark:text-gray-400">
                      Total
                      </p>
                    </div>
              </TableCell>
              <TableCell
                isHeader
                className="min-w-[120px] px-4 py-3 border border-gray-100 dark:border-white/[0.05]" 
              >
                <div className="flex items-center justify-between cursor-pointer">
                      <p className="font-medium text-gray-700 text-theme-xs dark:text-gray-400">
                      Actions
                      </p>
                    </div>
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {members
                // sort by total descending
                .slice()
                .sort((a, b) =>
                  (b.fantasyPointsTotal || 0) - (a.fantasyPointsTotal || 0)
                )
                .map((m, idx) => {
                  const thisWeek = m.fantasyPoints?.[currentWeek] ?? 0;
                  return (
                    <TableRow key={m.uid}>
                      <TableCell className="px-4 py-4 font-medium text-gray-800 border border-gray-100 dark:border-white/[0.05] dark:text-white text-theme-sm whitespace-nowrap ">{idx + 1}</TableCell>
                      
                      <TableCell className="px-4 py-4 font-medium text-gray-800 border border-gray-100 dark:border-white/[0.05] dark:text-white text-theme-sm whitespace-nowrap ">{m.teamName}</TableCell>
                      <TableCell className="px-4 py-4 font-medium text-gray-800 border border-gray-100 dark:border-white/[0.05] dark:text-white text-theme-sm whitespace-nowrap ">
                        {thisWeek}
                      </TableCell>
                      <TableCell className="px-4 py-4 font-medium text-gray-800 border border-gray-100 dark:border-white/[0.05] dark:text-white text-theme-sm whitespace-nowrap ">
                        {m.fantasyPointsTotal ?? 0}
                      </TableCell>
                      <TableCell className="px-4 py-4 font-medium text-gray-800 border border-gray-100 dark:border-white/[0.05] dark:text-white text-theme-sm whitespace-nowrap ">
                        <button>
                            <InfoIcon className="text-gray-700 cursor-pointer size-5 hover:text-error-500 dark:text-gray-400 dark:hover:text-error-500" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          
        </Table>
        </div>
      </div>

      {/* pagination */}
      <div className="border border-t-0 rounded-b-xl border-gray-100 py-4 pl-[18px] pr-4 dark:border-white/[0.05]">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between">
          {/* Left side: Showing entries */}

          <PaginationWithButton
            totalPages={pages}
            initialPage={page}
            onPageChange={(p) => setPage(p)}
            />
          <div className="pt-3 xl:pt-0">
            <p className="pt-3 text-sm font-medium text-center text-gray-500 border-t border-gray-100 dark:border-gray-800 dark:text-gray-400 xl:border-t-0 xl:pt-0 xl:text-left">
            Showing {start + 1} to {Math.min(end, total)} of {total} entries
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}