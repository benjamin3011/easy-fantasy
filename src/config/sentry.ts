import * as Sentry from "@sentry/react";

// Sentry configuration interface
interface SentryConfig {
  dsn: string;
  environment: string;
  release?: string;
  tracesSampleRate: number;
}

// Get configuration from environment variables
const getSentryConfig = (): SentryConfig => ({
  dsn: import.meta.env.VITE_SENTRY_DSN || '',
  environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE || 'development',
  release: import.meta.env.VITE_SENTRY_RELEASE || `easy-fantasy@${import.meta.env.VITE_APP_VERSION || 'unknown'}`,
  tracesSampleRate: parseFloat(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || '0.1'),
});

// Initialize Sentry
export const initializeSentry = () => {
  const config = getSentryConfig();
  
  // Only initialize if DSN is provided
  if (!config.dsn) {
    console.warn('Sentry DSN not provided. Error monitoring disabled.');
    return;
  }

  try {
    Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      release: config.release,
      tracesSampleRate: config.tracesSampleRate,
      
      // Error filtering and processing
      beforeSend(event, hint) {
        // Filter out non-actionable errors
        const error = hint.originalException;
        
        if (error instanceof Error) {
          // Skip network errors that are likely user connectivity issues
          if (error.message.includes('NetworkError') || 
              error.message.includes('Failed to fetch')) {
            return null;
          }
          
          // Skip chunk loading errors in development
          if (config.environment === 'development' && 
              error.message.includes('Loading chunk')) {
            return null;
          }
          
          // Skip known browser extension errors
          if (error.stack?.includes('extension://') || 
              error.stack?.includes('moz-extension://')) {
            return null;
          }
        }
        
        // Add custom context
        if (event.contexts) {
          event.contexts.app = {
            name: 'Easy Fantasy',
            version: config.release,
            build_time: import.meta.env.VITE_BUILD_TIME,
          };
          
          event.contexts.device = {
            screen_resolution: `${screen.width}x${screen.height}`,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            pixel_ratio: window.devicePixelRatio,
          };
        }
        
        return event;
      },
      
      // Don't send personally identifiable information
      sendDefaultPii: false,
      
      // Custom tags for better organization
      initialScope: {
        tags: {
          component: 'easy-fantasy-web',
          platform: 'web',
        },
      },
    });

    console.log(`Sentry initialized for ${config.environment} environment`);
  } catch (error) {
    console.error('Failed to initialize Sentry:', error);
  }
};

// Custom error boundary integration
export const SentryErrorBoundary = Sentry.withErrorBoundary;

// Breadcrumb utilities
export const addBreadcrumb = (message: string, category: string = 'custom', level: 'info' | 'warning' | 'error' = 'info') => {
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    timestamp: Date.now() / 1000,
  });
};

// User context management
export const setUserContext = (user: {
  id?: string;
  email?: string;
  username?: string;
  [key: string]: string | number | boolean | null | undefined;
}) => {
  Sentry.setUser(user);
};

export const clearUserContext = () => {
  Sentry.setUser(null);
};

// Custom error reporting
export const captureException = (error: Error, context?: Record<string, string | number | boolean>) => {
  if (context) {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([key, value]) => {
        scope.setTag(key, String(value));
      });
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
};

export const captureMessage = (message: string, level: 'info' | 'warning' | 'error' = 'info', context?: Record<string, string | number | boolean>) => {
  if (context) {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([key, value]) => {
        scope.setTag(key, String(value));
      });
      Sentry.captureMessage(message, level);
    });
  } else {
    Sentry.captureMessage(message, level);
  }
};

// Firebase integration helpers
export const trackFirebaseOperation = (operation: string, collection?: string) => {
  addBreadcrumb(
    `Firebase ${operation}${collection ? ` on ${collection}` : ''}`,
    'firebase',
    'info'
  );
};

export const trackUserAction = (action: string, details?: Record<string, string | number | boolean>) => {
  addBreadcrumb(
    `User action: ${action}`,
    'user',
    'info'
  );
  
  if (details) {
    Sentry.withScope((scope) => {
      scope.setTag('user_action', action);
      Object.entries(details).forEach(([key, value]) => {
        scope.setTag(`action_${key}`, String(value));
      });
      Sentry.captureMessage(`User performed action: ${action}`, 'info');
    });
  }
};

// Performance monitoring (basic version)
export const measureAsyncPerformance = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
  const startTime = performance.now();
  addBreadcrumb(`Starting ${name}`, 'performance', 'info');
  
  try {
    const result = await fn();
    const duration = performance.now() - startTime;
    addBreadcrumb(`Completed ${name} in ${duration.toFixed(2)}ms`, 'performance', 'info');
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    addBreadcrumb(`Failed ${name} after ${duration.toFixed(2)}ms`, 'performance', 'error');
    throw error;
  }
};

// Export Sentry for direct access if needed
export { Sentry }; 