import { useParams } from 'react-router-dom';
import { ClipboardList, Users, ClipboardCheck, ShieldAlert, ArrowRight, CheckCircle2, Circle } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { KpiCard } from '@/components/ui/Display';
import { StatusBadge } from '@/components/ui/Feedback';
import { employerNav } from '@/lib/routes';
import { useAuth } from '@/lib/auth';
import { useAsyncData } from '@/lib/useAsyncData';
import { api } from '@/lib/api';
import { LoadingState, ErrorState } from '@/components/ui/Feedback';

interface HomeData {
  setupChecklist: Array<{ id: string; label: string; done: boolean }>;
  workflowCounts: { pendingReviews: number; openInvitations: number; dueThisWeek: number; unassignedReviews: number };
  recentActivity: Array<{ id: string; title: string; timestamp: string; tone: 'neutral' | 'success' | 'warning' }>;
}

export default function EmployerHomePage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { session } = useAuth();
  const { status, data, error, refetch } = useAsyncData<HomeData>(
    (_signal) => api.get(`/v1/orgs/${orgId}/home`),
    { deps: [orgId] },
  );

  if (status === 'loading') {
    return (
      <AppShell navGroups={employerNav(orgId ?? '')} maxWidth="dashboard">
        <LoadingState label="Loading your dashboard…" />
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

  const home = data!;
  const checklistDone = home.setupChecklist.filter((i) => i.done).length;
  const checklistTotal = home.setupChecklist.length;

  return (
    <AppShell navGroups={employerNav(orgId ?? '')} maxWidth="dashboard">
      <PageHeader
        title={`Welcome, ${session?.displayName?.split(' ')[0] ?? ''}`}
        description="Your assessment coordination hub. Set up assessments, coordinate human review, and monitor readiness — by workflow priority, not candidate ranking."
        breadcrumbs={[{ label: 'Home' }]}
      />

      {/* Setup checklist */}
      <section className="mb-8">
        <div className="rounded-card border border-border bg-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-ink">Setup checklist</h2>
            <StatusBadge tone={checklistDone === checklistTotal ? 'success' : 'warning'}>
              {checklistDone}/{checklistTotal} complete
            </StatusBadge>
          </div>
          <ul className="space-y-2">
            {home.setupChecklist.map((item) => (
              <li key={item.id} className="flex items-center gap-3">
                {item.done ? (
                  <CheckCircle2 className="h-5 w-5 text-status-success flex-shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-ink-secondary flex-shrink-0" />
                )}
                <span className={`text-sm ${item.done ? 'text-ink-secondary line-through' : 'text-ink'}`}>
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Workflow counts — neutral, no candidate ranking */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-ink mb-4">Workflow overview</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Pending reviews" value={home.workflowCounts.pendingReviews} hint="Awaiting reviewer action" />
          <KpiCard label="Open invitations" value={home.workflowCounts.openInvitations} hint="Sent, not yet started" />
          <KpiCard label="Due this week" value={home.workflowCounts.dueThisWeek} hint="By due date" />
          <KpiCard label="Unassigned reviews" value={home.workflowCounts.unassignedReviews} hint="Need a reviewer" />
        </div>
      </section>

      {/* Recent activity */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-ink mb-4">Recent activity</h2>
        <div className="rounded-card border border-border bg-surface divide-y divide-border">
          {home.recentActivity.length === 0 ? (
            <p className="text-sm text-ink-secondary p-5 text-center">No recent activity to show.</p>
          ) : (
            home.recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-3">
                  <span className={`h-2 w-2 rounded-full ${
                    activity.tone === 'success' ? 'bg-status-success'
                      : activity.tone === 'warning' ? 'bg-status-warning'
                      : 'bg-ink-secondary'
                  }`} aria-hidden />
                  <span className="text-sm text-ink">{activity.title}</span>
                </div>
                <time className="text-xs text-ink-secondary flex-shrink-0">{activity.timestamp}</time>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Quick links */}
      <section>
        <h2 className="text-lg font-semibold text-ink mb-4">Quick actions</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Assessment pipeline', icon: ClipboardList, to: `/org/${orgId}/sessions`, desc: 'View and manage sessions' },
            { label: 'Candidates', icon: Users, to: `/org/${orgId}/candidates`, desc: 'Directory and invitations' },
            { label: 'Review allocation', icon: ClipboardCheck, to: `/org/${orgId}/reviews`, desc: 'Assign and track reviews' },
            { label: 'Compliance hub', icon: ShieldAlert, to: `/org/${orgId}/compliance`, desc: 'Readiness and audit' },
          ].map((link) => (
            <a
              key={link.label}
              href={link.to}
              className="group rounded-card border border-border bg-surface p-4 hover:shadow-card transition-shadow"
            >
              <div className="flex items-center justify-between mb-2">
                <link.icon className="h-5 w-5 text-brand" />
                <ArrowRight className="h-4 w-4 text-ink-secondary group-hover:text-brand transition-colors" />
              </div>
              <p className="text-sm font-medium text-ink">{link.label}</p>
              <p className="text-xs text-ink-secondary mt-1">{link.desc}</p>
            </a>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
