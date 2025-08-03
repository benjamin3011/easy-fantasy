import React, { useState } from 'react';
import { useLeagueContext } from '../../context/LeagueContext';
import { CalenderIcon } from '../../icons';

interface InlineWeekSelectorProps {
  className?: string;
}

const InlineWeekSelector: React.FC<InlineWeekSelectorProps> = ({ className = "" }) => {
  const { selectedWeek, setSelectedWeek } = useLeagueContext();
  const [isOpen, setIsOpen] = useState(false);

  const weekOptions = Array.from({ length: 18 }, (_, i) => ({
    value: i + 1,
    label: `Week ${i + 1}`,
  }));

  const toggleDropdown = () => setIsOpen(!isOpen);
  const closeDropdown = () => setIsOpen(false);

  const handleWeekSelect = (week: number) => {
    setSelectedWeek(week);
    closeDropdown();
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        onClick={toggleDropdown}
        className="flex items-center font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 cursor-pointer"
      >
        {/* Calendar/Week Icon */}
        <CalenderIcon className="w-3 h-3 mr-1.5 text-gray-500 dark:text-gray-400" />
        <span>Week {selectedWeek}</span>
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
          <div className="absolute left-0 top-full mt-1 z-20 min-w-[120px] max-h-[200px] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
            {weekOptions.map(option => (
              <button
                key={option.value}
                onClick={() => handleWeekSelect(option.value)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg ${
                  selectedWeek === option.value 
                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' 
                    : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default InlineWeekSelector;