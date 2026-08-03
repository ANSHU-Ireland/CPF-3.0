import { useParams } from 'react-router-dom';
import { AlertTriangle, Download, Printer, ScrollText, ShieldAlert } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge, LoadingState, ErrorState, Alert } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { employerNav } from '@/lib/routes';
import { api } from '@/lib/api';
import { useAsyncData } from '@/lib/useAsyncData';
import type { EvidenceProfile } from '@/lib/types';

export default function EvidenceProfilePage() {
  const { orgId, sessionId } = useParams<{ orgId: string; sessionId: string }>();
  const { status, data, error, refetch } = useAsyncData<EvidenceProfile>(
    (_signal) => api.get(`/v1/orgs/${orgId}/sessions/${sessionId}/profile`),
    { deps: [orgId, sessionId] },
  );

  return (
    <AppShell navGroups={employerNav(orgId ?? '')} maxWidth="reading">
      <PageHeader
        title="Evidence Profile"
        description="A summary of reviewed evidence against the assessment criteria. This is not an employment decision."
        breadcrumbs={[
          { label: 'Home', to: `/org/${orgId}` },
          { label: 'Pipeline', to: `/org/${orgId}/sessions` },
          { label: 'Evidence Profile' },
        ]}
        status={<StatusBadge tone="info" dot>Version {data?.version ?? '—'}</StatusBadge>}
        actions={
          <>
            <Button variant="secondary" icon={<Printer className="h-4 w-4" />}>Print</Button>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />}>Export</Button>
          </>
        }
      />

      {/* Permanent not-an-employment-decision notice */}
      <div className="mb-6">
        <Alert tone="warning" title="This is not an employment decision">
          An Evidence Profile summarises reviewed evidence against published criteria. It does not constitute a hiring, rejection, or pass/fail verdict. All employment decisions are made by people, outside this platform.
        </Alert>
      </div>

      {status === 'loading' && <LoadingState label="Loading evidence profile…" />}
      {status === 'error' && <ErrorState error={error} onRetry={refetch} />}
      {status === 'success' && (
        <div className="space-y-6">
          {/* Context */}
          <div className="rounded-card border border-border bg-surface p-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-ink-secondary uppercase">Candidate</p>
                <p className="text-sm text-ink mt-1">{data.candidateName}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-ink-secondary uppercase">Job profile</p>
                <p className="text-sm text-ink mt-1">{data.jobProfileTitle}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-ink-secondary uppercase">Issued</p>
                <p className="text-sm text-ink mt-1">{data.issuedAt}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-ink-secondary uppercase">Version</p>
                <p className="text-sm text-ink mt-1">{data.version}</p>
              </div>
            </div>
          </div>

          {/* Dimension bands */}
          <section>
            <h2 className="text-lg font-semibold text-ink mb-4">Evidence dimensions</h2>
            <div className="space-y-3">
              {data.dimensions.map((dim) => (
                <div key={dim.id} className="rounded-card border border-border bg-surface p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-ink">{dim.title}</h3>
                    <StatusBadge tone="info">{dim.band}</StatusBadge>
                  </div>
                  <p className="text-sm text-ink-secondary">{dim.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Limitations */}
          {data.limitations.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-ink mb-3">Limitations</h2>
              <div className="rounded-card border border-status-warning/30 bg-status-warning/5 p-5">
                <ul className="space-y-2">
                  {data.limitations.map((lim, i) => (
                    <li key={i} className="text-sm text-ink flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-status-warning flex-shrink-0 mt-0.5" />
                      <span>{lim}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* Counter-evidence */}
          {data.counterEvidence.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-ink mb-3">Counter-evidence</h2>
              <div className="rounded-card border border-border bg-surface p-5">
                <ul className="space-y-2">
                  {data.counterEvidence.map((ce, i) => (
                    <li key={i} className="text-sm text-ink-secondary flex items-start gap-2">
                      <ScrollText className="h-4 w-4 text-ink-secondary flex-shrink-0 mt-0.5" />
                      <span>{ce}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* Responsible use acknowledgement */}
          <section>
            <div className="rounded-card border border-border bg-surface-subtle p-5">
              <div className="flex items-start gap-3">
                <ShieldAlert className="h-5 w-5 text-status-info flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-ink">Responsible use</h3>
                  <p className="text-sm text-ink-secondary mt-1">
                    This profile must be used as one input among many. It must not be the sole basis for any employment decision. Evidence was reviewed by a trained person against published, anchored rubrics.
                  </p>
                  {data.responsibleUseAcknowledged && (
                    <p className="text-xs text-status-success mt-2">Acknowledged by the issuing reviewer.</p>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
