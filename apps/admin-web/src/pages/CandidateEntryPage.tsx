import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowRight, LifeBuoy } from 'lucide-react';
import { CandidateShell } from '@/components/layout/CandidateShell';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Form';
import { Alert, InlineNotice } from '@/components/ui/Feedback';

export default function CandidateEntryPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  const normaliseInvitationToken = (input: string): string | null => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const fromCandidatePath = (value: string): string | null => {
      const marker = '/candidate/';
      const idx = value.lastIndexOf(marker);
      if (idx === -1) return null;
      const tail = value.slice(idx + marker.length).replace(/^\/+/, '');
      const first = tail.split(/[/?#]/)[0]?.trim();
      return first || null;
    };

    const decoded = (() => {
      try {
        return decodeURIComponent(trimmed);
      } catch {
        return trimmed;
      }
    })();

    if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
      try {
        const parsed = new URL(decoded);
        return fromCandidatePath(parsed.pathname) ?? null;
      } catch {
        // Fall through to path extraction for loosely formatted links.
      }
    }

    return fromCandidatePath(decoded) ?? decoded.split(/[/?#]/)[0] ?? null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedToken = normaliseInvitationToken(token);
    if (!resolvedToken) {
      setError('Please paste your invitation code to continue.');
      return;
    }
    navigate(`/candidate/${encodeURIComponent(resolvedToken)}`);
  };

  return (
    <CandidateShell showHeader={false}>
      <div className="flex flex-col items-center text-center mb-8 pt-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-white mb-4">
          <ShieldCheck className="h-7 w-7" />
        </span>
        <h1 className="text-2xl font-bold text-ink">Welcome to your assessment</h1>
        <p className="text-sm text-ink-secondary mt-2 max-w-md leading-relaxed">
          If you received an invitation link from an organisation, open that link directly.
          Otherwise, paste your invitation code below to begin.
        </p>
      </div>

      <div className="rounded-card border border-border bg-surface p-6 shadow-card">
        {error && (
          <div className="mb-4">
            <Alert tone="danger" title="Please check your code">
              {error}
            </Alert>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField
            label="Invitation code"
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your code here"
            hint="Your code was included in your invitation email or message."
            autoComplete="off"
          />
          <Button type="submit" className="w-full" icon={<ArrowRight className="h-4 w-4" />}>
            Continue
          </Button>
        </form>

        <div className="mt-6">
          <InlineNotice tone="info">
            <LifeBuoy className="h-4 w-4 flex-shrink-0" />
            <span>Lost your link? Contact the organisation that invited you — they can reissue it.</span>
          </InlineNotice>
        </div>
      </div>

      <div className="mt-6 rounded-card bg-surface-subtle p-4">
        <h2 className="text-sm font-semibold text-ink mb-2">What to expect</h2>
        <ul className="text-sm text-ink-secondary space-y-1.5 list-disc pl-5">
          <li>You'll see what the assessment involves before you start</li>
          <li>Your work is saved as you go and you can pause if needed</li>
          <li>A trained person reviews your evidence — no automated hiring decisions</li>
          <li>You can request accommodations or withdraw at any time</li>
        </ul>
      </div>
    </CandidateShell>
  );
}
