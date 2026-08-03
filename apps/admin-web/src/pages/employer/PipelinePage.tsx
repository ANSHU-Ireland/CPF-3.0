import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Filter, Download } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, TableToolbar, Pagination, type Column } from '@/components/ui/Table';
import { SearchField, SelectField } from '@/components/ui/Form';
import { StatusBadge, EmptyState, ErrorState } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { employerNav } from '@/lib/routes';
import { api } from '@/lib/api';
import { useAsyncData } from '@/lib/useAsyncData';
import type { PipelineRow } from '@/lib/types';

const statusTones: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  invited: 'info',
  in_progress: 'warning',
  submitted: 'neutral',
  under_review: 'info',
  profile_issued: 'success',
  withdrawn: 'danger',
};

export default function PipelinePage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const { status, data, error, refetch } = useAsyncData<{ rows: PipelineRow[]; total: number }>(
    (_signal) => api.get(`/v1/orgs/${orgId}/sessions?status=${statusFilter}&q=${encodeURIComponent(search)}&page=${page}`),
    { deps: [orgId, statusFilter, search, page] },
  );

  const columns: Column<PipelineRow>[] = [
    {
      key: 'candidateName',
      header: 'Candidate',
      sortable: true,
      sortAccessor: (r) => r.candidateName,
      render: (r) => <span className="font-medium text-ink">{r.candidateName}</span>,
    },
    {
      key: 'jobProfileTitle',
      header: 'Job profile',
      hideOnMobile: true,
      render: (r) => <span className="text-ink-secondary">{r.jobProfileTitle}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge tone={statusTones[r.status] ?? 'neutral'} dot>{r.status.replace(/_/g, ' ')}</StatusBadge>,
    },
    {
      key: 'dueDate',
      header: 'Due',
      sortable: true,
      sortAccessor: (r) => r.dueDate ?? 'z',
      hideOnMobile: true,
      render: (r) => r.dueDate ? <span className="text-ink-secondary text-xs">{r.dueDate}</span> : <span className="text-ink-secondary">—</span>,
    },
    {
      key: 'age',
      header: 'Age',
      hideOnMobile: true,
      render: (r) => <span className="text-ink-secondary text-xs">{r.age}</span>,
    },
    {
      key: 'assignedReviewer',
      header: 'Reviewer',
      hideOnMobile: true,
      render: (r) => r.assignedReviewer ? <span className="text-ink">{r.assignedReviewer}</span> : <StatusBadge tone="warning">Unassigned</StatusBadge>,
    },
    {
      key: 'accommodations',
      header: 'Accommodations',
      hideOnMobile: true,
      render: (r) => r.hasAccommodations ? <StatusBadge tone="info">Yes</StatusBadge> : null,
    },
  ];

  return (
    <AppShell navGroups={employerNav(orgId ?? '')} maxWidth="dashboard">
      <PageHeader
        title="Assessment pipeline"
        description="All assessment sessions, ordered by workflow status and due date. No candidate ranking."
        breadcrumbs={[{ label: 'Home', to: `/org/${orgId}` }, { label: 'Pipeline' }]}
        actions={<Button variant="secondary" icon={<Download className="h-4 w-4" />}>Export</Button>}
      />

      <TableToolbar>
        <SearchField
          label="Search candidates"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1"
        />
        <SelectField
          label="Status"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'invited', label: 'Invited' },
            { value: 'in_progress', label: 'In progress' },
            { value: 'submitted', label: 'Submitted' },
            { value: 'under_review', label: 'Under review' },
            { value: 'profile_issued', label: 'Profile issued' },
            { value: 'withdrawn', label: 'Withdrawn' },
          ]}
          className="sm:w-48"
        />
      </TableToolbar>

      {status === 'loading' && <DataTable columns={columns} rows={[]} rowKey={(r) => r.sessionId} loading caption="Assessment sessions" />}

      {status === 'error' && <ErrorState error={error} onRetry={refetch} />}

      {status === 'success' && (
        <>
          {data.rows.length === 0 ? (
            <EmptyState
              icon={<Filter className="h-12 w-12" />}
              title="No sessions found"
              description={search || statusFilter !== 'all' ? "No sessions match your filters. Try adjusting them." : "No assessment sessions yet. Invite candidates to get started."}
            />
          ) : (
            <DataTable
              columns={columns}
              rows={data.rows}
              rowKey={(r) => r.sessionId}
              caption="Assessment sessions by workflow status"
              onRowClick={(r) => { window.location.href = `/org/${orgId}/sessions/${r.sessionId}/profile`; }}
            />
          )}
          <Pagination page={page} totalPages={Math.ceil(data.total / 20)} onPageChange={setPage} />
        </>
      )}
    </AppShell>
  );
}
