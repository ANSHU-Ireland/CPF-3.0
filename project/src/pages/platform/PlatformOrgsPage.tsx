import { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, TableToolbar, type Column } from '@/components/ui/Table';
import { SearchField, SelectField } from '@/components/ui/Form';
import { StatusBadge, EmptyState, ErrorState } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { Overlay } from '@/components/ui/Overlay';
import { platformAdminNav } from '@/lib/routes';
import { api } from '@/lib/api';
import { useAsyncData } from '@/lib/useAsyncData';
import type { Organisation } from '@/lib/types';
import { Building2, Plus } from 'lucide-react';

const statusTone: Record<Organisation['status'], 'success' | 'warning' | 'danger'> = {
  active: 'success',
  suspended: 'danger',
  provisioning: 'warning',
};

export default function PlatformOrgsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrg, setSelectedOrg] = useState<Organisation | null>(null);

  const { status, data, error, refetch } = useAsyncData<{ rows: Organisation[] }>(
    (_signal) => api.get(`/v1/platform/orgs?q=${encodeURIComponent(search)}&status=${statusFilter}`),
    { deps: [search, statusFilter] },
  );

  const columns: Column<Organisation>[] = [
    {
      key: 'name',
      header: 'Organisation',
      sortable: true,
      sortAccessor: (r) => r.name,
      render: (r) => <span className="font-medium text-ink">{r.name}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge dot tone={statusTone[r.status]}>{r.status}</StatusBadge>,
    },
    {
      key: 'planName',
      header: 'Plan',
      hideOnMobile: true,
      render: (r) => <span className="text-ink-secondary">{r.planName}</span>,
    },
    {
      key: 'userCount',
      header: 'Users',
      hideOnMobile: true,
      render: (r) => <span className="text-ink-secondary">{r.userCount}</span>,
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
    <AppShell navGroups={platformAdminNav} maxWidth="dashboard">
      <PageHeader
        title="Organisation directory"
        description="All organisations on the platform. Search, filter, and inspect details."
        breadcrumbs={[{ label: 'Platform overview', to: '/platform' }, { label: 'Organisations' }]}
        actions={<Button icon={<Plus className="h-4 w-4" />}>Onboard organisation</Button>}
      />

      <TableToolbar>
        <SearchField
          label="Search organisations"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <SelectField
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
            { value: 'provisioning', label: 'Provisioning' },
          ]}
          className="sm:w-48"
        />
      </TableToolbar>

      {status === 'loading' && <DataTable columns={columns} rows={[]} rowKey={(r) => r.id} loading caption="Organisations" />}
      {status === 'error' && <ErrorState error={error} onRetry={refetch} />}
      {status === 'success' && (
        data.rows.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-12 w-12" />}
            title={search ? "No organisations match your search" : "No organisations yet"}
            description={search ? "Try a different search term." : "Onboard your first organisation to get started."}
            action={search ? undefined : { label: 'Onboard organisation', onClick: () => {} }}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={data.rows}
            rowKey={(r) => r.id}
            caption="Organisations on the platform"
            onRowClick={(r) => setSelectedOrg(r)}
          />
        )
      )}

      {/* Detail drawer */}
      <Overlay
        open={!!selectedOrg}
        onClose={() => setSelectedOrg(null)}
        title={selectedOrg?.name ?? ''}
        description={selectedOrg ? `Status: ${selectedOrg.status} · Plan: ${selectedOrg.planName}` : ''}
        variant="drawer-right"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedOrg(null)}>Close</Button>
            <Button variant="danger">Suspend organisation</Button>
          </>
        }
      >
        {selectedOrg && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-card bg-surface-subtle p-4">
                <p className="text-xs font-semibold text-ink-secondary uppercase">Users</p>
                <p className="text-2xl font-semibold text-ink mt-1">{selectedOrg.userCount}</p>
              </div>
              <div className="rounded-card bg-surface-subtle p-4">
                <p className="text-xs font-semibold text-ink-secondary uppercase">Candidates</p>
                <p className="text-2xl font-semibold text-ink mt-1">{selectedOrg.candidateCount}</p>
              </div>
              <div className="rounded-card bg-surface-subtle p-4">
                <p className="text-xs font-semibold text-ink-secondary uppercase">Created</p>
                <p className="text-sm text-ink mt-1">{selectedOrg.createdAt}</p>
              </div>
              <div className="rounded-card bg-surface-subtle p-4">
                <p className="text-xs font-semibold text-ink-secondary uppercase">MFA enforcement</p>
                <p className="text-sm text-ink mt-1">{selectedOrg.mfaEnforcementEnabled ? 'Enabled' : 'Disabled'}</p>
              </div>
            </div>
          </div>
        )}
      </Overlay>
    </AppShell>
  );
}
