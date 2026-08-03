import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Circle,
  Link2,
  Trash2,
  Plus,
  Sparkles,
  ShieldAlert,
  Menu,
  Lock,
  Ban,
  CheckCheck,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { reviewerNav } from '@/lib/routes';
import { api, isApiError } from '@/lib/api';
import { useAsyncData } from '@/lib/useAsyncData';
import { Button, IconButton } from '@/components/ui/Button';
import { TextArea, TextField } from '@/components/ui/Form';
import { StatusBadge, InlineNotice, LoadingState, ErrorState, Alert, EmptyState } from '@/components/ui/Feedback';
import { Overlay, ConfirmationDialog } from '@/components/ui/Overlay';
import { SaveStatus } from '@/components/ui/Status';
import { Tabs } from '@/components/ui/Navigation';
import type { ReviewDetail, ReviewCriterion, ReviewDimension } from '@/lib/types';

type Pane = 'navigator' | 'evidence' | 'criterion';

export default function ReviewerWorkspacePage() {
  const { reviewId } = useParams<{ reviewId: string }>();
  const navigate = useNavigate();
  const [activePane, setActivePane] = useState<Pane | null>(null);
  const [activeCriterionId, setActiveCriterionId] = useState<string | null>(null);
  const [activeTab] = useState<'evidence' | 'integrity'>('evidence');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [finaliseOpen, setFinaliseOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [scores, setScores] = useState<Record<string, string | null>>({});
  const [rationales, setRationales] = useState<Record<string, string>>({});
  const [limitations, setLimitations] = useState<Record<string, string>>({});

  const { status, data, error, refetch } = useAsyncData<ReviewDetail>(
    (_signal) => api.get(`/v1/reviews/${reviewId}`),
    { deps: [reviewId] },
  );

  // Set initial active criterion
  const firstCriterion = useMemo(() => {
    if (!data) return null;
    return data.dimensions.flatMap((d: ReviewDimension) => d.criteria)[0] ?? null;
  }, [data]);

  const activeCriterion = useMemo(() => {
    if (!data) return null;
    return data.dimensions.flatMap((d: ReviewDimension) => d.criteria).find((c: ReviewCriterion) => c.id === (activeCriterionId ?? firstCriterion?.id)) ?? null;
  }, [data, activeCriterionId, firstCriterion]);

  const allCriteria = useMemo(() => data?.dimensions.flatMap((d: ReviewDimension) => d.criteria) ?? [], [data]);
  const scoredCount = allCriteria.filter((c: ReviewCriterion) => scores[c.id] !== undefined && scores[c.id] !== null).length;
  const totalCount = allCriteria.length;
  const isComplete = scoredCount === totalCount && totalCount > 0;

  const handleScore = useCallback((criterionId: string, value: string) => {
    setScores((prev) => ({ ...prev, [criterionId]: value }));
  }, []);

  const handleClearScore = useCallback((criterionId: string) => {
    setScores((prev) => ({ ...prev, [criterionId]: null }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!activeCriterion) return;
    setSaveState('saving');
    try {
      await api.put(`/v1/reviews/${reviewId}/criteria/${activeCriterion.id}`, {
        score: scores[activeCriterion.id] ?? null,
        rationale: rationales[activeCriterion.id] ?? '',
        limitations: limitations[activeCriterion.id] ?? '',
      });
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [activeCriterion, reviewId, scores, rationales, limitations]);

  const handleAiAssist = useCallback(async () => {
    if (!activeCriterion) return;
    setAiLoading(true);
    try {
      await api.post(`/v1/reviews/${reviewId}/criteria/${activeCriterion.id}/ai-assist`);
    } catch {
      // handled by UI state
    } finally {
      setAiLoading(false);
    }
  }, [activeCriterion, reviewId]);

  // === Loading / error ===
  if (status === 'loading') {
    return (
      <AppShell navGroups={reviewerNav} maxWidth="full">
        <LoadingState label="Loading review workspace…" />
      </AppShell>
    );
  }

  if (status === 'error') {
    return (
      <AppShell navGroups={reviewerNav} maxWidth="full">
        <ErrorState error={error} onRetry={refetch} />
      </AppShell>
    );
  }

  const review = data;

  return (
    <AppShell navGroups={reviewerNav} maxWidth="full">
      <PageHeader
        title="Review workspace"
        description={`${review.candidateName} — ${review.assessmentTitle}`}
        breadcrumbs={[{ label: 'My queue', to: '/reviews/queue' }, { label: 'Review' }]}
        status={<StatusBadge tone={isComplete ? 'success' : 'warning'} dot>{scoredCount}/{totalCount} scored</StatusBadge>}
        actions={
          <>
            <SaveStatus state={saveState} />
            <Button variant="secondary" size="sm" onClick={handleSave}>Save</Button>
            <Button size="sm" disabled={!isComplete} onClick={() => setFinaliseOpen(true)}>Finalise review</Button>
          </>
        }
      />

      {/* Desktop three-pane layout */}
      <div className="hidden lg:grid grid-cols-[260px_1fr_420px] gap-4 h-[calc(100vh-220px)]">
        {/* Left: Criterion navigator */}
        <CriterionNavigator
          dimensions={review.dimensions}
          scores={scores}
          activeId={activeCriterionId ?? firstCriterion?.id ?? ''}
          onSelect={setActiveCriterionId}
        />

        {/* Centre: Evidence */}
        <EvidencePane
          review={review}
          activeTab={activeTab}
        />

        {/* Right: Scoring */}
        {activeCriterion && (
          <ScoringPane
            criterion={activeCriterion}
            score={scores[activeCriterion.id] ?? activeCriterion.selectedScore}
            rationale={rationales[activeCriterion.id] ?? activeCriterion.rationale ?? ''}
            limitations={limitations[activeCriterion.id] ?? activeCriterion.limitations ?? ''}
            onScore={(v) => handleScore(activeCriterion.id, v)}
            onClearScore={() => handleClearScore(activeCriterion.id)}
            onRationaleChange={(v) => setRationales((prev) => ({ ...prev, [activeCriterion.id]: v }))}
            onLimitationsChange={(v) => setLimitations((prev) => ({ ...prev, [activeCriterion.id]: v }))}
            onSave={handleSave}
            onAiAssist={handleAiAssist}
            aiLoading={aiLoading}
            aiEnabled={review.aiAssistEnabled}
            aiBudgetRemaining={review.aiAssistBudgetRemaining}
          />
        )}
      </div>

      {/* Tablet: centre pane with collapsible navigator */}
      <div className="hidden md:grid lg:hidden grid-cols-1 gap-4">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={<Menu className="h-4 w-4" />} onClick={() => setActivePane('navigator')}>
            Criteria
          </Button>
          <Button variant="secondary" size="sm" icon={<Menu className="h-4 w-4" />} onClick={() => setActivePane('criterion')}>
            Scoring
          </Button>
        </div>
        <EvidencePane review={review} activeTab={activeTab} />
        {activeCriterion && (
          <ScoringPane
            criterion={activeCriterion}
            score={scores[activeCriterion.id] ?? activeCriterion.selectedScore}
            rationale={rationales[activeCriterion.id] ?? activeCriterion.rationale ?? ''}
            limitations={limitations[activeCriterion.id] ?? activeCriterion.limitations ?? ''}
            onScore={(v) => handleScore(activeCriterion.id, v)}
            onClearScore={() => handleClearScore(activeCriterion.id)}
            onRationaleChange={(v) => setRationales((prev) => ({ ...prev, [activeCriterion.id]: v }))}
            onLimitationsChange={(v) => setLimitations((prev) => ({ ...prev, [activeCriterion.id]: v }))}
            onSave={handleSave}
            onAiAssist={handleAiAssist}
            aiLoading={aiLoading}
            aiEnabled={review.aiAssistEnabled}
            aiBudgetRemaining={review.aiAssistBudgetRemaining}
          />
        )}
      </div>

      {/* Mobile: one pane at a time with progress header */}
      <div className="md:hidden">
        <div className="sticky top-0 z-20 bg-surface border border-border rounded-card p-3 mb-4 flex items-center justify-between">
          <span className="text-sm font-medium text-ink">{scoredCount}/{totalCount} scored</span>
          <div className="flex gap-1">
            <IconButton label="Criteria list" size="sm" onClick={() => setActivePane('navigator')}>
              <Menu className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
        {activePane === 'navigator' && (
          <CriterionNavigator
            dimensions={review.dimensions}
            scores={scores}
            activeId={activeCriterionId ?? firstCriterion?.id ?? ''}
            onSelect={(id) => { setActiveCriterionId(id); setActivePane(null); }}
          />
        )}
        {activePane !== 'navigator' && (
          <>
            <EvidencePane review={review} activeTab={activeTab} />
            {activeCriterion && (
              <ScoringPane
                criterion={activeCriterion}
                score={scores[activeCriterion.id] ?? activeCriterion.selectedScore}
                rationale={rationales[activeCriterion.id] ?? activeCriterion.rationale ?? ''}
                limitations={limitations[activeCriterion.id] ?? activeCriterion.limitations ?? ''}
                onScore={(v) => handleScore(activeCriterion.id, v)}
                onClearScore={() => handleClearScore(activeCriterion.id)}
                onRationaleChange={(v) => setRationales((prev) => ({ ...prev, [activeCriterion.id]: v }))}
                onLimitationsChange={(v) => setLimitations((prev) => ({ ...prev, [activeCriterion.id]: v }))}
                onSave={handleSave}
                onAiAssist={handleAiAssist}
                aiLoading={aiLoading}
                aiEnabled={review.aiAssistEnabled}
                aiBudgetRemaining={review.aiAssistBudgetRemaining}
              />
            )}
          </>
        )}
      </div>

      {/* Finalise dialog */}
      <Overlay
        open={finaliseOpen}
        onClose={() => setFinaliseOpen(false)}
        title="Finalise review — readiness check"
        description="Review the summary below before finalising. The finalise button stays disabled until all criteria are scored."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFinaliseOpen(false)}>Cancel</Button>
            <Button
              disabled={!isComplete}
              onClick={async () => {
                try {
                  await api.post(`/v1/reviews/${reviewId}/finalise`);
                  setFinaliseOpen(false);
                  navigate('/reviews/queue');
                } catch (err) {
                  if (isApiError(err)) {
                    // Surface 409/422 reasons
                  }
                }
              }}
            >
              Confirm and finalise
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="rounded-card bg-surface-subtle p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-semibold text-ink-secondary uppercase">Criteria scored</p>
                <p className="text-ink mt-1">{scoredCount} of {totalCount}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-ink-secondary uppercase">Second review</p>
                <p className="text-ink mt-1">{review.secondReviewRequired ? 'Required' : 'Not required'}</p>
              </div>
            </div>
          </div>

          {scoredCount < totalCount && (
            <Alert tone="warning" title="Missing criteria">
              {totalCount - scoredCount} criteria have not been scored. You must score all criteria before finalising.
            </Alert>
          )}

          {review.integritySignals.length > 0 && (
            <InlineNotice tone="warning">
              <ShieldAlert className="h-4 w-4 flex-shrink-0" />
              <span>{review.integritySignals.length} integrity signal(s) are recorded. These are context for human interpretation and are separate from capability evidence.</span>
            </InlineNotice>
          )}

          <div>
            <h3 className="text-sm font-semibold text-ink mb-2">Criteria summary</h3>
            <ul className="space-y-1.5">
              {allCriteria.map((c: ReviewCriterion) => (
                <li key={c.id} className="flex items-center gap-2 text-sm">
                  {scores[c.id] ? <CheckCircle2 className="h-4 w-4 text-status-success" /> : <Circle className="h-4 w-4 text-ink-secondary" />}
                  <span className={scores[c.id] ? 'text-ink' : 'text-ink-secondary'}>{c.title}</span>
                  {scores[c.id] && <span className="text-xs text-ink-secondary ml-auto">{scores[c.id]}</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Overlay>
    </AppShell>
  );
}

// === Criterion Navigator ===
function CriterionNavigator({
  dimensions,
  scores,
  activeId,
  onSelect,
}: {
  dimensions: ReviewDimension[];
  scores: Record<string, string | null>;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav aria-label="Criteria" className="rounded-card border border-border bg-surface overflow-y-auto">
      <div className="p-3 border-b border-border sticky top-0 bg-surface">
        <p className="text-xs font-semibold text-ink-secondary uppercase tracking-wide">Criteria</p>
        <p className="text-sm text-ink mt-0.5">
          {Object.values(scores).filter((v) => v).length} scored
        </p>
      </div>
      <div className="p-2">
        {dimensions.map((dim) => (
          <div key={dim.id} className="mb-3">
            <p className="px-2 py-1.5 text-xs font-semibold text-ink-secondary">{dim.title}</p>
            <ul>
              {dim.criteria.map((crit) => {
                const scored = scores[crit.id] !== undefined && scores[crit.id] !== null;
                const isActive = crit.id === activeId;
                return (
                  <li key={crit.id}>
                    <button
                      onClick={() => onSelect(crit.id)}
                      aria-current={isActive ? 'true' : undefined}
                      className={`flex items-center gap-2 w-full px-2 py-2 rounded-control text-left text-sm transition-colors min-h-[40px] ${
                        isActive ? 'bg-brand/10 text-brand' : 'text-ink hover:bg-surface-subtle'
                      }`}
                    >
                      {scored ? (
                        <CheckCircle2 className="h-4 w-4 text-status-success flex-shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-ink-secondary flex-shrink-0" />
                      )}
                      <span className="truncate">{crit.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

// === Evidence Pane ===
function EvidencePane({
  review,
  activeTab,
}: {
  review: ReviewDetail;
  activeTab: 'evidence' | 'integrity';
}) {
  const allEvidence = review.dimensions.flatMap((d) => d.criteria).flatMap((c) => c.evidenceRefs);

  return (
    <div className="rounded-card border border-border bg-surface overflow-hidden flex flex-col">
      <Tabs
        items={[
          {
            id: 'evidence',
            label: 'Evidence',
            content: (
              <div className="space-y-3">
                {allEvidence.length === 0 ? (
                  <EmptyState title="No evidence available" description="Evidence will appear here when the candidate submits their assessment." />
                ) : (
                  allEvidence.map((ev) => (
                    <div key={ev.id} className="rounded-card border border-border p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-mono text-ink-secondary">Evidence ID: {ev.id}</span>
                        <StatusBadge tone={ev.type === 'metadata' ? 'warning' : 'neutral'}>{ev.type}</StatusBadge>
                      </div>
                      <p className="text-sm text-ink">{ev.label}</p>
                      <time className="text-xs text-ink-secondary block mt-1">{ev.timestamp}</time>
                    </div>
                  ))
                )}
              </div>
            ),
          },
          {
            id: 'integrity',
            label: 'Integrity signals',
            badge: review.integritySignals.length || undefined,
            content: (
              <div className="space-y-4">
                <Alert tone="warning" title="Integrity signals require human interpretation">
                  These signals are contextual information, not capability evidence. They are never preselected as evidence and must not influence capability scoring without careful human judgement.
                </Alert>
                {review.integritySignals.length === 0 ? (
                  <EmptyState title="No integrity signals" description="No integrity context has been recorded for this assessment." />
                ) : (
                  review.integritySignals.map((sig) => (
                    <div key={sig.id} className="rounded-card border border-status-warning/30 bg-status-warning/5 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-ink">{sig.type}</span>
                        <time className="text-xs text-ink-secondary">{sig.timestamp}</time>
                      </div>
                      <p className="text-sm text-ink-secondary">{sig.description}</p>
                    </div>
                  ))
                )}
              </div>
            ),
          },
        ]}
        initialTabId={activeTab}
      />
    </div>
  );
}

// === Scoring Pane ===
function ScoringPane({
  criterion,
  score,
  rationale,
  limitations,
  onScore,
  onClearScore,
  onRationaleChange,
  onLimitationsChange,
  onSave,
  onAiAssist,
  aiLoading,
  aiEnabled,
  aiBudgetRemaining,
}: {
  criterion: ReviewCriterion;
  score: string | null;
  rationale: string;
  limitations: string;
  onScore: (value: string) => void;
  onClearScore: () => void;
  onRationaleChange: (v: string) => void;
  onLimitationsChange: (v: string) => void;
  onSave: () => void;
  onAiAssist: () => void;
  aiLoading: boolean;
  aiEnabled: boolean;
  aiBudgetRemaining: boolean;
}) {
  const [claimText, setClaimText] = useState('');
  const [claims, setClaims] = useState(criterion.claims);
  const [claimDeleteId, setClaimDeleteId] = useState<string | null>(null);

  return (
    <div className="rounded-card border border-border bg-surface overflow-y-auto">
      <div className="p-4 border-b border-border">
        <h2 className="font-semibold text-ink">{criterion.title}</h2>
        <p className="text-sm text-ink-secondary mt-1">{criterion.description}</p>
      </div>

      <div className="p-4 space-y-5">
        {/* Score options */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-ink">Score</h3>
            {score && (
              <button onClick={onClearScore} className="text-xs text-ink-secondary hover:text-status-danger">
                Clear score
              </button>
            )}
          </div>
          <div className="space-y-2">
            {criterion.scoreOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onScore(opt.value)}
                aria-pressed={score === opt.value}
                className={`flex items-start gap-3 w-full p-3 rounded-control border text-left transition-colors min-h-[44px] ${
                  score === opt.value
                    ? 'border-brand bg-brand/5'
                    : 'border-border hover:bg-surface-subtle'
                }`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 flex-shrink-0 mt-0.5 ${
                  score === opt.value ? 'border-brand bg-brand' : 'border-border'
                }`}>
                  {score === opt.value && <span className="h-2 w-2 rounded-full bg-white" />}
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">{opt.label} ({opt.value})</p>
                  <p className="text-xs text-ink-secondary mt-0.5">{opt.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Rationale */}
        <TextArea
          label="Rationale"
          value={rationale}
          onChange={(e) => onRationaleChange(e.target.value)}
          placeholder="Explain your scoring decision, referencing specific evidence…"
          hint="Link your rationale to evidence using the claim editor below."
        />

        {/* Limitations */}
        <TextArea
          label="Limitations"
          value={limitations}
          onChange={(e) => onLimitationsChange(e.target.value)}
          placeholder="Note any limitations in the evidence or your confidence in the score…"
        />

        {/* Claims */}
        <div>
          <h3 className="text-sm font-semibold text-ink mb-2">Claims</h3>
          {claims.length > 0 && (
            <ul className="space-y-2 mb-3">
              {claims.map((claim) => (
                <li key={claim.id} className="rounded-control border border-border p-3 group">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-ink flex-1">{claim.text}</p>
                    <button
                      onClick={() => setClaimDeleteId(claim.id)}
                      className="text-ink-secondary hover:text-status-danger opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Delete claim"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {claim.evidenceRefIds.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {claim.evidenceRefIds.map((refId) => (
                        <span key={refId} className="inline-flex items-center gap-1 text-xs text-brand bg-brand/5 rounded-full px-2 py-0.5">
                          <Link2 className="h-3 w-3" /> {refId}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <TextField
              label="Add a claim"
              value={claimText}
              onChange={(e) => setClaimText(e.target.value)}
              placeholder="Write a source-linked claim…"
              className="flex-1"
            />
            <div className="flex items-end">
              <Button
                size="md"
                variant="secondary"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  if (!claimText.trim()) return;
                  setClaims((prev) => [...prev, { id: `claim-${Date.now()}`, text: claimText, evidenceRefIds: [] }]);
                  setClaimText('');
                }}
              >
                Add
              </Button>
            </div>
          </div>
        </div>

        {/* AI assist */}
        {aiEnabled && (
          <div className="rounded-card border border-status-info/30 bg-status-info/5 p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-status-info flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-ink">AI assist (draft only)</h3>
                <p className="text-xs text-ink-secondary mt-1">
                  Generates a draft rationale for your judgement. This is a draft — you must review and edit it. It never includes integrity signals and is never auto-applied.
                </p>
                <div className="mt-3">
                  {!aiBudgetRemaining ? (
                    <InlineNotice tone="warning">
                      <Ban className="h-4 w-4 flex-shrink-0" />
                      <span>AI assist budget is exhausted for this period.</span>
                    </InlineNotice>
                  ) : (
                    <Button size="sm" variant="secondary" loading={aiLoading} icon={!aiLoading ? <Sparkles className="h-4 w-4" /> : undefined} onClick={onAiAssist}>
                      {aiLoading ? 'Generating draft…' : 'Generate draft'}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {aiEnabled && !aiBudgetRemaining && (
          <InlineNotice tone="warning">
            <Lock className="h-4 w-4 flex-shrink-0" />
            <span>AI assist is currently blocked — budget exhausted.</span>
          </InlineNotice>
        )}

        {/* Save */}
        <div className="sticky bottom-0 bg-surface border-t border-border -mx-4 -mb-4 p-4 flex justify-end">
          <Button onClick={onSave} icon={<CheckCheck className="h-4 w-4" />}>Save criterion</Button>
        </div>
      </div>

      <ConfirmationDialog
        open={!!claimDeleteId}
        title="Delete this claim?"
        description="This will remove the claim and its evidence references. You can add it again if needed."
        confirmLabel="Delete claim"
        destructive
        onConfirm={() => {
          setClaims((prev) => prev.filter((c) => c.id !== claimDeleteId));
          setClaimDeleteId(null);
        }}
        onCancel={() => setClaimDeleteId(null)}
      />
    </div>
  );
}
