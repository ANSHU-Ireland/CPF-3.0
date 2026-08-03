import { KpiCard } from '@/components/ui/Display';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge, LoadingState, ErrorState } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { platformAdminNav } from '@/lib/routes';
import { api } from '@/lib/api';
import { useAsyncData } from '@/lib/useAsyncData';
import { Link } from 'react-router-dom';
import { Building2, LifeBuoy, ShieldCheck, ArrowRight } from 'lucide-react';

interface PlatformData {
  orgsByState: { active: number; suspended: number; provisioning: number };
  onboardingTasks: Array<{ id: string; label: string; orgName: string }>;
  planUsage: { totalOrgs: number; totalUsers: number; totalCandidates: number };
  supportRequests: number;
  platformControlStatus: { safeguardsActive: boolean; killSwitchActive: boolean };
}

export default function PlatformOverviewPage() {
  const { status, data, error, refetch } = useAsyncData<PlatformData>(
    (_signal) => api.get('/v1/platform/overview'),
    { deps: [] },
  );

  return (
    <AppShell navGroups={platformAdminNav} maxWidth="dashboard">
      <PageHeader
        title="Platform overview"
        description="Platform health, organisation onboarding, plan usage, and support status. Cross-tenant analytics are suppressed where cohort sizes are small."
        breadcrumbs={[{ label: 'Platform overview' }]}
        actions={<Button variant="secondary">View audit log</Button>}
      />

      {status === 'loading' && <LoadingState label="Loading platform overview…" />}
      {status === 'error' && <ErrorState error={error} onRetry={refetch} />}
      {status === 'success' && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <KpiCard label="Active organisations" value={data.orgsByState.active} hint="Currently operational" />
            <KpiCard label="Provisioning" value={data.orgsByState.provisioning} hint="Onboarding in progress" />
            <KpiCard label="Suspended" value={data.orgsByState.suspended} hint="Access paused" />
            <KpiCard label="Support requests" value={data.supportRequests} hint="Awaiting action" />
          </div>

          {/* Safeguards */}
          <div className="rounded-card border border-border bg-surface p-5 mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-status-success" />
                <div>
                  <h2 className="font-semibold text-ink">Platform safeguards</h2>
                  <p className="text-sm text-ink-secondary">AI kill-switch and platform controls</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge tone={data.platformControlStatus.safeguardsActive ? 'success' : 'danger'} dot>
                  Safeguards {data.platformControlStatus.safeguardsActive ? 'active' : 'inactive'}
                </StatusBadge>
                <StatusBadge tone={data.platformControlStatus.killSwitchActive ? 'danger' : 'success'} dot>
                  Kill switch {data.platformControlStatus.killSwitchActive ? 'engaged' : 'standby'}
                </StatusBadge>
              </div>
            </div>
          </div>

          {/* Onboarding tasks */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-ink mb-4">Onboarding tasks</h2>
            <div className="rounded-card border border-border bg-surface divide-y divide-border">
              {data.onboardingTasks.length === 0 ? (
                <p className="text-sm text-ink-secondary p-5 text-center">No pending onboarding tasks.</p>
              ) : (
                data.onboardingTasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between gap-4 p-4">
                    <div>
                      <p className="text-sm text-ink">{task.label}</p>
                      <p className="text-xs text-ink-secondary mt-0.5">{task.orgName}</p>
                    </div>
                    <Button size="sm" variant="ghost" icon={<ArrowRight className="h-4 w-4" />}>Review</Button>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Plan usage */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-ink mb-4">Plan usage</h2>
            <div className="grid grid-cols-3 gap-4">
              <KpiCard label="Total organisations" value={data.planUsage.totalOrgs} />
              <KpiCard label="Total users" value={data.planUsage.totalUsers} />
              <KpiCard label="Total candidates" value={data.planUsage.totalCandidates} />
            </div>
          </section>

          {/* Quick links */}
          <section>
            <h2 className="text-lg font-semibold text-ink mb-4">Manage</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { label: 'Organisations', icon: Building2, to: '/platform/organisations', desc: 'Directory and detail' },
                { label: 'Support access', icon: LifeBuoy, to: '/platform/support', desc: 'Just-in-time requests' },
                { label: 'Audit & exports', icon: ShieldCheck, to: '/platform/audit', desc: 'Chain verification' },
              ].map((link) => (
                <Link key={link.label} to={link.to} className="group rounded-card border border-border bg-surface p-4 hover:shadow-card transition-shadow">
                  <div className="flex items-center justify-between mb-2">
                    <link.icon className="h-5 w-5 text-brand" />
                    <ArrowRight className="h-4 w-4 text-ink-secondary group-hover:text-brand transition-colors" />
                  </div>
                  <p className="text-sm font-medium text-ink">{link.label}</p>
                  <p className="text-xs text-ink-secondary mt-1">{link.desc}</p>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
