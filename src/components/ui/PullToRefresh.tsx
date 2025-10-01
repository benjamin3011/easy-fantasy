import React, { useState, useRef, useCallback, useEffect } from 'react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  threshold?: number;
  resistance?: number;
  refreshingText?: string;
  pullText?: string;
  releaseText?: string;
  className?: string;
  disabled?: boolean;
  // Add option to completely disable pull-to-refresh for troubleshooting
  enablePullToRefresh?: boolean;
}

const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  children,
  threshold = 80,
  resistance = 2.5,
  refreshingText = 'Refreshing...',
  pullText = 'Pull to refresh',
  releaseText = 'Release to refresh',
  className = '',
  disabled = false,
  enablePullToRefresh = true,
}) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const startY = useRef(0);
  const currentY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrolledToTop = useRef(true);
  const shouldPreventDefault = useRef(false);
  const initialScrollTop = useRef(0);
  const touchStartTime = useRef(0);

  const checkScrollTop = useCallback(() => {
    if (!enablePullToRefresh || !containerRef.current) return;
    
    const scrollTop = containerRef.current.scrollTop;
    isScrolledToTop.current = scrollTop <= 5; // Increased tolerance to 5px to reduce sensitivity
  }, [enablePullToRefresh]);

  useEffect(() => {
    if (!enablePullToRefresh) return;
    
    const container = containerRef.current;
    if (container) {
      const handleScroll = () => {
        checkScrollTop();
        // Reset pull state if user scrolls down or is not at top
        if (container.scrollTop > 10 && isPulling) {
          setIsPulling(false);
          setPullDistance(0);
          shouldPreventDefault.current = false;
        }
      };
      
      container.addEventListener('scroll', handleScroll, { passive: true });
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [checkScrollTop, isPulling, enablePullToRefresh]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enablePullToRefresh || disabled || isRefreshing) return;
    
    const container = containerRef.current;
    if (!container) return;
    
    // Store touch start time to detect quick swipes
    touchStartTime.current = Date.now();
    
    // Store initial scroll position
    initialScrollTop.current = container.scrollTop;
    isScrolledToTop.current = initialScrollTop.current <= 5; // Increased tolerance
    
    // Only start pull detection if we're truly at the top
    if (isScrolledToTop.current) {
      startY.current = e.touches[0].clientY;
      currentY.current = startY.current;
      shouldPreventDefault.current = false;
    }
  }, [disabled, isRefreshing, enablePullToRefresh]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!enablePullToRefresh || disabled || isRefreshing) return;

    const container = containerRef.current;
    if (!container) return;
    
    currentY.current = e.touches[0].clientY;
    const deltaY = currentY.current - startY.current;
    
    // Detect if this is a quick swipe or scroll gesture (should not trigger pull-to-refresh)
    const touchDuration = Date.now() - touchStartTime.current;
    const isQuickSwipe = touchDuration < 150 && Math.abs(deltaY) > 40; // More tolerant timing, higher distance
    const isScrollingUp = deltaY < 0; // User is scrolling up, not pulling down
    
    // If user is scrolling up or doing a quick swipe, don't trigger pull-to-refresh
    if (isQuickSwipe || isScrollingUp) {
      // Reset pull state for quick swipes or upward scrolls
      if (isPulling) {
        setIsPulling(false);
        setPullDistance(0);
        shouldPreventDefault.current = false;
      }
      return;
    }
    
    // Only handle pull-to-refresh if:
    // 1. We started at the top
    // 2. We're moving downward (deltaY > 0) with sufficient distance
    // 3. We're still at or near the top
    // 4. It's not a quick swipe or scroll gesture
    const currentScrollTop = container.scrollTop;
    const isStillAtTop = currentScrollTop <= 5;
    const hasMinimumPullDistance = deltaY >= 15; // Require at least 15px downward pull
    
    if (isScrolledToTop.current && deltaY > 0 && isStillAtTop && hasMinimumPullDistance) {
      // Only start pulling if we've moved a minimum distance
      if (deltaY > 20) { // Threshold for starting pull state
        if (!isPulling) {
          setIsPulling(true);
        }
        
        // Only prevent default once we're definitely pulling and moving slowly
        if (deltaY > 25 && touchDuration > 150) { // Require slower movement
          shouldPreventDefault.current = true;
          e.preventDefault();
        }
        
        // Apply resistance to make pull feel natural
        const distance = Math.min(deltaY / resistance, threshold * 1.5);
        setPullDistance(distance);
      }
    } else {
      // Reset pull state if conditions aren't met
      if (isPulling) {
        setIsPulling(false);
        setPullDistance(0);
        shouldPreventDefault.current = false;
      }
    }
  }, [disabled, isRefreshing, isPulling, resistance, threshold, enablePullToRefresh]);

  const handleTouchEnd = useCallback(async () => {
    if (!enablePullToRefresh || disabled || isRefreshing) return;

    shouldPreventDefault.current = false;

    if (isPulling) {
      setIsPulling(false);

      if (pullDistance >= threshold) {
        setIsRefreshing(true);
        
        // Add haptic feedback if available
        if (navigator.vibrate) {
          navigator.vibrate(10);
        }

        try {
          await onRefresh();
        } catch (error) {
          console.error('Refresh failed:', error);
        } finally {
          setIsRefreshing(false);
          setPullDistance(0);
        }
      } else {
        // Animate back to 0
        setPullDistance(0);
      }
    }
  }, [disabled, isRefreshing, isPulling, pullDistance, threshold, onRefresh, enablePullToRefresh]);

  useEffect(() => {
    if (!enablePullToRefresh) return;
    
    const container = containerRef.current;
    if (!container) return;

    // Use passive listeners where possible to improve scroll performance
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false }); // Need non-passive for preventDefault
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, enablePullToRefresh]);

  // If pull-to-refresh is disabled, just render the content without pull behavior
  if (!enablePullToRefresh) {
    return (
      <div 
        className={`relative h-full ${className}`}
        style={{
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {children}
      </div>
    );
  }

  const getStatusText = () => {
    if (isRefreshing) return refreshingText;
    if (pullDistance >= threshold) return releaseText;
    return pullText;
  };

  const getIconRotation = () => {
    if (isRefreshing) return '';
    if (pullDistance >= threshold) return 'rotate-180';
    return '';
  };

  const showIndicator = pullDistance > 30 || isRefreshing; // Show indicator sooner for better feedback
  const indicatorHeight = Math.max(pullDistance, 40);

  return (
    <div className="relative">
      {/* Pull indicator - stays fixed */}
      {showIndicator && (
        <div 
          className="absolute top-0 left-0 right-0 flex flex-col items-center justify-center z-50 pointer-events-none"
          style={{
            height: `${indicatorHeight}px`,
            opacity: Math.min(pullDistance / 30, 1),
          }}
        >
          <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
            {isRefreshing ? (
              <div className="animate-spin">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
            ) : (
              <svg 
                className={`w-5 h-5 transition-transform duration-200 ${getIconRotation()}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            )}
            <span className="text-sm font-medium">{getStatusText()}</span>
          </div>
        </div>
      )}

      {/* Content container - moves down when pulled */}
      <div 
        ref={containerRef}
        className={`relative h-full ${className}`}
        style={{
          transform: `translateY(${Math.min(pullDistance, threshold)}px)`,
          transition: isPulling ? 'none' : 'transform 0.3s ease-out',
          WebkitOverflowScrolling: 'touch',
          overflowY: 'auto',
          overflowX: 'hidden',
          // Improve scroll performance
          willChange: isPulling ? 'transform' : 'auto',
          // Ensure smooth scrolling
          scrollBehavior: 'smooth',
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default PullToRefresh; 