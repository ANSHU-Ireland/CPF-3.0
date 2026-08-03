import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ShieldCheck, LogIn } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Form';
import { Alert } from '@/components/ui/Feedback';
import { isApiError } from '@/lib/api';

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      const returnTo = params.get('returnTo');
      navigate(returnTo ?? '/platform');
    } catch (err) {
      if (isApiError(err)) setError(err.message);
      else setError('Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-page-bg flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-white mb-4">
              <ShieldCheck className="h-7 w-7" />
            </span>
            <h1 className="text-2xl font-bold text-ink">Sign in to CPF</h1>
            <p className="text-sm text-ink-secondary mt-1.5 text-center">
              Evidence-led assessment and human-review platform
            </p>
          </div>

          {error && (
            <div className="mb-4">
              <Alert tone="danger" title="Sign in failed">
                {error}
              </Alert>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <TextField
              label="Email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@organisation.ie"
            />
            <TextField
              label="Password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" loading={loading} className="w-full" icon={!loading ? <LogIn className="h-4 w-4" /> : undefined}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-border space-y-3">
            <Link
              to="/candidate"
              className="block text-center text-sm text-brand hover:text-brand-hover hover:underline"
            >
              I'm a candidate with an invitation link
            </Link>
            <p className="text-center text-xs text-ink-secondary">
              Need help? Contact your organisation administrator.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
