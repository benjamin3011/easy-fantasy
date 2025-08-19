import { ReactNode, useEffect, useState } from 'react';

interface MobileTouchOptimizerProps {
  children: ReactNode;
  className?: string;
}

/**
 * Wrapper component that optimizes touch interactions for mobile devices
 * - Adds proper touch targets
 * - Improves button/link spacing
 * - Provides haptic feedback
 * - Optimizes for thumb navigation
 */
export default function MobileTouchOptimizer({ 
  children, 
  className = "" 
}: MobileTouchOptimizerProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = window.innerWidth < 768 || 'ontouchstart' in window;
      setIsMobile(isMobileDevice);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (!isMobile) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div 
      className={`
        mobile-touch-optimized 
        [&_button]:min-h-[44px] [&_a]:min-h-[44px] [&_[role="button"]]:min-h-[44px]
        [&_input]:min-h-[44px] [&_select]:min-h-[44px] [&_textarea]:min-h-[44px]
        [&_*]:touch-manipulation
        ${className}
      `}
      style={{
        // Improve touch responsiveness
        touchAction: 'manipulation',
      }}
    >
      {children}
    </div>
  );
}

/**
 * Hook to add haptic feedback to touch interactions
 */
export function useHapticFeedback() {
  const triggerHaptic = (type: 'light' | 'medium' | 'heavy' = 'light') => {
    if ('vibrate' in navigator) {
      const patterns = {
        light: 5,
        medium: 10,
        heavy: 15
      };
      navigator.vibrate?.(patterns[type]);
    }
  };

  return { triggerHaptic };
}

/**
 * Component for mobile-optimized touch buttons
 */
interface TouchButtonProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
}

export function TouchButton({ 
  children, 
  onClick, 
  className = "",
  variant = 'primary',
  disabled = false 
}: TouchButtonProps) {
  const { triggerHaptic } = useHapticFeedback();

  const handleClick = () => {
    if (!disabled) {
      triggerHaptic('light');
      onClick?.();
    }
  };

  const variantClasses = {
    primary: 'bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700',
    secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-800'
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`
        min-h-[48px] px-4 py-3 rounded-lg font-medium
        transition-all duration-150 ease-out
        touch-manipulation select-none
        ${variantClasses[variant]}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-95 hover:scale-105'}
        focus:ring-2 focus:ring-blue-500/20 focus:outline-none
        ${className}
      `}
    >
      {children}
    </button>
  );
}
