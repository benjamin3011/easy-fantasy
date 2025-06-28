import React, { useState } from 'react';
import UsageStrategyKPI from '../dashboard/UsageStrategyKPI';
import CaptainStrategyKPI from '../dashboard/CaptainStrategyKPI';
import SmartLineupAssistance from '../dashboard/SmartLineupAssistance';

interface StrategyPanelProps {
  userId?: string;
  leagueId?: string;
  currentWeek?: number;
  currentSeason?: number;
  isOpen: boolean;
  onClose: () => void;
}

const StrategyPanel: React.FC<StrategyPanelProps> = ({
  userId,
  leagueId,
  currentWeek,
  currentSeason,
  isOpen,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'usage' | 'captain' | 'smart'>('usage');

  const tabs = [
    { id: 'usage', label: 'Usage', icon: '📊' },
    { id: 'captain', label: 'Captain', icon: '👑' },
    { id: 'smart', label: 'Assistant', icon: '🤖' }
  ];

  // Mobile-first backdrop classes - Higher z-index than app header (z-99999)
  const backdropClasses = [
    'fixed inset-0 z-[999999] bg-black/60 backdrop-blur-sm',
    'transition-opacity duration-300 ease-in-out',
    isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
  ].join(' ');

  // Mobile-first panel classes
  const panelClasses = [
    // Mobile: full screen
    'fixed inset-0 z-[9999999] bg-white dark:bg-gray-900',
    // Desktop: right side drawer
    'md:inset-auto md:right-0 md:top-0 md:h-full md:w-96 md:max-w-md',
    'md:rounded-l-lg md:border-l md:border-gray-200 md:dark:border-gray-700',
    'transform transition-transform duration-300 ease-in-out',
    isOpen ? 'translate-x-0' : 'translate-x-full'
  ].join(' ');

  return (
    <>
      {/* Backdrop - only show when open */}
      {isOpen && <div className={backdropClasses} onClick={onClose} />}
      
             {/* Panel - always in DOM for animation, but positioned off-screen when closed */}
       <div className={panelClasses}>
         {isOpen && (
           <div className="flex flex-col h-full">
             {/* Panel Header */}
             <div className="flex-shrink-0 p-4 md:p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
               <div className="flex items-center justify-between mb-3">
                 <h3 className="text-lg md:text-base font-semibold text-gray-800 dark:text-white">
                   Strategy Insights
                 </h3>
                 <button
                   onClick={onClose}
                   className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                   aria-label="Close strategy panel"
                 >
                   <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                   </svg>
                 </button>
               </div>

               {/* Tab Navigation */}
               <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                 {tabs.map((tab) => (
                   <button
                     key={tab.id}
                     onClick={() => setActiveTab(tab.id as 'usage' | 'captain' | 'smart')}
                     className={`
                       flex-1 flex items-center justify-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors
                       ${activeTab === tab.id
                         ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                         : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                       }
                     `}
                   >
                     <span className="text-xs">{tab.icon}</span>
                     <span>{tab.label}</span>
                   </button>
                 ))}
               </div>
             </div>

             {/* Content Area */}
             <div className="flex-1 overflow-hidden">
               <div className="h-full overflow-y-auto">
                 <div className="p-4 md:p-3 space-y-3 md:space-y-2">
                   {activeTab === 'usage' && (
                     <div className="space-y-4">
                       <UsageStrategyKPI
                         userId={userId}
                         leagueId={leagueId}
                         className="border-0 shadow-none bg-transparent p-0"
                       />
                       <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                         💡 Track your 5-pick usage limit to avoid burning out your best players early in the season.
                       </div>
                     </div>
                   )}

                   {activeTab === 'captain' && (
                     <div className="space-y-4">
                       <CaptainStrategyKPI
                         userId={userId}
                         leagueId={leagueId}
                         currentWeek={currentWeek}
                         className="border-0 shadow-none bg-transparent p-0"
                       />
                       <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                         👑 Captain picks get point multipliers. Choose wisely based on your success patterns.
                       </div>
                     </div>
                   )}

                   {activeTab === 'smart' && (
                     <div className="space-y-4">
                       <SmartLineupAssistance
                         userId={userId}
                         leagueId={leagueId}
                         currentWeek={currentWeek}
                         currentSeason={currentSeason}
                         className="border-0 shadow-none bg-transparent p-0"
                       />
                       <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                         🤖 AI-powered recommendations based on your lineup status and usage patterns.
                       </div>
                     </div>
                   )}
                 </div>
                 
                 {/* Bottom padding for mobile safe area */}
                 <div className="h-8 md:h-4"></div>
               </div>
             </div>
           </div>
         )}
       </div>
     </>
   );
 };

 export default StrategyPanel; 