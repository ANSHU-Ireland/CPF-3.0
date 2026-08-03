import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface Props {
  children: ReactNode;
  /** Label shown in the error UI */
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Never log tokens, evidence, or sensitive payloads — only the error name
    console.error(`[${this.props.label ?? 'Application'}] render error:`, error.name, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center" role="alert">
          <div className="h-12 w-12 rounded-full bg-status-danger/10 flex items-center justify-center mb-4">
            <AlertTriangle className="h-6 w-6 text-status-danger" />
          </div>
          <h2 className="text-lg font-semibold text-ink">Something went wrong</h2>
          <p className="text-sm text-ink-secondary mt-2 max-w-md">
            An unexpected error occurred while displaying this page. Try refreshing, or go back to a previous screen.
          </p>
          <div className="flex gap-3 mt-6">
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Refresh page
            </Button>
            <Button variant="ghost" onClick={() => this.setState({ hasError: false, error: null })}>
              Try again
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
