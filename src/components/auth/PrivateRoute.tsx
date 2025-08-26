import React from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { SkeletonPage } from '../ui/skeleton/SkeletonLoader';

export default function PrivateRoute({
  children
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="p-4">
        <SkeletonPage type="dashboard" />
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/signin"
        state={{ from: location }}
        replace
      />
    );
  }

  return <>{children}</>;
}
