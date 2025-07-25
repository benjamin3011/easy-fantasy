import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNetworkStatus } from './NetworkStatusProvider';

interface CachedDataIndicatorProps {
  queryKey?: string[];
  className?: string;
}

export default function CachedDataIndicator({ queryKey, className = '' }: CachedDataIndicatorProps) {
  const queryClient = useQueryClient();
  const { isOnline } = useNetworkStatus();
  const [showIndicator, setShowIndicator] = useState(false);

  useEffect(() => {
    if (!queryKey) return;

    const query = queryClient.getQueryState(queryKey);
    const isStale = query?.dataUpdatedAt ? Date.now() - query.dataUpdatedAt > (1000 * 60 * 15) : false; // 15 min stale time
    const hasData = query?.data !== undefined;
    
    // Show indicator if we're offline OR if data is stale but we have cached data
    setShowIndicator(!isOnline || (isStale && hasData));
  }, [queryClient, queryKey, isOnline]);

  if (!showIndicator) return null;

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 ${className}`}>
      <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
      {!isOnline ? (
        <span>Offline - Showing cached data</span>
      ) : (
        <span>Showing cached data</span>
      )}
    </div>
  );
} 