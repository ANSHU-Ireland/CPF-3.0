import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-page-bg flex flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl font-bold text-brand mb-4">404</p>
      <h1 className="text-xl font-semibold text-ink mb-2">Page not found</h1>
      <p className="text-sm text-ink-secondary max-w-sm mb-6">
        The page you're looking for doesn't exist or may have moved.
      </p>
      <Button variant="secondary">
        <Link to="/">Go to sign in</Link>
      </Button>
    </div>
  );
}
