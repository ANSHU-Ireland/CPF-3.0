import { useParams } from 'react-router-dom';
import { Plus, AlertTriangle } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/ui/Table';
import { StatusBadge, EmptyState, ErrorState, InlineNotice } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { employerNav } from '@/lib/routes';
import { api } from '@/lib/api';
import { useAsyncData } from '@/lib/useAsyncData';

interface JobProfile {
  id: string;
  title: string;
  templateName: string;
  status: 'active' | 'archived';
  createdAt: string;
  candidateCount: number;
}

export default function JobProfilesPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { status, data, error, refetch } = useAsyncData<{ rows: JobProfile[] }>(
    (_signal) => api.get(`/v1/orgs/${orgId}/job-profiles`),
    { deps: [orgId] },
  );

  const columns: Column<JobProfile>[] = [
    {
      key: 'title',
      header: 'Title',
      sortable: true,
      sortAccessor: (r) => r.title,
      render: (r) => <span className="font-medium text-ink">{r.title}</span>,
    },
    {
      key: 'templateName',
      header: 'Template',
      hideOnMobile: true,
      render: (r) => <span className="text-ink-secondary">{r.templateName}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge tone={r.status === 'active' ? 'success' : 'neutral'} dot>{r.status}</StatusBadge>,
    },
    {
      key: 'candidateCount',
      header: 'Candidates',
      hideOnMobile: true,
      render: (r) => <span className="text-ink-secondary">{r.candidateCount}</span>,
    },
    {
      key: 'createdAt',
      header: 'Created',
      hideOnMobile: true,
      render: (r) => <span className="text-ink-secondary text-xs">{r.createdAt}</span>,
    },
  ];

  return (
    <AppShell navGroups={employerNav(orgId ?? '')} maxWidth="dashboard">
      <PageHeader
        title="Job profiles"
        description="Define the roles you assess for. Each profile links to an assessment template."
        breadcrumbs={[{ label: 'Home', to: `/org/${orgId}` }, { label: 'Job profiles' }]}
        actions={<Button icon={<Plus className="h-4 w-4" />}>New job profile</Button>}
      />

      {/* BACKEND_CONTRACT_REQUIRED: detail/edit/archive mutations are not confirmed in the API contract */}
      <div className="mb-4">
        <InlineNotice tone="warning">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>Editing, archiving, and detailed views require additional backend endpoints. Creation is available now; other actions are pending contract confirmation.</span>
        </InlineNotice>
      </div>

      {status === 'loading' && <DataTable columns={columns} rows={[]} rowKey={(r) => r.id} loading caption="Job profiles" />}
      {status === 'error' && <ErrorState error={error} onRetry={refetch} />}
      {status === 'success' && (
        data.rows.length === 0 ? (
          <EmptyState
            icon={<Plus className="h-12 w-12" />}
            title="No job profiles yet"
            description="Create a job profile to start inviting candidates for assessment."
            action={{ label: 'New job profile', onClick: () => {} }}
          />
        ) : (
          <DataTable columns={columns} rows={data.rows} rowKey={(r) => r.id} caption="Job profiles" />
        )
      )}
    </AppShell>
  );
}
