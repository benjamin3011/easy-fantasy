import React, { useState } from 'react';
import { useLeagueContext } from '../../context/LeagueContext';
import { ListIcon } from '../../icons';

interface InlineLeagueSelectorProps {
  className?: string;
}

const InlineLeagueSelector: React.FC<InlineLeagueSelectorProps> = ({ className = "" }) => {
  const { leagues, selectedLeague, setSelectedLeagueId, leaguesLoading } = useLeagueContext();
  const [isOpen, setIsOpen] = useState(false);

  if (leaguesLoading) {
    return <span className={`text-gray-500 ${className}`}>Loading...</span>;
  }

  if (leagues.length <= 1) {
    // If only one league, just show as text with icon
    return (
      <span className={`flex items-center font-medium text-gray-600 dark:text-gray-300 ${className}`}>
        <ListIcon className="w-3 h-3 mr-1.5 text-gray-500 dark:text-gray-400" />
        {selectedLeague?.name || 'No League'}
      </span>
    );
  }

  const toggleDropdown = () => setIsOpen(!isOpen);
  const closeDropdown = () => setIsOpen(false);

  const handleLeagueSelect = (leagueId: string) => {
    setSelectedLeagueId(leagueId);
    closeDropdown();
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        onClick={toggleDropdown}
        className="flex items-center font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 cursor-pointer"
      >
        {/* League Icon */}
        <ListIcon className="w-3 h-3 mr-1.5 text-gray-500 dark:text-gray-400" />
        <span>{selectedLeague?.name || 'Select League'}</span>
        <svg
          className={`ml-1.5 stroke-gray-500 dark:stroke-gray-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          width="16"
          height="16"
          viewBox="0 0 18 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4.3125 8.65625L9 13.3437L13.6875 8.65625"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={closeDropdown}
          />
          
          {/* Dropdown */}
          <div className="absolute left-0 top-full mt-1 z-20 min-w-[200px] rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
            {leagues.map(league => (
              <button
                key={league.id}
                onClick={() => handleLeagueSelect(league.id)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg ${
                  selectedLeague?.id === league.id 
                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' 
                    : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                {league.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default InlineLeagueSelector;