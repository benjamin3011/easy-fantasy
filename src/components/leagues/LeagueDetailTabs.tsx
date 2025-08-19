import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

interface TabConfig {
  id: string;
  label: string;
  component: React.ReactNode;
  adminOnly?: boolean;
}

interface LeagueDetailTabsProps {
  tabs: TabConfig[];
  className?: string;
}

export default function LeagueDetailTabs({ tabs, className = '' }: LeagueDetailTabsProps) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || '');
  const { user } = useAuth();

  // Filter tabs based on admin status
  const visibleTabs = tabs.filter(tab => !tab.adminOnly || user?.uid);

  const activeTabConfig = visibleTabs.find(tab => tab.id === activeTab) || visibleTabs[0];

  // Update activeTab if current one is not visible
  React.useEffect(() => {
    if (!visibleTabs.find(tab => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0]?.id || '');
    }
  }, [visibleTabs, activeTab]);

  if (!user || tabs.length === 0) {
    return null;
  }

  return (
    <div className={`${className}`}>
      {/* Tab Navigation */}
      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-1 mb-6">
        <div className="flex overflow-x-auto scrollbar-hide">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-shrink-0 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 whitespace-nowrap
                ${activeTab === tab.id
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="animate-in fade-in duration-300">
        {activeTabConfig?.component}
      </div>
    </div>
  );
}