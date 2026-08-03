import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { LoadingState } from '@/components/ui/Feedback';
import type { Role } from '@/lib/types';

interface ProtectedRouteProps {
  allowedRoles: Role[];
  children: ReactNode;
}

export function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingState label="Checking your session…" />;

  if (!session) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }

  if (!allowedRoles.includes(session.role)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center" role="alert">
        <h2 className="text-lg font-semibold text-ink">Access denied</h2>
        <p className="text-sm text-ink-secondary mt-2 max-w-md">
          You don't have permission to view this area. If you believe this is an error, contact your administrator.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
