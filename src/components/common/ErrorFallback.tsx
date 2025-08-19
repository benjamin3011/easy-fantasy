import React from 'react';

interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

// react-error-boundary uses resetErrorBoundary, but we'll alias it to onRetry
interface ErrorFallbackInternalProps {
  error: Error;
  onRetry: () => void;
}

/**
 * Simple reusable error fallback for query boundaries.
 * Shows the error message in dev and a friendly prompt in prod.
 */
const ErrorFallbackInternal: React.FC<ErrorFallbackInternalProps> = ({ error, onRetry }) => {
  const isDev = import.meta.env.MODE === 'development';

  return (
    <div className="flex flex-col items-center justify-center p-6 text-center space-y-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
      <div className="text-4xl">😵‍💫</div>
      <h3 className="font-semibold text-red-700 dark:text-red-300">Something went wrong</h3>
      {isDev && (
        <pre className="text-xs max-w-full overflow-x-auto text-left text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-800/40 p-2 rounded">
          {error.message}
        </pre>
      )}
      <button
        onClick={onRetry}
        className="inline-flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded shadow"
      >
        🔄 Try again
      </button>
    </div>
  );
};

// Export wrapper that converts react-error-boundary interface to our internal interface
const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, resetErrorBoundary }) => {
  return <ErrorFallbackInternal error={error} onRetry={resetErrorBoundary} />;
};

export default ErrorFallback;
