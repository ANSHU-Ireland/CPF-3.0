import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { UserPlus, Upload } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, TableToolbar, Pagination, type Column } from '@/components/ui/Table';
import { SearchField } from '@/components/ui/Form';
import { StatusBadge, EmptyState, ErrorState } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { Overlay } from '@/components/ui/Overlay';
import { TextField, SelectField, TextArea } from '@/components/ui/Form';
import { employerNav } from '@/lib/routes';
import { api } from '@/lib/api';
import { useAsyncData } from '@/lib/useAsyncData';

interface CandidateRow {
  id: string;
  name: string;
  email: string;
  status: 'invited' | 'in_progress' | 'submitted' | 'withdrawn';
  invitationSentAt: string | null;
  hasAccommodations: boolean;
  dataRightsState: 'none' | 'requested' | 'in_progress' | 'completed';
}

export default function CandidatesPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const { status, data, error, refetch } = useAsyncData<{ rows: CandidateRow[]; total: number }>(
    (_signal) => api.get(`/v1/orgs/${orgId}/candidates?q=${encodeURIComponent(search)}&page=${page}`),
    { deps: [orgId, search, page] },
  );

  const columns: Column<CandidateRow>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      sortAccessor: (r) => r.name,
      render: (r) => <span className="font-medium text-ink">{r.name}</span>,
    },
    {
      key: 'email',
      header: 'Email',
      hideOnMobile: true,
      render: (r) => <span className="text-ink-secondary text-sm">{r.email}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge dot tone={r.status === 'withdrawn' ? 'danger' : r.status === 'submitted' ? 'success' : 'info'}>{r.status.replace(/_/g, ' ')}</StatusBadge>,
    },
    {
      key: 'invitationSentAt',
      header: 'Invited',
      hideOnMobile: true,
      render: (r) => r.invitationSentAt ? <span className="text-ink-secondary text-xs">{r.invitationSentAt}</span> : <span className="text-ink-secondary">—</span>,
    },
    {
      key: 'accommodations',
      header: 'Accommodations',
      hideOnMobile: true,
      render: (r) => r.hasAccommodations ? <StatusBadge tone="info">Requested</StatusBadge> : null,
    },
    {
      key: 'dataRights',
      header: 'Data rights',
      hideOnMobile: true,
      render: (r) => r.dataRightsState !== 'none' ? <StatusBadge tone="warning">{r.dataRightsState.replace(/_/g, ' ')}</StatusBadge> : null,
    },
  ];

  return (
    <AppShell navGroups={employerNav(orgId ?? '')} maxWidth="dashboard">
      <PageHeader
        title="Candidates"
        description="Manage candidates and send invitations. Candidate records are never ranked or compared by merit."
        breadcrumbs={[{ label: 'Home', to: `/org/${orgId}` }, { label: 'Candidates' }]}
        actions={
          <>
            <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>
              Import CSV
            </Button>
            <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setInviteOpen(true)}>
              Invite candidate
            </Button>
          </>
        }
      />

      <TableToolbar>
        <SearchField
          label="Search candidates"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1"
        />
      </TableToolbar>

      {status === 'loading' && <DataTable columns={columns} rows={[]} rowKey={(r) => r.id} loading caption="Candidates" />}

      {status === 'error' && <ErrorState error={error} onRetry={refetch} />}

      {status === 'success' && (
        <>
          {data.rows.length === 0 ? (
            <EmptyState
              icon={<UserPlus className="h-12 w-12" />}
              title={search ? "No candidates match your search" : "No candidates yet"}
              description={search ? "Try a different search term." : "Invite your first candidate to begin an assessment."}
              action={search ? undefined : { label: 'Invite candidate', onClick: () => setInviteOpen(true) }}
            />
          ) : (
            <DataTable
              columns={columns}
              rows={data.rows}
              rowKey={(r) => r.id}
              caption="Candidate directory"
            />
          )}
          <Pagination page={page} totalPages={Math.ceil(data.total / 20)} onPageChange={setPage} />
        </>
      )}

      {/* Invite dialog */}
      <Overlay
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite a candidate"
        description="Send an assessment invitation. The candidate receives a secure link to begin."
        footer={
          <>
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={() => setInviteOpen(false)}>Send invitation</Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextField label="Candidate name" required placeholder="Full name" />
          <TextField label="Email" type="email" required placeholder="candidate@example.com" />
          <SelectField
            label="Job profile"
            required
            options={[{ value: '', label: 'Select a job profile…' }]}
            hint="The job profile determines the assessment template."
          />
          <SelectField
            label="Template"
            required
            options={[{ value: '', label: 'Select a template…' }]}
          />
          <TextArea
            label="Personal message (optional)"
            placeholder="Add a note to the invitation email…"
            hint="This appears in the invitation alongside the standard instructions."
          />
        </div>
      </Overlay>

      {/* Import dialog */}
      <Overlay
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import candidates (CSV)"
        description="Upload a CSV file with candidate details. We'll validate each row and show you any that can't be imported."
        footer={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button onClick={() => setImportOpen(false)}>Upload and validate</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-card border-2 border-dashed border-border p-8 text-center">
            <Upload className="h-8 w-8 text-ink-secondary mx-auto mb-3" />
            <p className="text-sm text-ink">Drag your CSV file here, or click to browse</p>
            <p className="text-xs text-ink-secondary mt-1">Max 500 rows. Required columns: name, email</p>
          </div>
          <div className="rounded-card bg-surface-subtle p-4">
            <p className="text-sm text-ink-secondary">
              <strong className="text-ink">Formula-safe note:</strong> If your CSV was exported from a spreadsheet, ensure formulas are converted to values before uploading. We validate each row independently and report partial success.
            </p>
          </div>
        </div>
      </Overlay>
    </AppShell>
  );
}
