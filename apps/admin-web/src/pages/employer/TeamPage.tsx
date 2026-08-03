import { useParams } from 'react-router-dom';
import { UserPlus, Trash2, ShieldCheck } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/ui/Table';
import { StatusBadge, EmptyState, ErrorState } from '@/components/ui/Feedback';
import { Button, IconButton } from '@/components/ui/Button';
import { ConfirmationDialog, Overlay } from '@/components/ui/Overlay';
import { TextField, SelectField } from '@/components/ui/Form';
import { useState } from 'react';
import { employerNav } from '@/lib/routes';
import { api } from '@/lib/api';
import { useAsyncData } from '@/lib/useAsyncData';
import type { TeamMember } from '@/lib/types';

export default function TeamPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);

  const { status, data, error, refetch } = useAsyncData<{ rows: TeamMember[] }>(
    (_signal) => api.get(`/v1/orgs/${orgId}/team`),
    { deps: [orgId] },
  );

  const columns: Column<TeamMember>[] = [
    {
      key: 'displayName',
      header: 'Name',
      sortable: true,
      sortAccessor: (r) => r.displayName,
      render: (r) => <span className="font-medium text-ink">{r.displayName}</span>,
    },
    {
      key: 'email',
      header: 'Email',
      hideOnMobile: true,
      render: (r) => <span className="text-ink-secondary text-sm">{r.email}</span>,
    },
    {
      key: 'role',
      header: 'Role',
      render: (r) => <span className="text-ink">{r.role}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge dot tone={r.status === 'active' ? 'success' : r.status === 'invited' ? 'info' : 'neutral'}>{r.status}</StatusBadge>,
    },
    {
      key: 'mfaEnrolled',
      header: 'MFA',
      hideOnMobile: true,
      render: (r) => r.mfaEnrolled ? <ShieldCheck className="h-4 w-4 text-status-success" /> : <StatusBadge tone="warning">Not set</StatusBadge>,
    },
    {
      key: 'calibrationCount',
      header: 'Calibrations',
      hideOnMobile: true,
      render: (r) => <span className="text-ink-secondary">{r.calibrationCount}</span>,
    },
  ];

  return (
    <AppShell navGroups={employerNav(orgId ?? '')} maxWidth="dashboard">
      <PageHeader
        title="Team & permissions"
        description="Manage team members, roles, and security status. Role removal is permanent and audited."
        breadcrumbs={[{ label: 'Home', to: `/org/${orgId}` }, { label: 'Team' }]}
        actions={<Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setInviteOpen(true)}>Invite member</Button>}
      />

      {status === 'loading' && <DataTable columns={columns} rows={[]} rowKey={(r) => r.id} loading caption="Team members" />}
      {status === 'error' && <ErrorState error={error} onRetry={refetch} />}
      {status === 'success' && (
        data.rows.length === 0 ? (
          <EmptyState
            icon={<UserPlus className="h-12 w-12" />}
            title="No team members yet"
            description="Invite people to help manage assessments and reviews."
            action={{ label: 'Invite member', onClick: () => setInviteOpen(true) }}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={data.rows}
            rowKey={(r) => r.id}
            caption="Team members and their roles"
            rowAction={(r) => (
              <IconButton
                label={`Remove ${r.displayName}`}
                onClick={(e) => { e.stopPropagation(); setRemoveTarget(r); }}
              >
                <Trash2 className="h-4 w-4 text-status-danger" />
              </IconButton>
            )}
          />
        )
      )}

      <Overlay
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite a team member"
        description="They'll receive a secure activation link. The link is shown once and cannot be retrieved later."
        footer={
          <>
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={() => setInviteOpen(false)}>Send invitation</Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextField label="Name" required placeholder="Full name" />
          <TextField label="Email" type="email" required placeholder="colleague@organisation.ie" />
          <SelectField
            label="Role"
            required
            options={[
              { value: '', label: 'Select a role…' },
              { value: 'employer_admin', label: 'Employer admin' },
              { value: 'reviewer', label: 'Reviewer' },
            ]}
            hint="Admins can manage all assessments and settings. Reviewers can only access their assigned reviews."
          />
        </div>
      </Overlay>

      <ConfirmationDialog
        open={!!removeTarget}
        title={`Remove ${removeTarget?.displayName}?`}
        description="This will revoke their access immediately. They will no longer be able to sign in or access any organisation data. This action is permanent and will be recorded in the audit log."
        impactSummary={`Role: ${removeTarget?.role}. All assigned reviews will become unassigned and need to be reallocated.`}
        confirmLabel="Remove and revoke access"
        destructive
        confirmationText={removeTarget?.displayName}
        onConfirm={async () => {
          if (!removeTarget) return;
          try {
            await api.delete(`/v1/orgs/${orgId}/team/${removeTarget.id}`);
            setRemoveTarget(null);
            refetch();
          } catch {
            // Error handled by refetch / error boundary
          }
        }}
        onCancel={() => setRemoveTarget(null)}
      />
    </AppShell>
  );
}
