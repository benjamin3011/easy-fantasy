import { useState, useEffect } from 'react';
import Button from '../ui/button/Button';

const PWAUpdateNotification = () => {
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateStep, setUpdateStep] = useState('');

  useEffect(() => {
    // Check if we just completed an update (look for update timestamp in URL)
    const urlParams = new URLSearchParams(window.location.search);
    const updateTimestamp = urlParams.get('updated');
    
    if (updateTimestamp) {
      // We just updated - store this info and clean the URL
      const updateTime = parseInt(updateTimestamp);
      localStorage.setItem('pwa-last-update', updateTime.toString());
      
      // Clean the URL without causing a reload
      const cleanUrl = window.location.href.split('?')[0];
      window.history.replaceState({}, document.title, cleanUrl);
      
      if (import.meta.env.DEV) console.log('PWA update completed at:', new Date(updateTime).toISOString());
      return; // Don't set up listeners yet
    }

    // Clean up old tracking data (older than 24 hours)
    const cleanupOldData = () => {
      const lastUpdate = localStorage.getItem('pwa-last-update');
      const lastDismiss = localStorage.getItem('pwa-update-dismissed');
      
      if (lastUpdate && Date.now() - parseInt(lastUpdate) > 86400000) { // 24 hours
        localStorage.removeItem('pwa-last-update');
        if (import.meta.env.DEV) console.log('Cleaned up old update tracking data');
      }
      
      if (lastDismiss && Date.now() - parseInt(lastDismiss) > 86400000) { // 24 hours
        localStorage.removeItem('pwa-update-dismissed');
        if (import.meta.env.DEV) console.log('Cleaned up old dismiss tracking data');
      }
    };
    
    cleanupOldData();

    // Listen for custom update events from service worker
    const handleUpdateAvailable = () => {
      // Check if we recently updated (within last 30 seconds)
      const lastUpdate = localStorage.getItem('pwa-last-update');
      if (lastUpdate) {
        const timeSinceUpdate = Date.now() - parseInt(lastUpdate);
        if (timeSinceUpdate < 30000) { // 30 seconds
          if (import.meta.env.DEV) console.log('Ignoring update notification - recently updated');
          return;
        }
      }
      
      if (import.meta.env.DEV) console.log('Showing PWA update notification');
      setShowUpdatePrompt(true);
    };

    window.addEventListener('pwa-update-available', handleUpdateAvailable);
    
    return () => {
      window.removeEventListener('pwa-update-available', handleUpdateAvailable);
    };
  }, []);

  const handleUpdate = async () => {
    setIsUpdating(true);
    
    // Set a timeout to prevent getting stuck
    const updateTimeout = setTimeout(() => {
      console.warn('Update process timed out, forcing reload');
      window.location.reload();
    }, 15000);
    
    try {
      setUpdateStep('Checking service workers...');
      if (import.meta.env.DEV) console.log('Starting PWA update process');
      
      // Step 1: Get all service worker registrations
      const registrations = await navigator.serviceWorker.getRegistrations();
      if (import.meta.env.DEV) console.log('Found registrations:', registrations.length);
      
      if (registrations.length === 0) {
        throw new Error('No service worker registrations found');
      }

      setUpdateStep('Updating service workers...');
      
      // Step 2: Handle service worker updates more carefully
      for (const registration of registrations) {
        if (import.meta.env.DEV) console.log('Updating registration:', registration.scope);
        
        // Force update
        await registration.update();
        
        // Handle waiting service worker
        if (registration.waiting) {
          if (import.meta.env.DEV) console.log('Found waiting service worker, activating...');
          
          // Create a promise that resolves when the service worker activates
          const activationPromise = new Promise<void>((resolve) => {
            const handleControllerChange = () => {
              if (import.meta.env.DEV) console.log('Service worker activated');
              navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
              resolve();
            };
            
            navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
            
            // Fallback timeout for activation
            setTimeout(() => {
              navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
              resolve();
            }, 3000);
          });
          
          // Send skip waiting message
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          
          // Wait for activation or timeout
          await activationPromise;
        }
      }

      setUpdateStep('Clearing caches...');
      
      // Step 3: Clear all caches with timeout protection
      if ('caches' in window) {
        const cacheNames = await Promise.race([
          caches.keys(),
          new Promise<string[]>((_, reject) => 
            setTimeout(() => reject(new Error('Cache listing timeout')), 5000)
          )
        ]);
        
        if (import.meta.env.DEV) console.log('Found caches:', cacheNames);
        
        await Promise.race([
          Promise.all(cacheNames.map(cacheName => caches.delete(cacheName))),
          new Promise<void>((_, reject) => 
            setTimeout(() => reject(new Error('Cache clearing timeout')), 5000)
          )
        ]);
        
        if (import.meta.env.DEV) console.log('Caches cleared');
      }

      setUpdateStep('Clearing storage...');
      
      // Step 4: Clear browser storage (with error handling)
      try {
        // Clear localStorage (but preserve essential user preferences AND update tracking)
        const essentialKeys = [
          'easy-fantasy-theme',
          'easy-fantasy-onboarding-completed',
          'pwa-last-update' // Keep update tracking
        ];
        const currentStorage = { ...localStorage };
        localStorage.clear();
        
        // Restore essential keys
        essentialKeys.forEach(key => {
          if (currentStorage[key]) {
            localStorage.setItem(key, currentStorage[key]);
          }
        });

        // Clear sessionStorage
        sessionStorage.clear();

        // Clear IndexedDB with timeout protection
        if ('indexedDB' in window && indexedDB.databases) {
          const databases = await Promise.race([
            indexedDB.databases(),
            new Promise<IDBDatabaseInfo[]>((_, reject) => 
              setTimeout(() => reject(new Error('IndexedDB listing timeout')), 3000)
            )
          ]);
          
          if (databases.length > 0) {
            await Promise.race([
              Promise.all(
                databases.map(db => {
                  if (db.name) {
                    return new Promise<void>((resolve, reject) => {
                      const deleteRequest = indexedDB.deleteDatabase(db.name!);
                      deleteRequest.onsuccess = () => resolve();
                      deleteRequest.onerror = () => reject(deleteRequest.error);
                      // Timeout for individual DB deletion
                      setTimeout(() => resolve(), 2000);
                    });
                  }
                  return Promise.resolve();
                })
              ),
              new Promise<void>((_, reject) => 
                setTimeout(() => reject(new Error('IndexedDB clearing timeout')), 5000)
              )
            ]);
          }
        }
        
        if (import.meta.env.DEV) console.log('Storage cleared');
      } catch (storageError) {
        console.warn('Storage clearing had issues:', storageError);
        // Continue anyway - not critical
      }

      // Clear the timeout since we're proceeding normally
      clearTimeout(updateTimeout);
      
      setUpdateStep('Finalizing update...');

      // Step 5: Show success message
      const updateToast = document.createElement('div');
      updateToast.innerHTML = `
        <div style="
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: #10B981;
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 10000;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 14px;
          font-weight: 500;
        ">
          ✅ Update complete! Reloading...
        </div>
      `;
      document.body.appendChild(updateToast);

      // Step 6: Wait briefly, then reload
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 7: Force reload with cache busting and update timestamp
      const updateTimestamp = Date.now();
      if (import.meta.env.DEV) console.log('Forcing page reload with update timestamp:', updateTimestamp);
      window.location.href = window.location.href.split('?')[0] + '?updated=' + updateTimestamp;
      
    } catch (error) {
      console.error('Update failed:', error);
      clearTimeout(updateTimeout);
      setIsUpdating(false);
      setUpdateStep('');
      
      // Show specific error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Update error details:', errorMessage);
      
      const errorToast = document.createElement('div');
      errorToast.innerHTML = `
        <div style="
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: #EF4444;
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 10000;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 14px;
          font-weight: 500;
          max-width: 300px;
          text-align: center;
        ">
          ❌ Update failed: ${errorMessage}<br/>
          <button onclick="window.location.reload()" style="
            background: rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.3);
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            margin-top: 8px;
            cursor: pointer;
            font-size: 12px;
          ">Try Manual Refresh</button>
        </div>
      `;
      document.body.appendChild(errorToast);
      
      // Auto-remove error toast after 8 seconds
      setTimeout(() => {
        if (errorToast.parentNode) {
          errorToast.remove();
        }
      }, 8000);
    }
  };

  const handleDismiss = () => {
    setShowUpdatePrompt(false);
    // Also store the dismissal time to prevent immediate re-showing
    localStorage.setItem('pwa-update-dismissed', Date.now().toString());
  };

  if (!showUpdatePrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
              {isUpdating ? (
                <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
              {isUpdating ? 'Updating...' : 'Update Available'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {isUpdating 
                ? (updateStep || 'Installing the latest version. This may take a moment...')
                : 'A new version of Easy Fantasy is available. Update now to get the latest features and improvements.'
              }
            </p>
            {!isUpdating && (
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={handleUpdate}
                  className="text-xs"
                  disabled={isUpdating}
                >
                  Update Now
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDismiss}
                  className="text-xs"
                  disabled={isUpdating}
                >
                  Later
                </Button>
              </div>
            )}
            {isUpdating && (
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.location.reload()}
                  className="text-xs"
                >
                  Force Refresh
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PWAUpdateNotification; 