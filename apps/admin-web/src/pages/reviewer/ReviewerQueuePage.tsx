import { Inbox, ArrowRight } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/ui/Table';
import { StatusBadge, EmptyState, ErrorState, InlineNotice } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { reviewerNav } from '@/lib/routes';
import { api } from '@/lib/api';
import { useAsyncData } from '@/lib/useAsyncData';
import type { ReviewItem } from '@/lib/types';
import { useNavigate } from 'react-router-dom';

const statusTone: Record<ReviewItem['status'], 'neutral' | 'info' | 'warning' | 'success'> = {
  assigned: 'neutral',
  in_progress: 'info',
  draft: 'warning',
  ready_to_finalise: 'success',
};

export default function ReviewerQueuePage() {
  const navigate = useNavigate();
  const { status, data, error, refetch } = useAsyncData<{ rows: ReviewItem[] }>(
    (_signal) => api.get('/v1/reviews/queue'),
    { deps: [] },
  );

  const columns: Column<ReviewItem>[] = [
    {
      key: 'assessmentTitle',
      header: 'Assessment',
      sortable: true,
      sortAccessor: (r) => r.assessmentTitle,
      render: (r) => <span className="font-medium text-ink">{r.assessmentTitle}</span>,
    },
    {
      key: 'jobProfileTitle',
      header: 'Job profile',
      hideOnMobile: true,
      render: (r) => <span className="text-ink-secondary">{r.jobProfileTitle}</span>,
    },
    {
      key: 'submittedDate',
      header: 'Submitted',
      hideOnMobile: true,
      render: (r) => <span className="text-ink-secondary text-xs">{r.submittedDate}</span>,
    },
    {
      key: 'dueDate',
      header: 'Due',
      hideOnMobile: true,
      render: (r) => r.dueDate ? <span className="text-ink-secondary text-xs">{r.dueDate}</span> : <span className="text-ink-secondary">—</span>,
    },
    {
      key: 'reviewProgress',
      header: 'Progress',
      render: (r) => (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 rounded-full bg-surface-subtle overflow-hidden">
            <div className="h-full bg-brand" style={{ width: `${r.reviewProgress}%` }} />
          </div>
          <span className="text-xs text-ink-secondary">{r.reviewProgress}%</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge dot tone={statusTone[r.status]}>{r.status.replace(/_/g, ' ')}</StatusBadge>,
    },
    {
      key: 'action',
      header: '',
      render: (r) => (
        <Button size="sm" variant="ghost" icon={<ArrowRight className="h-4 w-4" />} onClick={(e) => { e.stopPropagation(); navigate(`/reviews/${r.reviewId}`); }}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <AppShell navGroups={reviewerNav} maxWidth="dashboard">
      <PageHeader
        title="My review queue"
        description="Your assigned reviews, ordered by due date and submission age. No candidate comparison or ranking."
        breadcrumbs={[{ label: 'My review queue' }]}
      />

      <div className="mb-4">
        <InlineNotice tone="info">
          <Inbox className="h-4 w-4 flex-shrink-0" />
          <span>Reviews are listed by neutral workflow criteria — due date and submission age — not by candidate quality.</span>
        </InlineNotice>
      </div>

      {status === 'loading' && <DataTable columns={columns} rows={[]} rowKey={(r) => r.reviewId} loading caption="Assigned reviews" />}
      {status === 'error' && <ErrorState error={error} onRetry={refetch} />}
      {status === 'success' && (
        data.rows.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-12 w-12" />}
            title="No reviews assigned"
            description="When you're assigned a review, it will appear here. Contact your administrator if you believe this is an error."
          />
        ) : (
          <DataTable
            columns={columns}
            rows={data.rows}
            rowKey={(r) => r.reviewId}
            caption="Assigned reviews"
            onRowClick={(r) => navigate(`/reviews/${r.reviewId}`)}
          />
        )
      )}
    </AppShell>
  );
}
