// src/components/dashboard/OverallLineupStatusKPI.tsx
import React from 'react';
// import ComponentCard from '../common/ComponentCard'; // Keep if you prefer ComponentCard wrapper
import Spinner from '../ui/Spinner';
import { CheckCircleIcon, InfoIcon } from '../../icons'; // Changed ExclamationTriangleIcon to InfoIcon

interface OverallLineupStatusKPIProps {
  lineupsSet: number;
  totalLeagues: number;
  currentNflWeek: number;
  isLoading: boolean;
}

const OverallLineupStatusKPI: React.FC<OverallLineupStatusKPIProps> = ({
  lineupsSet,
  totalLeagues,
  currentNflWeek,
  isLoading,
}) => {
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center p-4">
          <Spinner size="sm" />
          <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Checking lineup status...</span>
        </div>
      );
    }

    if (totalLeagues === 0) {
      return <p className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">No active leagues.</p>;
    }

    const allSet = lineupsSet === totalLeagues;
    const statusText = `${lineupsSet} / ${totalLeagues} Lineups Set for Week ${currentNflWeek}`;
    const iconColor = allSet ? 'text-green-500' : 'text-yellow-500'; // Using yellow for pending, could be red for more urgency
    const IconComponent = allSet ? CheckCircleIcon : InfoIcon; // Changed to InfoIcon

    return (
      <div className="p-4 text-center">
        <div className={`flex items-center justify-center ${iconColor}`}>
          <IconComponent className="mr-2 size-6" />
          <p className="text-md font-semibold text-gray-800 dark:text-white">
            {statusText}
          </p>
        </div>
        {!allSet && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {totalLeagues - lineupsSet} lineup(s) need attention.
          </p>
        )}
        {/* Optional: Add a button here if !allSet to navigate to leagues/lineups page */}
      </div>
    );
  };

  return (
    // Using a more compact style directly without ComponentCard for a KPI feel, 
    // or you can wrap this in ComponentCard if you prefer that consistent container.
    <div className="bg-white dark:bg-dark-800 shadow-md rounded-lg">
      {renderContent()}
    </div>
    // Example with ComponentCard:
    // <ComponentCard title="Weekly Lineup Status">
    //   {renderContent()}
    // </ComponentCard>
  );
};

export default OverallLineupStatusKPI; 