import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import toast from 'react-hot-toast';

interface NetworkStatusContextType {
  isOnline: boolean;
  isSlowConnection: boolean;
}

const NetworkStatusContext = createContext<NetworkStatusContextType>({
  isOnline: true,
  isSlowConnection: false,
});

export const useNetworkStatus = () => useContext(NetworkStatusContext);

interface NetworkStatusProviderProps {
  children: ReactNode;
}

export default function NetworkStatusProvider({ children }: NetworkStatusProviderProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSlowConnection, setIsSlowConnection] = useState(false);

  // Add body padding when notifications are shown
  useEffect(() => {
    if (!isOnline || isSlowConnection) {
      document.body.style.paddingTop = '40px'; // Height of notification banner
    } else {
      document.body.style.paddingTop = '0px';
    }
    
    // Cleanup on unmount
    return () => {
      document.body.style.paddingTop = '0px';
    };
  }, [isOnline, isSlowConnection]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Back online! Syncing your changes...', {
        duration: 2000,
        icon: '��',
        position: 'bottom-center',
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      // Don't show toast since we have persistent banner
      // toast.error('You\'re offline. Changes will be saved locally.', {
      //   duration: 4000,
      //   icon: '📱',
      // });
    };

    // Detect slow connections
    const detectSlowConnection = () => {
      if ('connection' in navigator) {
        const connection = (navigator as unknown as { connection: { effectiveType: string; downlink: number; addEventListener: (event: string, handler: () => void) => void; removeEventListener: (event: string, handler: () => void) => void; } }).connection;
        if (connection) {
          const isSlow = connection.effectiveType === 'slow-2g' || 
                        connection.effectiveType === '2g' ||
                        connection.downlink < 1.5;
          setIsSlowConnection(isSlow);
          
          if (isSlow && isOnline) {
            toast('Slow connection detected. Some features may be limited.', {
              duration: 2000,
              icon: '🐌',
              position: 'bottom-center',
            });
          }
        }
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial connection check
    detectSlowConnection();

    // Monitor connection changes
    if ('connection' in navigator) {
      const connection = (navigator as unknown as { connection: { addEventListener: (event: string, handler: () => void) => void; removeEventListener: (event: string, handler: () => void) => void; } }).connection;
      if (connection) {
        connection.addEventListener('change', detectSlowConnection);
      }
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if ('connection' in navigator) {
        const connection = (navigator as unknown as { connection: { removeEventListener: (event: string, handler: () => void) => void; } }).connection;
        if (connection) {
          connection.removeEventListener('change', detectSlowConnection);
        }
      }
    };
  }, [isOnline]);

  return (
    <NetworkStatusContext.Provider value={{ isOnline, isSlowConnection }}>
      {children}
      
      {/* Persistent offline indicator */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 bg-amber-500 text-white text-center py-2 text-sm font-medium z-[999999] shadow-sm">
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            Offline Mode - Changes saved locally
          </div>
        </div>
      )}
      
      {/* Slow connection indicator */}
      {isOnline && isSlowConnection && (
        <div className="fixed top-0 left-0 right-0 bg-orange-500 text-white text-center py-2 text-sm font-medium z-[999999] shadow-sm">
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 bg-white rounded-full animate-bounce" />
            Slow connection detected
          </div>
        </div>
      )}
    </NetworkStatusContext.Provider>
  );
} 