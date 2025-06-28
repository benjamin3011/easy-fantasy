import React from 'react';
import Spinner from './Spinner'; // Assuming Spinner.tsx is in the same directory

interface LoadingOverlayProps {
  text?: string;
  fullScreen?: boolean; // Determines if it covers the full screen or just its container
  spinnerSize?: 'sm' | 'md' | 'lg';
  textColor?: string; // e.g., 'text-gray-700 dark:text-gray-300'
  backgroundColor?: string; // e.g., 'bg-white dark:bg-gray-900'
  opacity?: string; // e.g., 'bg-opacity-75 dark:bg-opacity-75'
  className?: string; // Allow passing additional classes to the overlay div
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  text = 'Loading...',
  fullScreen = true,
  spinnerSize = 'lg',
  textColor = 'text-gray-700 dark:text-gray-300',
  backgroundColor = 'bg-white dark:bg-gray-900',
  opacity = 'bg-opacity-75 dark:bg-opacity-75',
  className = '' // Default to empty string
}) => {
  const baseClasses = 'flex flex-col items-center justify-center';
  const positionClasses = fullScreen ? 'fixed inset-0 z-[90]' : 'absolute inset-0 z-10'; // Lower z-index for non-fullscreen
  
  const overlayClasses = [
    baseClasses,
    positionClasses,
    backgroundColor,
    opacity,
    className, // Add the custom className
  ].join(' ');

  return (
    <div className={overlayClasses}>
      <Spinner size={spinnerSize} />
      {text && <p className={`mt-4 text-xl font-semibold ${textColor}`}>{text}</p>}
    </div>
  );
};

export default LoadingOverlay; 