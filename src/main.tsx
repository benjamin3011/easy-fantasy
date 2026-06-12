import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import './index.css';
import "swiper/swiper-bundle.css";
import "simplebar-react/dist/simplebar.min.css";
import App from './App.tsx';
import { AppWrapper } from "./components/common/PageMeta.tsx";
import { ThemeProvider } from "./context/ThemeContext.tsx";
import { initializeSentry } from './config/sentry.ts';
import NetworkStatusProvider from './components/common/NetworkStatusProvider';

// Create a client for React Query with offline-friendly settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 15, // 15 minutes - data stays fresh longer
      gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days - keep cached data much longer for offline
      retry: (failureCount: number, error: unknown) => {
        // Don't retry on 4xx errors (client errors)
        if (error instanceof Error && error.message.includes('4')) {
          return false;
        }
        return failureCount < 3;
      },
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

// Register PWA service worker with improved update handling
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        if (import.meta.env.DEV) console.log('Service worker registered successfully');
        
        // Global message listener for skip waiting
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (import.meta.env.DEV) console.log('Received SW message:', event.data);
          if (event.data && event.data.type === 'SKIP_WAITING') {
            // Find all registrations and send skip waiting to any waiting workers
            navigator.serviceWorker.getRegistrations().then(registrations => {
              registrations.forEach(reg => {
                if (reg.waiting) {
                  if (import.meta.env.DEV) console.log('Sending SKIP_WAITING to waiting service worker');
                  reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
              });
            });
          }
        });

        // Check for updates more frequently during active use
        setInterval(() => {
          registration.update().catch(err => {
            console.warn('SW update check failed:', err);
          });
        }, 30000);
        
        // Listen for new service worker
        registration.addEventListener('updatefound', () => {
          if (import.meta.env.DEV) console.log('New service worker found');
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (import.meta.env.DEV) console.log('SW state changed to:', newWorker.state);
              if (newWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  // Check if we recently updated to avoid notification loops
                  const lastUpdate = localStorage.getItem('pwa-last-update');
                  const lastDismiss = localStorage.getItem('pwa-update-dismissed');
                  
                  if (lastUpdate) {
                    const timeSinceUpdate = Date.now() - parseInt(lastUpdate);
                    if (timeSinceUpdate < 120000) { // 2 minutes - increased from 1 minute
                      if (import.meta.env.DEV) console.log('Skipping update notification - recently updated');
                      return;
                    }
                  }
                  
                  if (lastDismiss) {
                    const timeSinceDismiss = Date.now() - parseInt(lastDismiss);
                    if (timeSinceDismiss < 300000) { // 5 minutes
                      if (import.meta.env.DEV) console.log('Skipping update notification - recently dismissed');
                      return;
                    }
                  }
                  
                  // New content is available
                  if (import.meta.env.DEV) console.log('New PWA version available - dispatching event');
                  window.dispatchEvent(new CustomEvent('pwa-update-available'));
                } else {
                  // Content is cached for first time
                  if (import.meta.env.DEV) console.log('PWA content cached for offline use');
                }
              }
            });
          }
        });

        // Listen for controlling service worker changes
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (import.meta.env.DEV) console.log('Service worker controller changed - new SW is now controlling');
        });
              })
        .catch((error) => {
          console.warn('Service worker registration failed:', error);
        });
  });
}

// Initialize Sentry before rendering the app
initializeSentry();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <NetworkStatusProvider>
          <AppWrapper>
            <App />
          </AppWrapper>
        </NetworkStatusProvider>
      </ThemeProvider>
      {/* React Query Devtools - only shows in development */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>,
);
