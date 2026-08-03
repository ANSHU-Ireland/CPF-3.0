import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, hasSessionToken, setSessionToken, isApiError } from './api';
import type { AuthSession, Role } from './types';

interface AuthContextValue {
  session: AuthSession | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSessionToken()) {
      setLoading(false);
      return;
    }
    // Verify the stored token is still valid
    api
      .get<AuthSession>('/v1/auth/session')
      .then((s) => setSession(s))
      .catch(() => {
        setSessionToken(null);
        setSession(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const result = await api.post<{ token: string; session: AuthSession }>(
        '/v1/auth/login',
        { email, password },
        { auth: false },
      );
      setSessionToken(result.token);
      setSession(result.session);
    } catch (err) {
      if (isApiError(err)) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred during sign in.');
      }
      throw err;
    }
  }, []);

  const signOut = useCallback(() => {
    setSessionToken(null);
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ session, loading, error, signIn, signOut }),
    [session, loading, error, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Route guard helper — returns allowed roles for a path prefix */
export function rolesForPath(path: string): Role[] {
  if (path.startsWith('/platform')) return ['platform_admin'];
  if (path.startsWith('/reviews/queue') || path.startsWith('/reviews/guidance'))
    return ['reviewer'];
  if (path.startsWith('/org/') || path.startsWith('/candidates') || path.startsWith('/job-profiles') || path.startsWith('/templates'))
    return ['employer_admin', 'reviewer'];
  if (path.startsWith('/candidate')) return ['candidate'];
  return ['platform_admin', 'employer_admin', 'reviewer'];
}
