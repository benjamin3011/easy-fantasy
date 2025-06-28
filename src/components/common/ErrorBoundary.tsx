import { Component, ErrorInfo, ReactNode } from 'react';
import { captureException, addBreadcrumb } from '../../config/sentry';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  maxRetries?: number;
  showDetails?: boolean;
  level?: 'page' | 'component' | 'critical';
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
  errorId: string;
}

// Error categorization for better UX
enum ErrorCategory {
  NETWORK = 'network',
  CHUNK_LOAD = 'chunk_load',
  PERMISSION = 'permission',
  FIREBASE = 'firebase',
  UNKNOWN = 'unknown'
}

interface ErrorDetails {
  category: ErrorCategory;
  severity: 'low' | 'medium' | 'high' | 'critical';
  userMessage: string;
  actionable: boolean;
  retryable: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryTimeouts: NodeJS.Timeout[] = [];

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      errorId: '',
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    
    // Call optional error callback
    this.props.onError?.(error, errorInfo);
    
    // Log error for monitoring (in production, this would go to error service)
    this.logError(error, errorInfo);
  }

  componentWillUnmount() {
    // Clear any pending retry timeouts
    this.retryTimeouts.forEach(timeout => clearTimeout(timeout));
  }

  private logError = (error: Error, errorInfo: ErrorInfo) => {
    const errorDetails = this.categorizeError(error);
    
    // Add breadcrumb for context
    addBreadcrumb(
      `Error boundary caught ${errorDetails.category} error: ${error.message}`,
      'error',
      'error'
    );
    
    // Send to Sentry with context
    captureException(error, {
      errorId: this.state.errorId,
      category: errorDetails.category,
      severity: errorDetails.severity,
      retryCount: this.state.retryCount,
      componentStack: errorInfo.componentStack || 'unknown',
      level: this.props.level || 'component',
    });

    // Development logging
    if (process.env.NODE_ENV === 'development') {
      console.group(`🚨 Error Boundary Caught Error [${errorDetails.category}]`);
      console.error('Error:', error);
      console.error('Error Info:', errorInfo);
      console.error('Error ID:', this.state.errorId);
      console.groupEnd();
    }
  };

  private categorizeError = (error: Error): ErrorDetails => {
    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || '';

    // Chunk loading errors (code splitting failures)
    if (message.includes('loading chunk') || message.includes('chunkloaderror') || 
        stack.includes('loading css chunk') || message.includes('loading css chunk')) {
      return {
        category: ErrorCategory.CHUNK_LOAD,
        severity: 'medium',
        userMessage: 'The app was updated. Please refresh the page to get the latest version.',
        actionable: true,
        retryable: false, // Refresh is better than retry
      };
    }

    // Network errors
    if (message.includes('network error') || message.includes('fetch') || 
        message.includes('failed to fetch') || message.includes('connection')) {
      return {
        category: ErrorCategory.NETWORK,
        severity: 'medium',
        userMessage: 'Unable to connect to our servers. Please check your internet connection and try again.',
        actionable: true,
        retryable: true,
      };
    }

    // Permission/Auth errors
    if (message.includes('permission denied') || message.includes('unauthorized') || 
        message.includes('auth') || message.includes('forbidden')) {
      return {
        category: ErrorCategory.PERMISSION,
        severity: 'high',
        userMessage: 'You don\'t have permission to access this resource. Please try signing in again.',
        actionable: true,
        retryable: false,
      };
    }

    // Firebase errors
    if (message.includes('firebase') || message.includes('firestore') || 
        stack.includes('firebase') || message.includes('quota exceeded')) {
      return {
        category: ErrorCategory.FIREBASE,
        severity: 'high',
        userMessage: 'There\'s a temporary issue with our database. Please try again in a moment.',
        actionable: true,
        retryable: true,
      };
    }

    // Unknown errors
    return {
      category: ErrorCategory.UNKNOWN,
      severity: 'high',
      userMessage: 'Something unexpected happened. Our team has been notified.',
      actionable: false,
      retryable: true,
    };
  };

  private handleRetry = () => {
    const { maxRetries = 3 } = this.props;
    const { retryCount } = this.state;

    if (retryCount < maxRetries) {
      // Track retry attempt
      addBreadcrumb(
        `User retry attempt ${retryCount + 1}/${maxRetries}`,
        'user',
        'info'
      );

      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: retryCount + 1,
      });
    }
  };

  private handleDelayedRetry = (delay: number = 2000) => {
    const timeout = setTimeout(() => {
      this.handleRetry();
    }, delay);
    this.retryTimeouts.push(timeout);
  };

  private handleReload = () => {
    addBreadcrumb('User triggered page reload', 'user', 'info');
    window.location.reload();
  };

  private handleGoHome = () => {
    addBreadcrumb('User navigated to home', 'user', 'info');
    window.location.href = '/';
  };

  private getErrorIcon = (category: ErrorCategory): ReactNode => {
    const iconClass = "w-16 h-16 mb-4";
    
    switch (category) {
      case ErrorCategory.NETWORK:
        return (
          <svg className={`${iconClass} text-orange-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        );
      case ErrorCategory.CHUNK_LOAD:
        return (
          <svg className={`${iconClass} text-blue-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        );
      case ErrorCategory.PERMISSION:
        return (
          <svg className={`${iconClass} text-red-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        );
      default:
        return (
          <svg className={`${iconClass} text-red-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  render() {
    const { hasError, error, errorInfo, retryCount } = this.state;
    const { children, fallback, maxRetries = 3, showDetails = false, level = 'component' } = this.props;

    if (hasError && error) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback;
      }

      const errorDetails = this.categorizeError(error);
      const canRetry = retryCount < maxRetries && errorDetails.retryable;
      const isChunkError = errorDetails.category === ErrorCategory.CHUNK_LOAD;
      const isNetworkError = errorDetails.category === ErrorCategory.NETWORK;

      // For component-level errors, show a smaller inline error
      if (level === 'component') {
        return (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 my-4">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                  Something went wrong
                </h3>
                <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                  {errorDetails.userMessage}
                </p>
                {canRetry && (
                  <button
                    onClick={this.handleRetry}
                    className="mt-2 text-sm bg-red-100 hover:bg-red-200 dark:bg-red-800 dark:hover:bg-red-700 text-red-800 dark:text-red-200 px-3 py-1 rounded transition-colors"
                  >
                    Try Again {retryCount > 0 && `(${retryCount}/${maxRetries})`}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      }

      // For page-level or critical errors, show full-screen error
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
          <div className="max-w-md w-full text-center">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-lg border border-gray-200 dark:border-gray-700">
              {this.getErrorIcon(errorDetails.category)}
              
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                {isChunkError ? 'App Update Available' : 'Oops! Something went wrong'}
              </h1>
              
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {errorDetails.userMessage}
              </p>

              <div className="space-y-3">
                {/* Primary action */}
                {isChunkError ? (
                  <button
                    onClick={this.handleReload}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                  >
                    Refresh App
                  </button>
                ) : canRetry ? (
                  <button
                    onClick={this.handleRetry}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                  >
                    Try Again {retryCount > 0 && `(${retryCount}/${maxRetries})`}
                  </button>
                ) : null}

                {/* Secondary actions */}
                <div className="flex space-x-3">
                  {isNetworkError && (
                    <button
                      onClick={() => this.handleDelayedRetry(5000)}
                      className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
                    >
                      Retry in 5s
                    </button>
                  )}
                  <button
                    onClick={this.handleGoHome}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
                  >
                    Go Home
                  </button>
                </div>
              </div>

              {/* Error details for debugging */}
              {showDetails && process.env.NODE_ENV === 'development' && (
                <details className="mt-6 text-left">
                  <summary className="text-sm text-gray-500 cursor-pointer">Error Details</summary>
                  <div className="mt-2 p-3 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono text-gray-700 dark:text-gray-300 overflow-auto max-h-32">
                    <div><strong>Message:</strong> {error.message}</div>
                    <div><strong>Category:</strong> {errorDetails.category}</div>
                    <div><strong>Error ID:</strong> {this.state.errorId}</div>
                    {errorInfo && (
                      <div><strong>Component Stack:</strong> {errorInfo.componentStack}</div>
                    )}
                  </div>
                </details>
              )}
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary; 