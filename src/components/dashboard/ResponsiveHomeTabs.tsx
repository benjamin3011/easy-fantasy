import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

// Tab content components (these will be passed as props)
interface TabConfig {
  id: string;
  label: string;
  component: React.ReactNode;
}

interface ResponsiveHomeTabsProps {
  tabs: TabConfig[];
  className?: string;
}

export default function ResponsiveHomeTabs({ tabs, className = '' }: ResponsiveHomeTabsProps) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || '');
  const { user } = useAuth();

  if (!user || tabs.length === 0) {
    return null;
  }

  const activeTabConfig = tabs.find(tab => tab.id === activeTab) || tabs[0];

  return (
    <div className={`${className}`}>
      {/* Tab Navigation */}
      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-1 mb-6">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-1 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200
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
        {activeTabConfig.component}
      </div>
    </div>
  );
} 