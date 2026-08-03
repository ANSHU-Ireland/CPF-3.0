import { useParams } from 'react-router-dom';
import { Info } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { KpiCard, TrendChart, SuppressedValue } from '@/components/ui/Display';
import { InlineNotice, LoadingState, ErrorState } from '@/components/ui/Feedback';
import { DefinitionTooltip } from '@/components/ui/Feedback';
import { employerNav } from '@/lib/routes';
import { api } from '@/lib/api';
import { useAsyncData } from '@/lib/useAsyncData';

interface AnalyticsData {
  totalAssessments: number;
  activeReviewers: number;
  avgReviewTime: number;
  profilesIssued: number;
  monthlyTrend: Array<{ label: string; value: number }>;
  orgCount: number;
}

export default function AnalyticsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { status, data, error, refetch } = useAsyncData<AnalyticsData>(
    (_signal) => api.get(`/v1/orgs/${orgId}/analytics`),
    { deps: [orgId] },
  );

  return (
    <AppShell navGroups={employerNav(orgId ?? '')} maxWidth="dashboard">
      <PageHeader
        title="Analytics"
        description="Workflow and operational metrics. All figures use clear definitions — no candidate ranking or comparison by merit."
        breadcrumbs={[{ label: 'Home', to: `/org/${orgId}` }, { label: 'Analytics' }]}
      />

      <div className="mb-6">
        <InlineNotice tone="info">
          <Info className="h-4 w-4 flex-shrink-0" />
          <span>
            Metrics here describe <DefinitionTooltip term="workflow volume" definition="The number of assessment sessions at each stage of the pipeline, not candidate quality or ranking." /> and operational throughput. Small cohort figures are suppressed to protect individual privacy.
          </span>
        </InlineNotice>
      </div>

      {status === 'loading' && <LoadingState label="Loading analytics…" />}
      {status === 'error' && <ErrorState error={error} onRetry={refetch} />}
      {status === 'success' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard label="Total assessments" value={data.totalAssessments} hint="All time" />
            <KpiCard label="Active reviewers" value={data.activeReviewers} hint="Currently assigned" />
            <KpiCard label="Avg review time" value={`${data.avgReviewTime} days`} hint="From submission to profile" />
            <KpiCard label="Profiles issued" value={data.profilesIssued} hint="This year" />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <TrendChart
              data={data.monthlyTrend}
              label="Assessments per month"
              caption="Based on session start date. Values under 5 are suppressed."
            />
            <div className="rounded-card border border-border bg-surface p-5">
              <h3 className="text-sm font-medium text-ink mb-4">Organisation context</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink-secondary">Organisations in group</span>
                  <SuppressedValue metric={data.orgCount} />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
