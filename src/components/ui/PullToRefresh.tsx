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
}) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const startY = useRef(0);
  const currentY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrolledToTop = useRef(true);

  const checkScrollTop = useCallback(() => {
    if (containerRef.current) {
      isScrolledToTop.current = containerRef.current.scrollTop <= 0;
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScrollTop);
      return () => container.removeEventListener('scroll', checkScrollTop);
    }
  }, [checkScrollTop]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshing || !isScrolledToTop.current) return;
    
    startY.current = e.touches[0].clientY;
    setIsPulling(true);
  }, [disabled, isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshing || !isPulling || !isScrolledToTop.current) return;

    currentY.current = e.touches[0].clientY;
    const deltaY = currentY.current - startY.current;

    if (deltaY > 0) {
      // Prevent default scroll behavior when pulling down
      e.preventDefault();
      
      // Apply resistance to make pull feel natural
      const distance = Math.min(deltaY / resistance, threshold * 1.5);
      setPullDistance(distance);
    }
  }, [disabled, isRefreshing, isPulling, resistance, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (disabled || isRefreshing || !isPulling) return;

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
  }, [disabled, isRefreshing, isPulling, pullDistance, threshold, onRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

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

  const showIndicator = pullDistance > 10 || isRefreshing;
  const indicatorHeight = Math.max(pullDistance, 40);

  return (
    <div className="relative">
      {/* Pull indicator - stays fixed */}
      {showIndicator && (
        <div 
          className="absolute top-0 left-0 right-0 flex flex-col items-center justify-center z-50"
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
        className={`relative overflow-auto h-full ${className}`}
        style={{
          transform: `translateY(${Math.min(pullDistance, threshold)}px)`,
          transition: isPulling ? 'none' : 'transform 0.3s ease-out',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default PullToRefresh; 