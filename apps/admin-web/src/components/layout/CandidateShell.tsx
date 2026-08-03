import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, HelpCircle, LifeBuoy } from 'lucide-react';

interface CandidateShellProps {
  children: ReactNode;
  /** Step progress rail */
  steps?: Array<{ id: string; label: string; status: 'complete' | 'current' | 'upcoming' }>;
  orgName?: string;
  supportEmail?: string;
  showHeader?: boolean;
}

/**
 * Focused, branded shell for the candidate experience.
 * Deliberately does NOT reuse the dense employer shell.
 * Compact header, support link, step progress, no sidebar.
 */
export function CandidateShell({
  children,
  steps,
  orgName = 'The hiring organisation',
  supportEmail,
  showHeader = true,
}: CandidateShellProps) {
  return (
    <div className="cpf-candidate-root min-h-screen bg-page-bg flex flex-col">
      <a href="#candidate-main" className="cpf-skip-link">Skip to main content</a>

      {showHeader && (
        <header className="bg-surface border-b border-border sticky top-0 z-30">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <span className="font-bold text-ink text-lg">CPF</span>
              <span className="text-ink-secondary text-sm hidden sm:inline">Candidate assessment</span>
            </div>
            <div className="flex items-center gap-1">
              {supportEmail && (
                <a
                  href={`mailto:${supportEmail}`}
                  className="inline-flex items-center gap-1.5 rounded-control px-3 py-2 text-sm text-ink-secondary hover:bg-surface-subtle hover:text-ink min-h-[44px]"
                >
                  <LifeBuoy className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">Get support</span>
                </a>
              )}
              <Link
                to="/help"
                className="inline-flex items-center gap-1.5 rounded-control px-3 py-2 text-sm text-ink-secondary hover:bg-surface-subtle hover:text-ink min-h-[44px]"
              >
                <HelpCircle className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Help</span>
              </Link>
            </div>
          </div>
          {steps && steps.length > 0 && (
            <div className="border-t border-border bg-surface-subtle/50">
              <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3">
                <ol className="flex items-center gap-1 sm:gap-2 overflow-x-auto" aria-label="Assessment progress">
                  {steps.map((step, i) => (
                    <li key={step.id} className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium border-2 ${
                            step.status === 'complete'
                              ? 'bg-status-success text-white border-status-success'
                              : step.status === 'current'
                                ? 'bg-brand text-white border-brand'
                                : 'bg-surface text-ink-secondary border-border'
                          }`}
                          aria-current={step.status === 'current' ? 'step' : undefined}
                        >
                          {step.status === 'complete' ? (
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            i + 1
                          )}
                        </span>
                        <span
                          className={`text-xs sm:text-sm whitespace-nowrap ${
                            step.status === 'current' ? 'font-semibold text-ink' : 'text-ink-secondary'
                          }`}
                        >
                          {step.label}
                        </span>
                      </div>
                      {i < steps.length - 1 && (
                        <span className={`h-0.5 w-3 sm:w-6 ${step.status === 'complete' ? 'bg-status-success' : 'bg-border'}`} aria-hidden />
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </header>
      )}

      <main id="candidate-main" className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8" tabIndex={-1}>
        <div className="animate-fade-in">{children}</div>
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 text-xs text-ink-secondary">
          <p>
            This assessment is run by {orgName} using the CPF platform. Evidence is reviewed by trained people, not automated decisions.
          </p>
        </div>
      </footer>
    </div>
  );
}
