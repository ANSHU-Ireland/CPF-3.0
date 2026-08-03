import { useParams } from 'react-router-dom';
import { ShieldAlert, FileClock, ShieldCheck, Download } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge, InlineNotice, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { DefinitionCard } from '@/components/ui/Display';
import { employerNav } from '@/lib/routes';
import { api } from '@/lib/api';
import { useAsyncData } from '@/lib/useAsyncData';
import type { ComplianceReadiness, ComplianceCategory } from '@/lib/types';

const statusTone: Record<ComplianceCategory['status'], 'success' | 'warning' | 'danger'> = {
  implemented: 'success',
  evidence_pending: 'warning',
  blocked: 'danger',
};

const statusLabel: Record<ComplianceCategory['status'], string> = {
  implemented: 'Implemented',
  evidence_pending: 'Evidence pending',
  blocked: 'Blocked',
};

const overallTone: Record<ComplianceReadiness['overallStatus'], 'success' | 'warning' | 'danger'> = {
  on_track: 'success',
  attention_needed: 'warning',
  blocked: 'danger',
};

export default function CompliancePage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { status, data, error, refetch } = useAsyncData<ComplianceReadiness>(
    (_signal) => api.get(`/v1/orgs/${orgId}/compliance`),
    { deps: [orgId] },
  );

  return (
    <AppShell navGroups={employerNav(orgId ?? '')} maxWidth="dashboard">
      <PageHeader
        title="Compliance hub"
        description="Readiness across data protection, AI governance, and audit obligations. No binary 'compliant' badge — each control has a specific status and owner."
        breadcrumbs={[{ label: 'Home', to: `/org/${orgId}` }, { label: 'Compliance' }]}
        actions={<Button variant="secondary" icon={<Download className="h-4 w-4" />}>Export audit log</Button>}
      />

      <div className="mb-6">
        <InlineNotice tone="info">
          <ShieldCheck className="h-4 w-4 flex-shrink-0" />
          <span>Compliance is shown as readiness status, not a pass/fail verdict. Each category names an owner and next action where available.</span>
        </InlineNotice>
      </div>

      {status === 'loading' && <LoadingState label="Loading compliance status…" />}
      {status === 'error' && <ErrorState error={error} onRetry={refetch} />}
      {status === 'success' && (
        <>
          {/* Overall readiness */}
          <div className="rounded-card border border-border bg-surface p-5 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-ink">Overall readiness</h2>
                <p className="text-sm text-ink-secondary mt-0.5">Across {data.categories.length} control areas</p>
              </div>
              <StatusBadge tone={overallTone[data.overallStatus]} dot>
                {data.overallStatus === 'on_track' ? 'On track' : data.overallStatus === 'attention_needed' ? 'Attention needed' : 'Blocked'}
              </StatusBadge>
            </div>
          </div>

          {/* Category cards */}
          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            {data.categories.map((cat) => (
              <DefinitionCard key={cat.key} term={cat.label} definition={cat.description}>
                <div className="space-y-2">
                  <StatusBadge tone={statusTone[cat.status]} dot>{statusLabel[cat.status]}</StatusBadge>
                  {cat.ownerName && (
                    <p className="text-xs text-ink-secondary">
                      Owner: {cat.ownerName}{cat.ownerEmail ? ` (${cat.ownerEmail})` : ''}
                    </p>
                  )}
                  {cat.lastReviewedAt && (
                    <p className="text-xs text-ink-secondary">Last reviewed: {cat.lastReviewedAt}</p>
                  )}
                  {cat.nextAction && (
                    <p className="text-xs text-status-warning font-medium">Next: {cat.nextAction}</p>
                  )}
                </div>
              </DefinitionCard>
            ))}
          </div>

          {/* Audit explorer */}
          <div className="rounded-card border border-border bg-surface p-5">
            <div className="flex items-center gap-3 mb-4">
              <FileClock className="h-5 w-5 text-brand" />
              <h2 className="font-semibold text-ink">Audit & exports</h2>
            </div>
            <p className="text-sm text-ink-secondary mb-4">
              Export the full audit trail or verify the integrity of a specific audit chain.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="secondary" icon={<Download className="h-4 w-4" />}>Export audit log</Button>
              <Button variant="secondary" icon={<ShieldAlert className="h-4 w-4" />}>Verify audit chain</Button>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
