import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { KeyRound, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { InlineNotice, ErrorState, LoadingState, StatusBadge } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { SelectField, TextArea, TextField } from '@/components/ui/Form';
import { Toast } from '@/components/ui/Overlay';
import { employerNav } from '@/lib/routes';
import { api } from '@/lib/api';
import { useAsyncData } from '@/lib/useAsyncData';

interface RetentionPolicy {
  policy: {
    evidence_retention_days: number;
    integrity_retention_days: number;
    audit_retention_days: number;
    deletion_mode: 'hard_delete' | 'anonymise_then_delete';
  };
  schedulingNote: string;
}

interface SettingsOverview {
  sections: Array<{
    id: string;
    title: string;
    description: string;
    status: 'configured' | 'recommended' | 'incomplete';
  }>;
}

interface AccountSettings {
  user: {
    id: string;
    email: string;
    displayName: string;
    mfaEnrolled: boolean;
  };
  session: {
    steppedUpAt: string;
  };
}

interface ReviewerList {
  items: Array<{
    id: string;
    email: string;
    display_name: string;
    status: string;
    mfa_enrolled: boolean;
  }>;
}

interface OrganisationSettings {
  id: string;
  name: string;
  slug: string;
  country_code: string | null;
  status: string;
}

interface PlanSettings {
  plan: {
    code: string;
    limits: Record<string, number>;
    moduleEntitlements: Record<string, boolean>;
  } | null;
  usage: {
    activeAssessments: number;
    orgUsers: number;
  };
}

interface OrgSettingsBundle {
  overview: SettingsOverview;
  account: AccountSettings;
  reviewers: ReviewerList;
  organisation: OrganisationSettings;
  plan: PlanSettings;
  retention: RetentionPolicy;
}

type SectionId = 'account' | 'security' | 'reviewers' | 'organisation' | 'plan' | 'retention';

const sectionMeta: Array<{ id: SectionId; label: string; description: string; mapToOverview: string }> = [
  { id: 'account', label: 'Account profile', description: 'Identity details and personal profile.', mapToOverview: 'account' },
  { id: 'security', label: 'Security', description: 'Password and active session controls.', mapToOverview: 'security' },
  { id: 'reviewers', label: 'Reviewer management', description: 'Invite reviewers and reset access.', mapToOverview: 'reviewers' },
  { id: 'organisation', label: 'Organisation profile', description: 'Organisation identity and status details.', mapToOverview: 'organisation' },
  { id: 'plan', label: 'Plan and billing', description: 'Usage, plan requests, and upgrades.', mapToOverview: 'plan' },
  { id: 'retention', label: 'Retention policy', description: 'Evidence and audit lifecycle controls.', mapToOverview: 'retention' },
];

function statusTone(status: 'configured' | 'recommended' | 'incomplete'): 'success' | 'warning' | 'danger' {
  if (status === 'configured') return 'success';
  if (status === 'recommended') return 'warning';
  return 'danger';
}

export default function OrgSettingsPage() {
  const { orgId, section } = useParams<{ orgId: string; section?: string }>();
  const [toast, setToast] = useState<string | null>(null);
  const [tokenNotice, setTokenNotice] = useState<string | null>(null);

  const [savingRetention, setSavingRetention] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [revokingSessions, setRevokingSessions] = useState(false);
  const [invitingReviewer, setInvitingReviewer] = useState(false);
  const [resettingReviewerId, setResettingReviewerId] = useState<string | null>(null);
  const [requestingUpgrade, setRequestingUpgrade] = useState(false);

  const [retentionDraft, setRetentionDraft] = useState<{
    evidence: string;
    integrity: string;
    audit: string;
    mode: 'hard_delete' | 'anonymise_then_delete';
  } | null>(null);
  const [profileDraft, setProfileDraft] = useState<{ displayName: string } | null>(null);
  const [orgDraft, setOrgDraft] = useState<{ name: string; countryCode: string } | null>(null);
  const [passwordDraft, setPasswordDraft] = useState({ currentPassword: '', newPassword: '' });
  const [reviewerDraft, setReviewerDraft] = useState({ displayName: '', email: '' });
  const [upgradeDraft, setUpgradeDraft] = useState({ targetPlanCode: '', reason: '' });

  const { status, data, error, refetch } = useAsyncData<OrgSettingsBundle>(
    async (_signal) => {
      const [overview, account, reviewers, organisation, plan, retention] = await Promise.all([
        api.get<SettingsOverview>(`/v1/orgs/${orgId}/settings/overview`),
        api.get<AccountSettings>(`/v1/orgs/${orgId}/settings/account`),
        api.get<ReviewerList>(`/v1/orgs/${orgId}/settings/team/reviewers`),
        api.get<OrganisationSettings>(`/v1/orgs/${orgId}/settings/organisation`),
        api.get<PlanSettings>(`/v1/orgs/${orgId}/settings/plan`),
        api.get<RetentionPolicy>(`/v1/orgs/${orgId}/retention-policy`),
      ]);
      return { overview, account, reviewers, organisation, plan, retention };
    },
    { deps: [orgId] },
  );

  const activeSection = (sectionMeta.some((s) => s.id === section) ? section : 'account') as SectionId;

  const source = useMemo(() => {
    if (status !== 'success') return null;
    return {
      retention: retentionDraft ?? {
        evidence: String(data.retention.policy.evidence_retention_days),
        integrity: String(data.retention.policy.integrity_retention_days),
        audit: String(data.retention.policy.audit_retention_days),
        mode: data.retention.policy.deletion_mode,
      },
      profile: profileDraft ?? { displayName: data.account.user.displayName },
      organisation: orgDraft ?? {
        name: data.organisation.name,
        countryCode: data.organisation.country_code ?? '',
      },
    };
  }, [data, orgDraft, profileDraft, retentionDraft, status]);

  if (status === 'loading') {
    return (
      <AppShell navGroups={employerNav(orgId ?? '')} maxWidth="dashboard">
        <LoadingState label="Loading organisation settings…" />
      </AppShell>
    );
  }

  if (status === 'error') {
    return (
      <AppShell navGroups={employerNav(orgId ?? '')} maxWidth="dashboard">
        <ErrorState error={error} onRetry={refetch} />
      </AppShell>
    );
  }

  if (!source) return null;

  const overviewById = new Map(data.overview.sections.map((s) => [s.id, s]));

  const saveRetention = async () => {
    setSavingRetention(true);
    try {
      await api.put(`/v1/orgs/${orgId}/retention-policy`, {
        evidenceRetentionDays: Number(source.retention.evidence),
        integrityRetentionDays: Number(source.retention.integrity),
        auditRetentionDays: Number(source.retention.audit),
        deletionMode: source.retention.mode,
      });
      setRetentionDraft(null);
      setToast('Retention policy saved.');
      refetch();
    } finally {
      setSavingRetention(false);
    }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await api.put(`/v1/orgs/${orgId}/settings/account/profile`, {
        displayName: source.profile.displayName,
      });
      setProfileDraft(null);
      setToast('Profile updated.');
      refetch();
    } finally {
      setSavingProfile(false);
    }
  };

  const saveOrganisation = async () => {
    setSavingOrg(true);
    try {
      await api.put(`/v1/orgs/${orgId}/settings/organisation`, {
        name: source.organisation.name,
        countryCode: source.organisation.countryCode || undefined,
      });
      setOrgDraft(null);
      setToast('Organisation profile saved.');
      refetch();
    } finally {
      setSavingOrg(false);
    }
  };

  const changePassword = async () => {
    setChangingPassword(true);
    try {
      const result = await api.post<{ changed: boolean; revokedOtherSessions: number }>(
        `/v1/orgs/${orgId}/settings/account/change-password`,
        passwordDraft,
      );
      setPasswordDraft({ currentPassword: '', newPassword: '' });
      setToast(`Password updated. ${result.revokedOtherSessions} other sessions revoked.`);
    } finally {
      setChangingPassword(false);
    }
  };

  const revokeOtherSessions = async () => {
    setRevokingSessions(true);
    try {
      const result = await api.post<{ revoked: number }>(`/v1/orgs/${orgId}/settings/account/revoke-other-sessions`);
      setToast(`${result.revoked} other sessions revoked.`);
    } finally {
      setRevokingSessions(false);
    }
  };

  const inviteReviewer = async () => {
    setInvitingReviewer(true);
    try {
      const result = await api.post<{ activationToken: string }>(`/v1/orgs/${orgId}/settings/team/reviewers`, reviewerDraft);
      setReviewerDraft({ displayName: '', email: '' });
      setTokenNotice(`Reviewer activation token: ${result.activationToken}`);
      setToast('Reviewer invited. Deliver activation token out of band.');
      refetch();
    } finally {
      setInvitingReviewer(false);
    }
  };

  const issueResetToken = async (userId: string) => {
    setResettingReviewerId(userId);
    try {
      const result = await api.post<{ activationToken: string }>(
        `/v1/orgs/${orgId}/settings/team/users/${userId}/reset-password`,
      );
      setTokenNotice(`Password reset token: ${result.activationToken}`);
      setToast('Password reset token issued. Deliver it securely.');
    } finally {
      setResettingReviewerId(null);
    }
  };

  const requestUpgrade = async () => {
    setRequestingUpgrade(true);
    try {
      await api.post(`/v1/orgs/${orgId}/settings/plan/upgrade-request`, upgradeDraft);
      setUpgradeDraft({ targetPlanCode: '', reason: '' });
      setToast('Upgrade request submitted to super admin.');
    } finally {
      setRequestingUpgrade(false);
    }
  };

  const renderSection = () => {
    if (activeSection === 'account') {
      return (
        <section className="rounded-card border border-border bg-surface p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-brand" />
            <h2 className="text-base font-semibold text-ink">Account profile</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <TextField
              label="Display name"
              value={source.profile.displayName}
              onChange={(e) => setProfileDraft({ displayName: e.target.value })}
            />
            <TextField label="Email" value={data.account.user.email} readOnly disabled />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={saveProfile} disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save profile'}</Button>
            <Button variant="secondary" onClick={() => setProfileDraft(null)} disabled={savingProfile}>Reset</Button>
          </div>
          <p className="text-xs text-ink-secondary">
            Last step-up confirmation: {new Date(data.account.session.steppedUpAt).toLocaleString()}
          </p>
        </section>
      );
    }

    if (activeSection === 'security') {
      return (
        <section className="rounded-card border border-border bg-surface p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand" />
            <h2 className="text-base font-semibold text-ink">Security and sessions</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge tone={data.account.user.mfaEnrolled ? 'success' : 'warning'}>
              {data.account.user.mfaEnrolled ? 'MFA enrolled' : 'MFA not enrolled'}
            </StatusBadge>
            <StatusBadge tone="neutral">Password change revokes other sessions</StatusBadge>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <TextField
              label="Current password"
              type="password"
              value={passwordDraft.currentPassword}
              onChange={(e) => setPasswordDraft((p) => ({ ...p, currentPassword: e.target.value }))}
            />
            <TextField
              label="New password"
              type="password"
              value={passwordDraft.newPassword}
              onChange={(e) => setPasswordDraft((p) => ({ ...p, newPassword: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              icon={<KeyRound className="h-4 w-4" />}
              onClick={changePassword}
              disabled={changingPassword || !passwordDraft.currentPassword || !passwordDraft.newPassword}
            >
              {changingPassword ? 'Updating…' : 'Change password'}
            </Button>
            <Button variant="secondary" onClick={revokeOtherSessions} disabled={revokingSessions}>
              {revokingSessions ? 'Revoking…' : 'Revoke other sessions'}
            </Button>
          </div>
        </section>
      );
    }

    if (activeSection === 'reviewers') {
      return (
        <section className="rounded-card border border-border bg-surface p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-brand" />
            <h2 className="text-base font-semibold text-ink">Reviewer management</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <TextField
              label="Reviewer full name"
              value={reviewerDraft.displayName}
              onChange={(e) => setReviewerDraft((r) => ({ ...r, displayName: e.target.value }))}
            />
            <TextField
              label="Reviewer email"
              type="email"
              value={reviewerDraft.email}
              onChange={(e) => setReviewerDraft((r) => ({ ...r, email: e.target.value }))}
            />
          </div>
          <Button
            onClick={inviteReviewer}
            disabled={invitingReviewer || !reviewerDraft.displayName || !reviewerDraft.email}
          >
            {invitingReviewer ? 'Inviting…' : 'Add new reviewer'}
          </Button>
          <div className="space-y-2 pt-2">
            {data.reviewers.items.map((reviewer) => (
              <div key={reviewer.id} className="rounded-control border border-border p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{reviewer.display_name}</p>
                  <p className="text-xs text-ink-secondary truncate">{reviewer.email}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge tone={reviewer.mfa_enrolled ? 'success' : 'warning'}>
                    {reviewer.mfa_enrolled ? 'MFA' : 'No MFA'}
                  </StatusBadge>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => issueResetToken(reviewer.id)}
                    disabled={resettingReviewerId === reviewer.id}
                  >
                    {resettingReviewerId === reviewer.id ? 'Issuing…' : 'Reset password'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      );
    }

    if (activeSection === 'organisation') {
      return (
        <section className="rounded-card border border-border bg-surface p-5 space-y-4">
          <h2 className="text-base font-semibold text-ink">Organisation profile</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <TextField
              label="Organisation name"
              value={source.organisation.name}
              onChange={(e) => setOrgDraft({ ...source.organisation, name: e.target.value })}
            />
            <TextField label="Slug" value={data.organisation.slug} readOnly disabled />
            <TextField
              label="Country code"
              value={source.organisation.countryCode}
              onChange={(e) => setOrgDraft({ ...source.organisation, countryCode: e.target.value.toUpperCase() })}
              placeholder="DE"
              maxLength={2}
            />
            <TextField label="Status" value={data.organisation.status} readOnly disabled />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={saveOrganisation} disabled={savingOrg}>{savingOrg ? 'Saving…' : 'Save organisation'}</Button>
            <Button variant="secondary" onClick={() => setOrgDraft(null)} disabled={savingOrg}>Reset</Button>
          </div>
        </section>
      );
    }

    if (activeSection === 'plan') {
      return (
        <section className="rounded-card border border-border bg-surface p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" />
            <h2 className="text-base font-semibold text-ink">Plan and upgrades</h2>
          </div>
          <InlineNotice tone="info">
            <span>Plan changes require super-admin approval and are rendered in Platform pending approvals.</span>
          </InlineNotice>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-control border border-border bg-surface-subtle p-3">
              <p className="text-xs uppercase tracking-wide text-ink-secondary">Current plan</p>
              <p className="text-sm font-semibold text-ink mt-1">{data.plan.plan?.code ?? 'Baseline (no assigned paid plan)'}</p>
            </div>
            <div className="rounded-control border border-border bg-surface-subtle p-3">
              <p className="text-xs uppercase tracking-wide text-ink-secondary">Usage snapshot</p>
              <p className="text-sm text-ink mt-1">{data.plan.usage.activeAssessments} active assessments</p>
              <p className="text-sm text-ink">{data.plan.usage.orgUsers} org users</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <TextField
              label="Target plan code"
              value={upgradeDraft.targetPlanCode}
              onChange={(e) => setUpgradeDraft((d) => ({ ...d, targetPlanCode: e.target.value }))}
              placeholder="enterprise-pro"
            />
            <SelectField
              label="Quick reason"
              value={upgradeDraft.reason ? 'custom' : 'none'}
              onChange={(e) => {
                if (e.target.value === 'none') {
                  setUpgradeDraft((d) => ({ ...d, reason: '' }));
                  return;
                }
                if (e.target.value === 'capacity') {
                  setUpgradeDraft((d) => ({ ...d, reason: 'Need higher user and active-assessment limits for upcoming hiring volume.' }));
                  return;
                }
                if (e.target.value === 'modules') {
                  setUpgradeDraft((d) => ({ ...d, reason: 'Need additional modules (intelligence/learning/workflow insights) for cross-team rollout.' }));
                }
              }}
              options={[
                { value: 'none', label: 'Select template (optional)' },
                { value: 'capacity', label: 'Capacity limits' },
                { value: 'modules', label: 'Additional modules' },
                { value: 'custom', label: 'Custom reason below' },
              ]}
            />
          </div>
          <TextArea
            label="Upgrade request rationale"
            value={upgradeDraft.reason}
            onChange={(e) => setUpgradeDraft((d) => ({ ...d, reason: e.target.value }))}
            placeholder="Explain what is blocked and which modules/limits you need."
          />
          <Button
            onClick={requestUpgrade}
            disabled={requestingUpgrade || !upgradeDraft.targetPlanCode || upgradeDraft.reason.length < 8}
          >
            {requestingUpgrade ? 'Submitting…' : 'Request plan upgrade'}
          </Button>
        </section>
      );
    }

    return (
      <section className="rounded-card border border-border bg-surface p-5 space-y-4">
        <h2 className="text-base font-semibold text-ink">Retention policy</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <TextField
            label="Evidence retention days"
            type="number"
            min={1}
            value={source.retention.evidence}
            onChange={(e) => setRetentionDraft({ ...source.retention, evidence: e.target.value })}
          />
          <TextField
            label="Integrity-signal retention days"
            type="number"
            min={1}
            value={source.retention.integrity}
            onChange={(e) => setRetentionDraft({ ...source.retention, integrity: e.target.value })}
          />
          <TextField
            label="Audit retention days"
            type="number"
            min={1}
            value={source.retention.audit}
            onChange={(e) => setRetentionDraft({ ...source.retention, audit: e.target.value })}
          />
          <SelectField
            label="Deletion mode"
            value={source.retention.mode}
            onChange={(e) =>
              setRetentionDraft({
                ...source.retention,
                mode: e.target.value as 'hard_delete' | 'anonymise_then_delete',
              })
            }
            options={[
              { value: 'hard_delete', label: 'Hard delete' },
              { value: 'anonymise_then_delete', label: 'Anonymise then delete' },
            ]}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={saveRetention} disabled={savingRetention}>{savingRetention ? 'Saving…' : 'Save policy'}</Button>
          <Button variant="secondary" onClick={() => setRetentionDraft(null)} disabled={savingRetention}>Reset</Button>
        </div>
        <p className="text-xs text-ink-secondary leading-relaxed">{data.retention.schedulingNote}</p>
      </section>
    );
  };

  return (
    <AppShell navGroups={employerNav(orgId ?? '')} maxWidth="dashboard">
      <PageHeader
        title="Organisation settings"
        description="All settings are section-based, clickable, and editable."
        breadcrumbs={[{ label: 'Home', to: `/org/${orgId}` }, { label: 'Settings' }]}
        status={<StatusBadge tone="info">Org admin controls</StatusBadge>}
      />

      <div className="space-y-6">
        <InlineNotice tone="info">
          <span>
            Sensitive actions use secure server-side checks. For super-admin decisions, see <Link className="text-brand hover:underline" to="/platform/approvals">Platform pending approvals</Link>.
          </span>
        </InlineNotice>

        {tokenNotice && (
          <InlineNotice tone="warning">
            <span>{tokenNotice}</span>
          </InlineNotice>
        )}

        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-card border border-border bg-surface p-3">
            <nav aria-label="Settings sections" className="space-y-1">
              {sectionMeta.map((item) => {
                const overview = overviewById.get(item.mapToOverview);
                const isActive = activeSection === item.id;
                return (
                  <Link
                    key={item.id}
                    to={`/org/${orgId}/settings/${item.id}`}
                    className={`block rounded-control border px-3 py-2.5 transition-colors ${
                      isActive
                        ? 'border-brand bg-brand/10'
                        : 'border-transparent hover:border-border hover:bg-surface-subtle'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink">{item.label}</p>
                      {overview && <StatusBadge tone={statusTone(overview.status)}>{overview.status}</StatusBadge>}
                    </div>
                    <p className="text-xs text-ink-secondary mt-1">{item.description}</p>
                  </Link>
                );
              })}
            </nav>
          </aside>

          <div>{renderSection()}</div>
        </div>
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </AppShell>
  );
}
