import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/ui/Table';
import { StatusBadge, EmptyState, ErrorState, InlineNotice, LoadingState } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { Overlay, ConfirmationDialog } from '@/components/ui/Overlay';
import { Timeline } from '@/components/ui/Navigation';
import { employerNav } from '@/lib/routes';
import { api } from '@/lib/api';
import { useAsyncData } from '@/lib/useAsyncData';
import type { DataRightsCase } from '@/lib/types';

const statusTone: Record<DataRightsCase['status'], 'info' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  new: 'info',
  in_progress: 'warning',
  awaiting_validation: 'warning',
  completed: 'success',
  on_hold: 'danger',
};

export default function DataRightsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [selectedCase, setSelectedCase] = useState<DataRightsCase | null>(null);
  const [transitionOpen, setTransitionOpen] = useState(false);

  const { status, data, error, refetch } = useAsyncData<{ rows: DataRightsCase[] }>(
    (_signal) => api.get(`/v1/orgs/${orgId}/data-rights`),
    { deps: [orgId] },
  );

  const columns: Column<DataRightsCase>[] = [
    {
      key: 'candidateName',
      header: 'Candidate',
      sortable: true,
      sortAccessor: (r) => r.candidateName,
      render: (r) => <span className="font-medium text-ink">{r.candidateName}</span>,
    },
    {
      key: 'requestType',
      header: 'Type',
      render: (r) => <span className="text-ink capitalize">{r.requestType}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge dot tone={statusTone[r.status]}>{r.status.replace(/_/g, ' ')}</StatusBadge>,
    },
    {
      key: 'dueByDate',
      header: 'SLA due',
      hideOnMobile: true,
      render: (r) => <span className="text-ink-secondary text-xs">{r.dueByDate}</span>,
    },
    {
      key: 'ownerName',
      header: 'Owner',
      hideOnMobile: true,
      render: (r) => r.ownerName ? <span className="text-ink">{r.ownerName}</span> : <StatusBadge tone="warning">Unassigned</StatusBadge>,
    },
    {
      key: 'legalHold',
      header: 'Legal hold',
      hideOnMobile: true,
      render: (r) => r.legalHold ? <StatusBadge tone="danger">Active</StatusBadge> : null,
    },
  ];

  return (
    <AppShell navGroups={employerNav(orgId ?? '')} maxWidth="dashboard">
      <PageHeader
        title="Data rights requests"
        description="Manage access, rectification, erasure, portability, and objection requests. Each case has an SLA and audit trail."
        breadcrumbs={[{ label: 'Home', to: `/org/${orgId}` }, { label: 'Governance' }, { label: 'Data rights' }]}
      />

      {status === 'loading' && <LoadingState label="Loading data rights cases…" />}
      {status === 'error' && <ErrorState error={error} onRetry={refetch} />}
      {status === 'success' && (
        data.rows.length === 0 ? (
          <EmptyState
            icon={<ShieldAlert className="h-12 w-12" />}
            title="No data rights requests"
            description="When a candidate submits a data rights request, it will appear here for tracking and response."
          />
        ) : (
          <DataTable
            columns={columns}
            rows={data.rows}
            rowKey={(r) => r.id}
            caption="Data rights cases"
            onRowClick={(r) => setSelectedCase(r)}
          />
        )
      )}

      {/* Case workspace drawer */}
      <Overlay
        open={!!selectedCase}
        onClose={() => setSelectedCase(null)}
        title={selectedCase ? `Case: ${selectedCase.candidateName}` : ''}
        description={selectedCase ? `${selectedCase.requestType} request — ${selectedCase.status.replace(/_/g, ' ')}` : ''}
        variant="drawer-right"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedCase(null)}>Close</Button>
            <Button onClick={() => setTransitionOpen(true)}>Advance status</Button>
          </>
        }
      >
        {selectedCase && (
          <div className="space-y-6">
            {selectedCase.legalHold && (
              <InlineNotice tone="danger">
                <ShieldAlert className="h-4 w-4 flex-shrink-0" />
                <span>Legal hold is active. Data cannot be modified or deleted until the hold is lifted.</span>
              </InlineNotice>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-card bg-surface-subtle p-4">
                <p className="text-xs font-semibold text-ink-secondary uppercase">Request type</p>
                <p className="text-sm text-ink mt-1 capitalize">{selectedCase.requestType}</p>
              </div>
              <div className="rounded-card bg-surface-subtle p-4">
                <p className="text-xs font-semibold text-ink-secondary uppercase">SLA due</p>
                <p className="text-sm text-ink mt-1">{selectedCase.dueByDate}</p>
              </div>
              <div className="rounded-card bg-surface-subtle p-4">
                <p className="text-xs font-semibold text-ink-secondary uppercase">Submitted</p>
                <p className="text-sm text-ink mt-1">{selectedCase.submittedAt}</p>
              </div>
              <div className="rounded-card bg-surface-subtle p-4">
                <p className="text-xs font-semibold text-ink-secondary uppercase">Owner</p>
                <p className="text-sm text-ink mt-1">{selectedCase.ownerName ?? 'Unassigned'}</p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-ink mb-3">Case timeline</h3>
              <Timeline
                items={[
                  { id: '1', timestamp: selectedCase.submittedAt, title: 'Request submitted', tone: 'neutral' },
                  { id: '2', timestamp: '—', title: 'Owner assigned', description: selectedCase.ownerName ? `Assigned to ${selectedCase.ownerName}` : 'Pending assignment', tone: selectedCase.ownerName ? 'success' : 'warning' },
                  { id: '3', timestamp: '—', title: 'Status: ' + selectedCase.status.replace(/_/g, ' '), tone: statusTone[selectedCase.status] === 'success' ? 'success' : 'neutral' },
                ]}
              />
            </div>
          </div>
        )}
      </Overlay>

      <ConfirmationDialog
        open={transitionOpen}
        title="Advance case status?"
        description="Confirm the next status transition for this data rights case. This will be recorded in the audit log."
        confirmLabel="Confirm transition"
        onConfirm={() => setTransitionOpen(false)}
        onCancel={() => setTransitionOpen(false)}
      />
    </AppShell>
  );
}
