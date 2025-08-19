import { ReactNode } from 'react';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import ErrorFallback from './ErrorFallback';

interface QueryBoundaryProps {
  children: ReactNode;
}

/**
 * Wraps children with TanStack QueryErrorResetBoundary + react-error-boundary
 * Provides a consistent fallback UI and automatic query reset on retry.
 */
export default function QueryBoundary({ children }: QueryBoundaryProps) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary FallbackComponent={ErrorFallback} onReset={reset}>
          {children}
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
