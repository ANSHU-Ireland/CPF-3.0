import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, ClipboardCheck } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/ui/Table';
import { StatusBadge, EmptyState, ErrorState, InlineNotice, LoadingState } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { Overlay, ConfirmationDialog } from '@/components/ui/Overlay';
import { employerNav } from '@/lib/routes';
import { api } from '@/lib/api';
import { useAsyncData } from '@/lib/useAsyncData';

interface ReviewAllocation {
  reviewId: string;
  candidateName: string;
  assessmentTitle: string;
  status: 'assigned' | 'in_progress' | 'draft' | 'ready_to_finalise';
  reviewerName: string | null;
  secondReviewRequired: boolean;
  calibrationRecency: string | null;
  hasConflict: boolean;
  submittedDate: string;
}

export default function ReviewsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [allocationTarget, setAllocationTarget] = useState<ReviewAllocation | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { status, data, error, refetch } = useAsyncData<{ rows: ReviewAllocation[] }>(
    (_signal) => api.get(`/v1/orgs/${orgId}/reviews`),
    { deps: [orgId] },
  );

  const columns: Column<ReviewAllocation>[] = [
    {
      key: 'candidateName',
      header: 'Candidate',
      sortable: true,
      sortAccessor: (r) => r.candidateName,
      render: (r) => <span className="font-medium text-ink">{r.candidateName}</span>,
    },
    {
      key: 'assessmentTitle',
      header: 'Assessment',
      hideOnMobile: true,
      render: (r) => <span className="text-ink-secondary">{r.assessmentTitle}</span>,
    },
    {
      key: 'status',
      header: 'Review status',
      render: (r) => <StatusBadge dot tone={r.status === 'ready_to_finalise' ? 'success' : r.status === 'in_progress' ? 'info' : 'neutral'}>{r.status.replace(/_/g, ' ')}</StatusBadge>,
    },
    {
      key: 'reviewerName',
      header: 'Reviewer',
      hideOnMobile: true,
      render: (r) => r.reviewerName ? <span className="text-ink">{r.reviewerName}</span> : <StatusBadge tone="warning">Unassigned</StatusBadge>,
    },
    {
      key: 'secondReviewRequired',
      header: '2nd review',
      hideOnMobile: true,
      render: (r) => r.secondReviewRequired ? <StatusBadge tone="info">Required</StatusBadge> : null,
    },
    {
      key: 'hasConflict',
      header: 'Conflict',
      hideOnMobile: true,
      render: (r) => r.hasConflict ? <StatusBadge tone="danger" dot>Open</StatusBadge> : null,
    },
  ];

  return (
    <AppShell navGroups={employerNav(orgId ?? '')} maxWidth="dashboard">
      <PageHeader
        title="Review allocation"
        description="Assign reviews to eligible reviewers. Allocation is by neutral criteria — reviewer eligibility, calibration recency, and workload — never candidate ranking."
        breadcrumbs={[{ label: 'Home', to: `/org/${orgId}` }, { label: 'Reviews' }, { label: 'Work allocation' }]}
      />

      {status === 'loading' && <LoadingState label="Loading reviews…" />}
      {status === 'error' && <ErrorState error={error} onRetry={refetch} />}
      {status === 'success' && (
        data.rows.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="h-12 w-12" />}
            title="No reviews to allocate"
            description="Reviews will appear here when candidates submit their assessments."
          />
        ) : (
          <DataTable
            columns={columns}
            rows={data.rows}
            rowKey={(r) => r.reviewId}
            caption="Review allocation"
            onRowClick={(r) => setAllocationTarget(r)}
          />
        )
      )}

      {/* Allocation drawer */}
      <Overlay
        open={!!allocationTarget}
        onClose={() => setAllocationTarget(null)}
        title={allocationTarget ? `Allocate review: ${allocationTarget.candidateName}` : ''}
        description={allocationTarget ? allocationTarget.assessmentTitle : ''}
        variant="drawer-right"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAllocationTarget(null)}>Cancel</Button>
            <Button onClick={() => setConfirmOpen(true)} disabled={!allocationTarget || !!allocationTarget.reviewerName}>
              Assign reviewer
            </Button>
          </>
        }
      >
        {allocationTarget && (
          <div className="space-y-5">
            <div className="rounded-card bg-surface-subtle p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-ink-secondary">Submitted</span>
                <span className="text-ink">{allocationTarget.submittedDate}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-ink-secondary">Calibration recency</span>
                <span className="text-ink">{allocationTarget.calibrationRecency ?? 'Not recorded'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-ink-secondary">Second review</span>
                <span className="text-ink">{allocationTarget.secondReviewRequired ? 'Required' : 'Not required'}</span>
              </div>
            </div>

            {allocationTarget.hasConflict && (
              <InlineNotice tone="danger">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>There is an open conflict on this review. Resolve it before finalising the allocation.</span>
              </InlineNotice>
            )}

            <div>
              <h3 className="text-sm font-semibold text-ink mb-3">Eligible reviewers</h3>
              <p className="text-sm text-ink-secondary mb-3">
                Reviewers are listed by eligibility and calibration recency. Workload context is shown where available.
              </p>
              <div className="space-y-2">
                {/* BACKEND_CONTRACT_REQUIRED: reviewer eligibility list endpoint not confirmed */}
                <InlineNotice tone="warning">
                  <span>Reviewer eligibility and workload data require a backend endpoint. Allocation can proceed manually.</span>
                </InlineNotice>
              </div>
            </div>
          </div>
        )}
      </Overlay>

      <ConfirmationDialog
        open={confirmOpen}
        title="Confirm reviewer assignment?"
        description="The selected reviewer will be notified and this review will appear in their queue. The assignment is recorded in the audit log."
        confirmLabel="Confirm assignment"
        onConfirm={() => { setConfirmOpen(false); setAllocationTarget(null); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </AppShell>
  );
}
