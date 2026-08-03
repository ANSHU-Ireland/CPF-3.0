import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { KpiCard, TrendChart, SuppressedValue } from '@/components/ui/Display';
import { InlineNotice, LoadingState, ErrorState } from '@/components/ui/Feedback';
import { platformAdminNav } from '@/lib/routes';
import { api } from '@/lib/api';
import { useAsyncData } from '@/lib/useAsyncData';
import { Info } from 'lucide-react';

interface PlatformAnalyticsData {
  totalOrgs: number;
  totalUsers: number;
  totalCandidates: number;
  monthlySignups: Array<{ label: string; value: number }>;
  orgGrowth: number | string;
  suppressedOrgCount: number | string;
}

export default function PlatformAnalyticsPage() {
  const { status, data, error, refetch } = useAsyncData<PlatformAnalyticsData>(
    (_signal) => api.get('/v1/platform/analytics'),
    { deps: [] },
  );

  return (
    <AppShell navGroups={platformAdminNav} maxWidth="dashboard">
      <PageHeader
        title="Platform analytics"
        description="Cross-tenant metrics with k-anonymity suppression. Values representing fewer than 5 organisations are shown as '< 5 organisations'."
        breadcrumbs={[{ label: 'Platform overview', to: '/platform' }, { label: 'Analytics' }]}
      />

      <div className="mb-6">
        <InlineNotice tone="info">
          <Info className="h-4 w-4 flex-shrink-0" />
          <span>All cross-tenant figures respect k-anonymity. Suppressed values are never shown as zero — they read {'< 5 organisations'} to protect individual organisations.</span>
        </InlineNotice>
      </div>

      {status === 'loading' && <LoadingState label="Loading platform analytics…" />}
      {status === 'error' && <ErrorState error={error} onRetry={refetch} />}
      {status === 'success' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard label="Total organisations" value={data.totalOrgs} />
            <KpiCard label="Total users" value={data.totalUsers} />
            <KpiCard label="Total candidates" value={data.totalCandidates} />
            <KpiCard
              label="New orgs (this month)"
              value={typeof data.orgGrowth === 'number' ? data.orgGrowth : '< 5 organisations'}
              suppressed={typeof data.orgGrowth === 'string'}
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <TrendChart
              data={data.monthlySignups}
              label="Organisation signups per month"
              caption="Values under 5 are suppressed for k-anonymity."
            />
            <div className="rounded-card border border-border bg-surface p-5">
              <h3 className="text-sm font-medium text-ink mb-4">Suppressed metrics</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink-secondary">Organisations by plan tier</span>
                  <SuppressedValue metric={data.suppressedOrgCount} />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
