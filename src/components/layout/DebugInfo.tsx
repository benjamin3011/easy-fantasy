import React, { useEffect, useState } from 'react';

interface DebugInfo {
  isStandalone: boolean;
  displayMode: string;
  safeAreaBottom: string;
  windowHeight: number;
  screenHeight: number;
  userAgent: string;
}

const DebugInfo: React.FC = () => {
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    const updateDebugInfo = () => {
      // Check if in standalone mode
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                          ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);

      // Get computed safe area
      const computedStyle = getComputedStyle(document.documentElement);
      const safeAreaBottom = computedStyle.getPropertyValue('env(safe-area-inset-bottom)') || 
                           computedStyle.getPropertyValue('--safe-area-inset-bottom') || '0px';

      setDebugInfo({
        isStandalone,
        displayMode: isStandalone ? 'standalone' : 'browser',
        safeAreaBottom,
        windowHeight: window.innerHeight,
        screenHeight: window.screen.height,
        userAgent: navigator.userAgent,
      });
    };

    updateDebugInfo();
    window.addEventListener('resize', updateDebugInfo);
    
    return () => window.removeEventListener('resize', updateDebugInfo);
  }, []);

  // Toggle debug on triple tap
  useEffect(() => {
    let tapCount = 0;
    let tapTimer: NodeJS.Timeout;

    const handleTripleTap = () => {
      tapCount++;
      
      if (tapCount === 1) {
        tapTimer = setTimeout(() => {
          tapCount = 0;
        }, 500);
      } else if (tapCount === 3) {
        clearTimeout(tapTimer);
        tapCount = 0;
        setShowDebug(prev => !prev);
      }
    };

    document.addEventListener('touchstart', handleTripleTap);
    document.addEventListener('click', handleTripleTap);
    
    return () => {
      document.removeEventListener('touchstart', handleTripleTap);
      document.removeEventListener('click', handleTripleTap);
      if (tapTimer) clearTimeout(tapTimer);
    };
  }, []);

  if (!showDebug || !debugInfo) return null;

  return (
    <div className="fixed top-4 right-4 z-[99999] bg-black/80 text-white text-xs p-3 rounded-lg max-w-xs">
      <div className="font-bold mb-2">PWA Debug Info</div>
      <div><strong>Mode:</strong> {debugInfo.displayMode}</div>
      <div><strong>Standalone:</strong> {debugInfo.isStandalone ? 'Yes' : 'No'}</div>
      <div><strong>Safe Area Bottom:</strong> {debugInfo.safeAreaBottom}</div>
      <div><strong>Window Height:</strong> {debugInfo.windowHeight}px</div>
      <div><strong>Screen Height:</strong> {debugInfo.screenHeight}px</div>
      <div><strong>Platform:</strong> {debugInfo.userAgent.includes('iPhone') ? 'iOS' : 
                                    debugInfo.userAgent.includes('Android') ? 'Android' : 'Desktop'}</div>
      <button 
        onClick={() => setShowDebug(false)}
        className="mt-2 bg-red-500 px-2 py-1 rounded text-xs"
      >
        Close
      </button>
    </div>
  );
};

export default DebugInfo; 