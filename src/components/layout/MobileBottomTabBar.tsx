import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { GridIcon, BoltIcon, ListIcon, UserCircleIcon } from '../../icons';
import { useSidebar } from '../../context/SidebarContext';

interface TabItem {
  name: string;
  path: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const tabItems: TabItem[] = [
  {
    name: 'Home',
    path: '/',
    icon: <GridIcon />,
  },
  {
    name: 'Leagues',
    path: '/leagues',
    icon: <ListIcon />,
  },
  {
    name: 'Lineup',
    path: '/lineup',
    icon: <BoltIcon />,
  },
  {
    name: 'Tips',
    path: '/tips',
    icon: <BoltIcon />, // We'll change this icon later
  },
  {
    name: 'Profile',
    path: '/profile',
    icon: <UserCircleIcon />,
  },
];

const MobileBottomTabBar: React.FC = () => {
  const location = useLocation();
  const { isAdmin } = useAuth();
  const { isMobileOpen } = useSidebar();
  const [safeAreaBottom, setSafeAreaBottom] = useState(0);
  const [prefetchedRoutes, setPrefetchedRoutes] = useState<Set<string>>(new Set());

  // Detect iPhone models and safe area
  useEffect(() => {
    const detectSafeArea = () => {
      const userAgent = navigator.userAgent;
      const isIPhone = /iPhone/.test(userAgent);
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      
      if (isIPhone && isStandalone) {
        // iPhone models with home indicator (need extra padding)
        const screenHeight = window.screen.height;
        
        // iPhone models with home indicators
        if (screenHeight >= 812) { // iPhone X and newer
          setSafeAreaBottom(34); // Home indicator space
        } else {
          setSafeAreaBottom(0); // Older iPhones with home button
        }
      } else {
        setSafeAreaBottom(0);
      }
    };

    detectSafeArea();
    window.addEventListener('resize', detectSafeArea);
    
    return () => window.removeEventListener('resize', detectSafeArea);
  }, []);

  // Prefetch route on hover/focus
  const handleRoutePreload = (path: string) => {
    if (!prefetchedRoutes.has(path)) {
      // Use dynamic import to prefetch the route component
      switch (path) {
        case '/':
          import('../../pages/HomePage');
          break;
        case '/lineup':
          import('../../pages/LineupPage');
          break;
        case '/tips':
          import('../../pages/TipsPage');
          break;
        case '/leagues':
          import('../../pages/LeaguesPage');
          break;
        case '/gamecenter':
          // GameCenter route - check if this exists or use correct path
          break;
      }
      setPrefetchedRoutes(prev => new Set([...prev, path]));
    }
  };

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  // Filter items based on admin status
  const visibleTabs = tabItems.filter(item => !item.adminOnly || isAdmin);

  // Don't render on desktop or when mobile sidebar is open
  if (window.innerWidth >= 768 || isMobileOpen) {
    return null;
  }

  return (
    <>
      {/* Bottom Tab Bar */}
      <div 
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg border-t border-gray-200/60 dark:border-gray-700/60"
        style={{ paddingBottom: `env(safe-area-inset-bottom)` }}
      >
        
        {/* Tab content */}
        <div className="relative flex items-center justify-around px-2 py-2 h-14">
          {visibleTabs.map((tab) => {
            const active = isActive(tab.path);
            return (
              <Link
                key={tab.path}
                to={tab.path}
                onClick={() => {
                  if (!active && 'vibrate' in navigator) {
                    navigator.vibrate?.(10);
                  }
                }}
                onMouseEnter={() => handleRoutePreload(tab.path)}
                onFocus={() => handleRoutePreload(tab.path)}
                className={`
                  flex flex-col items-center justify-center
                  min-w-0 flex-1 px-1 py-2
                  transition-all duration-200 ease-out
                  ${active ? 'transform scale-110' : 'transform scale-100'}
                  active:scale-95
                `}
              >
                {/* Icon container with iOS-style background */}
                <div className={`
                  flex items-center justify-center
                  w-11 h-11 rounded-lg p-2
                  transition-all duration-200 ease-out
                  ${active 
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' 
                    : 'text-gray-500 dark:text-gray-400'
                  }
                `}>
                  <div className="w-full h-full flex items-center justify-center [&>svg]:w-full [&>svg]:h-full">
                    {tab.icon}
                  </div>
                </div>
                
                {/* Label - Hidden on mobile for cleaner look like NFL app */}
                <span className={`
                  hidden text-xs font-medium mt-1
                  transition-all duration-200 ease-out
                  ${active 
                    ? 'text-blue-500 dark:text-blue-400' 
                    : 'text-gray-500 dark:text-gray-400'
                  }
                `}>
                  {tab.name}
                </span>
                
                {/* Active indicator dot */}
                {active && (
                  <div className="absolute -top-1 w-1 h-1 bg-blue-500 rounded-full"></div>
                )}
              </Link>
            );
          })}
        </div>
      </div>
      
      {/* Bottom padding spacer for content */}
      <div 
        className="md:hidden"
        style={{ height: `${56 + Math.max(safeAreaBottom, 8)}px` }}
      ></div>
    </>
  );
};

export default MobileBottomTabBar; 