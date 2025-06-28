// src/components/dashboard/MyLeaguesOverview.tsx
import React from 'react';
import { Link } from 'react-router';
import type { League, Member } from '../../utils/leagues';
import ComponentCard from '../common/ComponentCard';
import Spinner from '../ui/Spinner'; // For loading state
import Button from '../ui/button/Button'; // For "View League" button

interface MyLeaguesOverviewProps {
  leagues: League[];
  currentUserId: string | undefined;
  isLoadingLeagues: boolean;
}

const MyLeaguesOverview: React.FC<MyLeaguesOverviewProps> = ({
  leagues,
  currentUserId,
  isLoadingLeagues,
}) => {
  if (isLoadingLeagues) {
    return (
      <ComponentCard title="My Leagues Overview">
        <div className="flex items-center justify-center p-4">
          <Spinner size="md" />
          <span className="ml-2">Loading leagues...</span>
        </div>
      </ComponentCard>
    );
  }

  if (!currentUserId) {
    return (
      <ComponentCard title="My Leagues">
        <p className="p-4 text-center text-gray-500">Loading user data...</p>
      </ComponentCard>
    );
  }

  if (!leagues || leagues.length === 0) {
    return (
      <ComponentCard title="My Leagues">
        <div className="p-4 text-center">
          <p className="text-gray-500 dark:text-gray-400">You haven't joined any leagues yet.</p>
          <div className="mt-4">
            <Link to="/leagues">
              <Button variant="primary" size="sm">
                Explore Leagues
              </Button>
            </Link>
          </div>
        </div>
      </ComponentCard>
    );
  }

  return (
    <ComponentCard title="My Leagues">
      <div className="divide-y divide-gray-100 dark:divide-white/[0.05]">
        {leagues.map((league) => {
          const userMemberData: Member | undefined = league.members.find(
            (member: Member) => member.uid === currentUserId
          );

          if (!userMemberData) {
            // This case should ideally not happen if data is consistent
            // or could mean the user was removed from the league but still has it in their list.
            return (
              <div key={league.id} className="p-4 hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors duration-150">
                <p className="font-semibold text-gray-800 dark:text-white">{league.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Your data not found in this league.
                </p>
              </div>
            );
          }

          // Calculate Rank
          const sortedMembers: Member[] = [...league.members].sort(
            (a: Member, b: Member) => (b.totalSeasonPoints ?? 0) - (a.totalSeasonPoints ?? 0)
          );
          const rank =
            sortedMembers.findIndex(
              (member: Member) => member.uid === currentUserId
            ) + 1;

          return (
            <div key={league.id} className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                {/* Left Side: League and Team Name */}
                <div className="flex-1 mb-2 sm:mb-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">
                    {league.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {userMemberData.teamName}
                  </p>
                </div>

                {/* Right Side: Rank and Points */}
                <div className="flex-shrink-0 space-y-1 sm:space-y-0 sm:space-x-6 sm:flex sm:items-center text-sm text-right sm:text-left">
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">Rank</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {rank} / {league.members.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">Points</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {userMemberData.totalSeasonPoints ?? 0}
                    </p>
                  </div>
                </div>
                
                {/* Action Button - Aligned to the far right on larger screens */}
                <div className="mt-3 sm:mt-0 sm:ml-6 flex-shrink-0">
                    <Link to={`/leagues/${league.id}`}>
                      <svg width="20" height="20" viewBox="0 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg" transform="rotate(0 0 0)">
                        <path d="M11.5781 2.5C10.3355 2.5 9.32812 3.50736 9.32812 4.75V6.6285C9.44877 6.70925 9.56333 6.80292 9.66985 6.90952L10.8281 8.06853V4.75C10.8281 4.33579 11.1639 4 11.5781 4H17.5781C17.9923 4 18.3281 4.33579 18.3281 4.75V20.25C18.3281 20.6642 17.9923 21 17.5781 21H11.5781C11.1639 21 10.8281 20.6642 10.8281 20.25V16.9314L9.6699 18.0904C9.56336 18.197 9.44879 18.2907 9.32812 18.3715V20.25C9.32812 21.4926 10.3355 22.5 11.5781 22.5H17.5781C18.8208 22.5 19.8281 21.4926 19.8281 20.25V4.75C19.8281 3.50736 18.8208 2.5 17.5781 2.5H11.5781Z" fill="currentColor"/>
                        <path d="M7.54784 15.9699L10.2658 13.25L4.32813 13.25C3.91391 13.25 3.57812 12.9142 3.57812 12.5C3.57812 12.0858 3.91391 11.75 4.32812 11.75L10.266 11.75L7.54786 9.03016C7.25506 8.73718 7.25521 8.2623 7.54819 7.9695C7.84118 7.6767 8.31605 7.67685 8.60885 7.96984L12.5724 11.9359C12.7291 12.0733 12.8281 12.2751 12.8281 12.5C12.8281 12.7259 12.7283 12.9284 12.5703 13.0659L8.60887 17.0301C8.31608 17.3231 7.84121 17.3233 7.54821 17.0305C7.25521 16.7377 7.25505 16.2629 7.54784 15.9699Z" fill="currentColor"/>
                      </svg>
                    </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ComponentCard>
  );
};

export default MyLeaguesOverview; 