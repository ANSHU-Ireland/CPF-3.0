import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Clock,
  FileText,
  CheckCircle2,
  AlertCircle,
  Paperclip,
  Save,
  Send,
  Pause,
  Trash2,
  ArrowLeft,
  ArrowRight,
  LifeBuoy,
  ShieldAlert,
  RotateCcw,
} from 'lucide-react';
import { CandidateShell } from '@/components/layout/CandidateShell';
import { Button, IconButton } from '@/components/ui/Button';
import { Alert, InlineNotice, StatusBadge, EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { TextArea } from '@/components/ui/Form';
import { Accordion } from '@/components/ui/Navigation';
import { Overlay, ConfirmationDialog } from '@/components/ui/Overlay';
import { SaveStatus, ConnectionStatus } from '@/components/ui/Status';
import { api, isApiError, ApiError } from '@/lib/api';
import type { AssessmentInvitation, AssessmentStage, CandidatePortalState } from '@/lib/types';
import { useAsyncData } from '@/lib/useAsyncData';

type Stage = 'preflight' | 'welcome' | 'disclosure' | 'assessment' | 'review' | 'submitted';

interface CandidatePortalApiResponse {
  candidateName?: string;
  invitationStatus?: string;
  expiresAt?: string;
  assessment?: {
    code?: string;
    title?: string;
    purpose?: string;
    timebox?: {
      minutes?: number;
      recommendedMinutes?: number;
    };
    stages?: Array<{
      id?: string;
      stage?: string;
      title?: string;
      description?: string;
      order?: number;
      durationMinutes?: number | null;
      candidateAction?: string;
      evidenceCaptured?: string;
    }>;
  };
  session?: {
    id?: string;
    status?: string;
  } | null;
}

const stageSteps = [
  { id: 'preflight', label: 'Preflight' },
  { id: 'welcome', label: 'Welcome' },
  { id: 'disclosure', label: 'Disclosure' },
  { id: 'assessment', label: 'Assessment' },
  { id: 'review', label: 'Review & submit' },
];

interface CandidateWorkspaceResponse {
  sessionStatus: string;
  schemaVersion: number;
  revision: number;
  content: Record<string, string>;
  updatedAt: string;
  finalisedAt: string | null;
}

interface SourcePackItemSummary {
  id: string;
  title: string;
  description: string;
  itemType: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  availabilityState: string;
}

interface SourcePackListResponse {
  items: SourcePackItemSummary[];
}

interface SourcePackDetailResponse extends SourcePackItemSummary {
  content?: string;
}

interface ArtifactInitiateResponse {
  artifactId: string;
  status: string;
  scanStatus: string;
}

interface CandidateArtifact {
  artifactId: string;
  stageId: string;
  filename: string;
  sizeBytes: number;
  status: string;
  scanStatus: string;
}

interface CandidatePreflightChecks {
  problemRead: boolean;
  sourceOpened: boolean;
  aiPracticeSent: boolean;
  pluginRun: boolean;
  draftSaved: boolean;
  browserChecked: boolean;
  supportVisible: boolean;
}

interface CandidatePreflightResponse {
  status: 'in_progress' | 'completed';
  checks: CandidatePreflightChecks;
  practiceMessage: string;
  practiceDraft: string;
  completedAt: string | null;
  updatedAt: string;
}

interface TimelineEventItem {
  id: string;
  category: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  annotation: {
    note: string;
    flag: string;
    annotatedAt: string | null;
  };
}

interface TimelineResponse {
  events: TimelineEventItem[];
}

const defaultPreflightChecks: CandidatePreflightChecks = {
  problemRead: false,
  sourceOpened: false,
  aiPracticeSent: false,
  pluginRun: false,
  draftSaved: false,
  browserChecked: false,
  supportVisible: false,
};

export default function CandidatePortalPage() {
  const params = useParams<{ token?: string; attemptId?: string; '*': string }>();
  const navigate = useNavigate();
  const resolvedToken = (() => {
    const raw = (params.token ?? params.attemptId ?? params['*'] ?? '').trim();
    if (!raw) return '';
    const decoded = (() => {
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    })();
    const marker = '/candidate/';
    const markerIndex = decoded.lastIndexOf(marker);
    if (markerIndex !== -1) {
      const after = decoded.slice(markerIndex + marker.length).replace(/^\/+/, '');
      return (after.split(/[/?#]/)[0] ?? '').trim();
    }
    return (decoded.split(/[/?#]/)[0] ?? '').trim();
  })();
  const [stage, setStage] = useState<Stage>('preflight');
  const [invitation, setInvitation] = useState<AssessmentInvitation | null>(null);
  const [disclosureAcknowledged, setDisclosureAcknowledged] = useState(false);
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [portalError, setPortalError] = useState<ApiError | null>(null);
  const [portalState, setPortalState] = useState<CandidatePortalState>('welcome');
  const [startingAssessment, setStartingAssessment] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [workspaceRevision, setWorkspaceRevision] = useState<number | null>(null);
  const [isEvidenceDirty, setIsEvidenceDirty] = useState(false);
  const [preflightPracticeMessage, setPreflightPracticeMessage] = useState('');
  const [preflightPracticeDraft, setPreflightPracticeDraft] = useState('');
  const [preflightChecks, setPreflightChecks] = useState<CandidatePreflightChecks>(defaultPreflightChecks);
  const [preflightSaveState, setPreflightSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [assessmentStartedAt, setAssessmentStartedAt] = useState<number | null>(null);
  const [assessmentSecondsRemaining, setAssessmentSecondsRemaining] = useState<number | null>(null);
  const [assessmentTimerNotice, setAssessmentTimerNotice] = useState<string | null>(null);
  const [assessmentLocked, setAssessmentLocked] = useState(false);
  const [timerWarningFlags, setTimerWarningFlags] = useState({
    fiveMin: false,
    twoMin: false,
    thirtySec: false,
  });
  const [timelineDraftById, setTimelineDraftById] = useState<Record<string, string>>({});
  const [timelineFlagById, setTimelineFlagById] = useState<Record<string, string>>({});
  const [timelineSavingId, setTimelineSavingId] = useState<string | null>(null);
  const [sourcePackItemId, setSourcePackItemId] = useState<string | null>(null);
  const [artifactsByStage, setArtifactsByStage] = useState<Record<string, CandidateArtifact[]>>({});
  const [artifactBusyStageId, setArtifactBusyStageId] = useState<string | null>(null);
  const [artifactError, setArtifactError] = useState<string | null>(null);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const mapInvitation = (raw: CandidatePortalApiResponse): AssessmentInvitation => {
    const stages = Array.isArray(raw.assessment?.stages)
      ? raw.assessment!.stages!.map((stageItem, index) => ({
          id: stageItem.id ?? `stage-${index + 1}`,
          title: stageItem.stage ?? stageItem.title ?? `Stage ${index + 1}`,
          description: stageItem.candidateAction ?? stageItem.description ?? '',
          order: stageItem.order ?? index + 1,
          durationMinutes: stageItem.durationMinutes ?? undefined,
          candidateAction: stageItem.candidateAction ?? '',
          evidenceCaptured: stageItem.evidenceCaptured ?? '',
        }))
      : [];

    return {
      token: resolvedToken,
      assessmentCode: raw.assessment?.code,
      assessmentTitle: raw.assessment?.title ?? 'Assessment',
      assessmentPurpose: raw.assessment?.purpose ?? '',
      expectedDurationMinutes:
        raw.assessment?.timebox?.recommendedMinutes ??
        raw.assessment?.timebox?.minutes ??
        60,
      stages,
      orgName: 'The hiring organisation',
      jobProfileTitle: raw.assessment?.title ?? 'Assessment',
      supportContactEmail: 'support@cpf.invalid',
      expiresAt: raw.expiresAt ?? new Date().toISOString(),
    };
  };

  const inviteResult = useAsyncData<CandidatePortalApiResponse>(
    useCallback(
      (_signal) => api.get(`/v1/candidate/${resolvedToken}`, { auth: false }),
      [resolvedToken],
    ),
    { deps: [resolvedToken], enabled: Boolean(resolvedToken) },
  );

  useEffect(() => {
    if (inviteResult.status === 'success') {
      setInvitation(mapInvitation(inviteResult.data));
      setSessionStatus(inviteResult.data.session?.status ?? null);
      setPortalState('welcome');
      setPreflightChecks((prev) => ({
        ...prev,
        browserChecked: true,
        supportVisible: true,
      }));
    } else if (inviteResult.status === 'error') {
      setPortalError(inviteResult.error);
      if (inviteResult.error.status === 404 || inviteResult.error.code === 'TOKEN_EXPIRED') {
        setPortalState('expired');
      } else {
        setPortalState('error');
      }
    }
  }, [inviteResult.status, inviteResult.data, inviteResult.error]);

  useEffect(() => {
    if (!online) return;
    setPreflightChecks((prev) => ({ ...prev, browserChecked: true }));
  }, [online]);

  const preflightData = useAsyncData<CandidatePreflightResponse>(
    useCallback(
      (_signal) => api.get(`/v1/candidate/${resolvedToken}/preflight`, { auth: false }),
      [resolvedToken, stage],
    ),
    { deps: [resolvedToken, stage], enabled: Boolean(resolvedToken) && stage === 'preflight' },
  );

  useEffect(() => {
    if (preflightData.status !== 'success') return;
    setPreflightChecks((prev) => ({
      ...preflightData.data.checks,
      browserChecked: prev.browserChecked || preflightData.data.checks.browserChecked,
      supportVisible: prev.supportVisible || preflightData.data.checks.supportVisible,
    }));
    setPreflightPracticeMessage(preflightData.data.practiceMessage ?? '');
    setPreflightPracticeDraft(preflightData.data.practiceDraft ?? '');
  }, [preflightData.status, preflightData.data]);

  const persistPreflight = useCallback(
    async (
      nextChecks: CandidatePreflightChecks,
      practiceMessage: string,
      practiceDraft: string,
      completed: boolean,
    ) => {
      setPreflightSaveState('saving');
      try {
        const saved = await api.put<CandidatePreflightResponse>(
          `/v1/candidate/${resolvedToken}/preflight`,
          {
            checks: nextChecks,
            practiceMessage,
            practiceDraft,
            completed,
          },
          { auth: false },
        );
        setPreflightChecks(saved.checks);
        setPreflightPracticeMessage(saved.practiceMessage);
        setPreflightPracticeDraft(saved.practiceDraft);
        setPreflightSaveState('saved');
      } catch {
        setPreflightSaveState('error');
      }
    },
    [resolvedToken],
  );

  const setStartedAtNow = useCallback(() => {
    const started = Date.now();
    setAssessmentStartedAt(started);
    localStorage.setItem(`cpf.assessment.startedAt.${resolvedToken}`, String(started));
    return started;
  }, [resolvedToken]);

  useEffect(() => {
    if (stage !== 'assessment') return;
    if (!resolvedToken) return;
    if (assessmentStartedAt) return;
    const raw = localStorage.getItem(`cpf.assessment.startedAt.${resolvedToken}`);
    if (!raw) {
      setStartedAtNow();
      return;
    }
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      setAssessmentStartedAt(parsed);
    } else {
      setStartedAtNow();
    }
  }, [stage, resolvedToken, assessmentStartedAt, setStartedAtNow]);

  // Load existing workspace draft when candidate enters assessment stage.
  const workspaceData = useAsyncData<CandidateWorkspaceResponse>(
    useCallback(
      (_signal) => api.get(`/v1/candidate/${resolvedToken}/workspace`, { auth: false }),
      [resolvedToken, stage],
    ),
    { deps: [resolvedToken, stage], enabled: Boolean(resolvedToken) && stage === 'assessment' },
  );

  useEffect(() => {
    if (workspaceData.status === 'success') {
      setWorkspaceRevision(workspaceData.data.revision);
      setLastSavedAt(new Date(workspaceData.data.updatedAt).toLocaleTimeString());
      setEvidence((prev) => {
        if (Object.keys(prev).length === 0) return workspaceData.data.content ?? {};
        return { ...(workspaceData.data.content ?? {}), ...prev };
      });
    }
  }, [workspaceData.status, workspaceData.data]);

  const sourcePackData = useAsyncData<SourcePackListResponse>(
    useCallback(
      (_signal) => api.get(`/v1/candidate/${resolvedToken}/source-pack`, { auth: false }),
      [resolvedToken, stage],
    ),
    { deps: [resolvedToken, stage], enabled: Boolean(resolvedToken) && stage === 'assessment' },
  );

  const timelineData = useAsyncData<TimelineResponse>(
    useCallback(
      (_signal) => api.get(`/v1/candidate/${resolvedToken}/evidence-timeline`, { auth: false }),
      [resolvedToken, stage],
    ),
    {
      deps: [resolvedToken, stage],
      enabled: Boolean(resolvedToken) && (stage === 'assessment' || stage === 'review'),
    },
  );

  const emitTimelineEvent = useCallback(
    async (eventType: string, payload: Record<string, unknown>) => {
      try {
        await api.post(
          `/v1/candidate/${resolvedToken}/events`,
          {
            category: 'workspace_evidence',
            eventType,
            payload,
          },
          { auth: false },
        );
        timelineData.refetch();
      } catch {
        // Best-effort event capture only.
      }
    },
    [resolvedToken, timelineData],
  );

  const saveTimelineAnnotation = useCallback(
    async (eventId: string) => {
      const note = timelineDraftById[eventId] ?? '';
      const flag = timelineFlagById[eventId] ?? 'none';
      setTimelineSavingId(eventId);
      try {
        await api.patch(
          `/v1/candidate/${resolvedToken}/evidence-timeline/${eventId}`,
          { note, flag },
          { auth: false },
        );
        await timelineData.refetch();
      } finally {
        setTimelineSavingId(null);
      }
    },
    [resolvedToken, timelineDraftById, timelineFlagById, timelineData],
  );

  useEffect(() => {
    if (sourcePackData.status === 'success' && !sourcePackItemId) {
      const firstId = sourcePackData.data.items[0]?.id ?? null;
      setSourcePackItemId(firstId);
    }
  }, [sourcePackData.status, sourcePackData.data, sourcePackItemId]);

  const sourcePackDetail = useAsyncData<SourcePackDetailResponse>(
    useCallback(
      (_signal) => {
        if (!sourcePackItemId) {
          return Promise.resolve({
            id: '',
            title: '',
            description: '',
            itemType: '',
            mimeType: '',
            sizeBytes: 0,
            sha256: '',
            availabilityState: 'unavailable',
          } as SourcePackDetailResponse);
        }
        return api.get(`/v1/candidate/${resolvedToken}/source-pack/${sourcePackItemId}`, { auth: false });
      },
      [resolvedToken, sourcePackItemId],
    ),
    { deps: [resolvedToken, sourcePackItemId], enabled: Boolean(resolvedToken) && Boolean(sourcePackItemId) && stage === 'assessment' },
  );

  const saveWorkspace = useCallback(
    async (contentSnapshot: Record<string, string>) => {
      const currentRevision = workspaceRevision ?? 1;
      const saved = await api.put<CandidateWorkspaceResponse>(
        `/v1/candidate/${resolvedToken}/workspace`,
        {
          expectedRevision: currentRevision,
          schemaVersion: 1,
          content: contentSnapshot,
        },
        { auth: false },
      );
      setWorkspaceRevision(saved.revision);
      setEvidence(saved.content ?? contentSnapshot);
      setLastSavedAt(new Date(saved.updatedAt).toLocaleTimeString());
      await emitTimelineEvent('ARTIFACT_VERSION_SAVED', {
        revision: saved.revision,
        fieldCount: Object.keys(contentSnapshot).length,
      });
      return saved;
    },
    [resolvedToken, workspaceRevision, emitTimelineEvent],
  );

  const handleSave = useCallback(
    async (taskId: string, content: string) => {
      setSaveState('saving');
      const contentSnapshot = { ...evidence, [taskId]: content };
      try {
        await saveWorkspace(contentSnapshot);
        setSaveState('saved');
        setIsEvidenceDirty(false);
      } catch (err) {
        if (isApiError(err) && err.code === 'WORKSPACE_REVISION_CONFLICT') {
          workspaceData.refetch();
        }
        setSaveState('error');
      }
    },
    [evidence, saveWorkspace, workspaceData],
  );

  useEffect(() => {
    if (stage !== 'assessment') return;
    if (!isEvidenceDirty) return;
    const timer = window.setTimeout(async () => {
      setSaveState('saving');
      try {
        await saveWorkspace({ ...evidence });
        setSaveState('saved');
        setIsEvidenceDirty(false);
      } catch {
        setSaveState('error');
      }
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [stage, isEvidenceDirty, evidence, saveWorkspace]);

  useEffect(() => {
    if (stage !== 'assessment' || !invitation || !assessmentStartedAt || assessmentLocked) return;
    const totalSeconds = invitation.expectedDurationMinutes * 60;
    const interval = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - assessmentStartedAt) / 1000);
      const remaining = Math.max(totalSeconds - elapsed, 0);
      setAssessmentSecondsRemaining(remaining);

      if (remaining <= 300 && !timerWarningFlags.fiveMin) {
        setAssessmentTimerNotice('5 minutes remaining in this timed stage.');
        setTimerWarningFlags((prev) => ({ ...prev, fiveMin: true }));
      }
      if (remaining <= 120 && !timerWarningFlags.twoMin) {
        setAssessmentTimerNotice('2 minutes remaining. Focus on final checks and save.');
        setTimerWarningFlags((prev) => ({ ...prev, twoMin: true }));
      }
      if (remaining <= 30 && !timerWarningFlags.thirtySec) {
        setAssessmentTimerNotice('30 seconds remaining. Stage will lock automatically.');
        setTimerWarningFlags((prev) => ({ ...prev, thirtySec: true }));
      }

      if (remaining === 0) {
        window.clearInterval(interval);
        setAssessmentLocked(true);
        setAssessmentTimerNotice('Stage time expired. Your work is now locked and moved to review.');
        setSaveState('saving');
        void (async () => {
          try {
            await saveWorkspace({ ...evidence });
            setSaveState('saved');
          } catch {
            setSaveState('error');
          } finally {
            setStage('review');
          }
        })();
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [
    stage,
    invitation,
    assessmentStartedAt,
    timerWarningFlags,
    assessmentLocked,
    saveWorkspace,
    evidence,
  ]);

  const handleSubmit = async () => {
    setSubmitDialogOpen(false);
    try {
      await emitTimelineEvent('FINAL_SUBMISSION', {
        stage,
        answeredCount: Object.values(evidence).filter((v) => v.trim().length > 0).length,
      });
      await api.post(`/v1/candidate/${resolvedToken}/submit`, undefined, { auth: false });
      setPortalState('submitted');
      setStage('submitted');
    } catch (err) {
      if (isApiError(err)) setPortalError(err);
      setPortalState('error');
    }
  };

  const computeSha256Hex = async (file: File) => {
    const bytes = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const uploadArtifact = useCallback(
    async (stageId: string, file: File) => {
      setArtifactError(null);
      setArtifactBusyStageId(stageId);
      try {
        const initiate = await api.post<ArtifactInitiateResponse>(
          `/v1/candidate/${resolvedToken}/artifacts/initiate`,
          {
            stageId,
            deliverableType: 'file_upload',
            filename: file.name,
            mimeType: file.type || 'application/octet-stream',
            sizeBytes: file.size,
          },
          { auth: false },
        );
        const sha256 = await computeSha256Hex(file);
        const completed = await api.post<ArtifactInitiateResponse>(
          `/v1/candidate/${resolvedToken}/artifacts/${initiate.artifactId}/complete`,
          {
            sha256,
            sizeBytes: file.size,
          },
          { auth: false },
        );

        setArtifactsByStage((prev) => {
          const existing = prev[stageId] ?? [];
          return {
            ...prev,
            [stageId]: [
              ...existing,
              {
                artifactId: initiate.artifactId,
                stageId,
                filename: file.name,
                sizeBytes: file.size,
                status: completed.status,
                scanStatus: completed.scanStatus,
              },
            ],
          };
        });
        await emitTimelineEvent('PLUGIN_RUN_COMPLETED', {
          plugin: 'artifact_upload',
          stageId,
          artifactId: initiate.artifactId,
          filename: file.name,
          sizeBytes: file.size,
        });
      } catch (err) {
        if (isApiError(err)) {
          setArtifactError(err.message);
        } else {
          setArtifactError('Upload failed. Try again in a moment.');
        }
      } finally {
        setArtifactBusyStageId(null);
      }
    },
    [resolvedToken, emitTimelineEvent],
  );

  const removeArtifact = useCallback(
    async (stageId: string, artifactId: string) => {
      setArtifactError(null);
      setArtifactBusyStageId(stageId);
      try {
        await api.delete(`/v1/candidate/${resolvedToken}/artifacts/${artifactId}`, { auth: false });
        setArtifactsByStage((prev) => ({
          ...prev,
          [stageId]: (prev[stageId] ?? []).filter((item) => item.artifactId !== artifactId),
        }));
        await emitTimelineEvent('CANDIDATE_DECISION', {
          decisionType: 'artifact_removed',
          stageId,
          artifactId,
        });
      } catch (err) {
        if (isApiError(err)) {
          setArtifactError(err.message);
        } else {
          setArtifactError('Could not remove file. Try again.');
        }
      } finally {
        setArtifactBusyStageId(null);
      }
    },
    [resolvedToken, emitTimelineEvent],
  );

  const runLifecycleStep = useCallback(
    async (path: string, toleratedCodes: string[]) => {
      try {
        await api.post(`/v1/candidate/${resolvedToken}/${path}`, undefined, { auth: false });
      } catch (err) {
        if (isApiError(err) && toleratedCodes.includes(err.code)) return;
        throw err;
      }
    },
    [resolvedToken],
  );

  const beginAssessment = useCallback(async () => {
    setStartingAssessment(true);
    try {
      if (!sessionStatus) {
        await runLifecycleStep('accept', []);
        await runLifecycleStep('disclosure/acknowledge', []);
        await runLifecycleStep('start', []);
      } else if (sessionStatus === 'disclosure_pending') {
        await runLifecycleStep('disclosure/acknowledge', []);
        await runLifecycleStep('start', []);
      } else if (sessionStatus === 'ready' || sessionStatus === 'paused') {
        await runLifecycleStep('start', []);
      }
      if (!assessmentStartedAt) {
        const raw = localStorage.getItem(`cpf.assessment.startedAt.${resolvedToken}`);
        const parsed = raw ? Number(raw) : Number.NaN;
        if (Number.isFinite(parsed) && parsed > 0) {
          setAssessmentStartedAt(parsed);
        } else {
          setStartedAtNow();
        }
      }
      setStage('assessment');
    } catch (err) {
      if (isApiError(err)) {
        setPortalError(err);
      }
      setPortalState('error');
    } finally {
      setStartingAssessment(false);
    }
  }, [runLifecycleStep, sessionStatus]);

  const handleWithdraw = async () => {
    setWithdrawDialogOpen(false);
    try {
      await api.post(`/v1/candidate/${resolvedToken}/withdraw`, undefined, { auth: false });
      setPortalState('withdrawn');
    } catch (err) {
      if (isApiError(err)) setPortalError(err);
      setPortalState('error');
    }
  };

  // === Terminal / error states ===
  if (!resolvedToken) {
    return (
      <CandidateShell showHeader={false}>
        <div className="py-12">
          <EmptyState
            icon={<AlertCircle className="h-12 w-12" />}
            title="Invitation link not recognised"
            description="Paste the full invitation link or just the invitation code to continue."
          />
          <div className="text-center mt-6">
            <Button variant="secondary" onClick={() => navigate('/candidate')}>
              Enter invitation code
            </Button>
          </div>
        </div>
      </CandidateShell>
    );
  }

  if (portalState === 'expired') {
    return (
      <CandidateShell showHeader={false}>
        <div className="py-12">
          <EmptyState
            icon={<AlertCircle className="h-12 w-12" />}
            title="This invitation has expired"
            description="The link you used is no longer valid. Contact the organisation that invited you to request a new link."
          />
          <div className="text-center mt-6">
            <Button variant="secondary" onClick={() => navigate('/candidate')}>
              Enter a different code
            </Button>
          </div>
        </div>
      </CandidateShell>
    );
  }

  if (portalState === 'submitted') {
    return (
      <CandidateShell showHeader={false}>
        <div className="py-8">
          <div className="text-center mb-8">
            <div className="h-16 w-16 rounded-full bg-status-success/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-8 w-8 text-status-success" />
            </div>
            <h1 className="text-2xl font-bold text-ink">Assessment submitted</h1>
            <p className="text-sm text-ink-secondary mt-2 max-w-md mx-auto">
              Thank you. Your evidence has been received and will be reviewed by a trained person.
            </p>
          </div>
          <div className="rounded-card border border-border bg-surface p-6 space-y-4">
            <div>
              <p className="text-xs font-semibold text-ink-secondary uppercase tracking-wide">Receipt</p>
              <p className="text-sm text-ink mt-1">
                Submitted at {new Date().toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-ink-secondary uppercase tracking-wide">What happens next</p>
              <ul className="text-sm text-ink mt-1 space-y-1.5 list-disc pl-5">
                <li>A trained reviewer will assess your evidence against the published criteria</li>
                <li>You will be notified when your Evidence Profile is ready</li>
                <li>The review typically takes a few business days</li>
                <li>You can withdraw your submission or exercise your data rights at any time</li>
              </ul>
            </div>
            <div className="pt-2 border-t border-border">
              <p className="text-xs font-semibold text-ink-secondary uppercase tracking-wide">Your rights</p>
              <p className="text-sm text-ink mt-1">
                You can request access to, correction of, or deletion of your data. Contact the organisation that invited you to exercise these rights.
              </p>
            </div>
          </div>
          <div className="text-center mt-6">
            <Button variant="danger" icon={<ShieldAlert className="h-4 w-4" />} onClick={() => setWithdrawDialogOpen(true)}>
              Withdraw my submission
            </Button>
          </div>
        </div>
        <ConfirmationDialog
          open={withdrawDialogOpen}
          title="Withdraw your submission?"
          description="Withdrawing means your evidence will not be reviewed. This cannot be undone. You would need a new invitation to participate again."
          confirmLabel="Yes, withdraw"
          cancelLabel="Keep my submission"
          destructive
          onConfirm={handleWithdraw}
          onCancel={() => setWithdrawDialogOpen(false)}
        />
      </CandidateShell>
    );
  }

  if (portalState === 'withdrawn') {
    return (
      <CandidateShell showHeader={false}>
        <div className="py-12 text-center">
          <div className="h-16 w-16 rounded-full bg-surface-subtle flex items-center justify-center mx-auto mb-4">
            <RotateCcw className="h-8 w-8 text-ink-secondary" />
          </div>
          <h1 className="text-2xl font-bold text-ink">Your submission has been withdrawn</h1>
          <p className="text-sm text-ink-secondary mt-2 max-w-md mx-auto">
            Your evidence will not be reviewed. You can request a new invitation from the organisation if you change your mind.
          </p>
          <p className="text-sm text-ink-secondary mt-4">
            Your data will be handled according to the organisation's retention policy. You can exercise your data rights by contacting them directly.
          </p>
        </div>
      </CandidateShell>
    );
  }

  if (portalState === 'error' && portalError) {
    return (
      <CandidateShell showHeader={false}>
        <div className="py-12">
          <ErrorState error={portalError} onRetry={inviteResult.refetch} />
        </div>
      </CandidateShell>
    );
  }

  if (inviteResult.status === 'loading') {
    return (
      <CandidateShell showHeader={false}>
        <LoadingState label="Loading your assessment…" />
      </CandidateShell>
    );
  }

  if (inviteResult.status === 'error') {
    return (
      <CandidateShell showHeader={false}>
        <ErrorState error={inviteResult.error} onRetry={inviteResult.refetch} />
      </CandidateShell>
    );
  }

  const currentStepIndex = stageSteps.findIndex((s) => s.id === stage);
  const stepStatuses = stageSteps.map((s, i) => ({
    ...s,
    status: i < currentStepIndex ? 'complete' as const : i === currentStepIndex ? 'current' as const : 'upcoming' as const,
  }));

  const workspaceGuideByCode: Record<string, { title: string; checks: string[] }> = {
    SE1: {
      title: 'SE1 Delivery Checks',
      checks: [
        'Map acceptance criteria to tests before coding.',
        'Track permission, audit and regression implications explicitly.',
        'Record at least one AI output you rejected or corrected.',
      ],
    },
    SE5: {
      title: 'SE5 Review Desk Checks',
      checks: [
        'Capture findings with evidence and risk level.',
        'Add at least one adversarial test and expected behavior.',
        'Separate PR recommendation from candidate judgment.',
      ],
    },
    DM1: {
      title: 'DM1 Recovery Lab Checks',
      checks: [
        'Reconcile funnel figures with source/date/currency notes.',
        'Rank hypotheses by confidence and commercial impact.',
        'Document budget-protection actions and experiment backlog.',
      ],
    },
    DM4: {
      title: 'DM4 Decision Studio Checks',
      checks: [
        'Define metric contract and data quality exceptions.',
        'Distinguish observed, attributed and incremental outcomes.',
        'Show investment recommendation with sensitivity assumptions.',
      ],
    },
  };

  // === WELCOME ===
  if (stage === 'preflight' && invitation) {
    const allChecksPassed = Object.values(preflightChecks).every(Boolean);

    return (
      <CandidateShell steps={stepStatuses} orgName={invitation.orgName} supportEmail={invitation.supportContactEmail}>
        <h1 className="text-2xl font-bold text-ink mb-2">Preflight check</h1>
        <p className="text-ink-secondary mb-6">
          Complete these untimed checks before your assessment timer starts.
        </p>

        <div className="rounded-card border border-border bg-surface p-5 mb-4">
          <h2 className="text-sm font-semibold text-ink mb-2">Required checks</h2>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between gap-3">
              <span>Read problem summary and constraints</span>
              <Button
                size="sm"
                variant={preflightChecks.problemRead ? 'secondary' : 'primary'}
                onClick={() => {
                  const nextChecks = { ...preflightChecks, problemRead: true };
                  setPreflightChecks(nextChecks);
                  void persistPreflight(nextChecks, preflightPracticeMessage, preflightPracticeDraft, false);
                }}
              >
                {preflightChecks.problemRead ? 'Done' : 'Open summary'}
              </Button>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Open one sample source item</span>
              <Button
                size="sm"
                variant={preflightChecks.sourceOpened ? 'secondary' : 'primary'}
                onClick={() => {
                  const nextChecks = { ...preflightChecks, sourceOpened: true };
                  setPreflightChecks(nextChecks);
                  void persistPreflight(nextChecks, preflightPracticeMessage, preflightPracticeDraft, false);
                }}
              >
                {preflightChecks.sourceOpened ? 'Done' : 'Open sample'}
              </Button>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Send a practice AI message (not scored)</span>
              <Button
                size="sm"
                variant={preflightChecks.aiPracticeSent ? 'secondary' : 'primary'}
                disabled={preflightPracticeMessage.trim().length === 0}
                onClick={() => {
                  const nextChecks = { ...preflightChecks, aiPracticeSent: true };
                  setPreflightChecks(nextChecks);
                  void persistPreflight(nextChecks, preflightPracticeMessage, preflightPracticeDraft, false);
                }}
              >
                {preflightChecks.aiPracticeSent ? 'Sent' : 'Send practice'}
              </Button>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Run a sample plugin action</span>
              <Button
                size="sm"
                variant={preflightChecks.pluginRun ? 'secondary' : 'primary'}
                onClick={() => {
                  const nextChecks = { ...preflightChecks, pluginRun: true };
                  setPreflightChecks(nextChecks);
                  void persistPreflight(nextChecks, preflightPracticeMessage, preflightPracticeDraft, false);
                }}
              >
                {preflightChecks.pluginRun ? 'Done' : 'Run check'}
              </Button>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Edit and save a practice draft</span>
              <Button
                size="sm"
                variant={preflightChecks.draftSaved ? 'secondary' : 'primary'}
                disabled={preflightPracticeDraft.trim().length === 0}
                onClick={() => {
                  const nextChecks = { ...preflightChecks, draftSaved: true };
                  setPreflightChecks(nextChecks);
                  void persistPreflight(nextChecks, preflightPracticeMessage, preflightPracticeDraft, false);
                }}
              >
                {preflightChecks.draftSaved ? 'Saved' : 'Save draft'}
              </Button>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Browser and connection check</span>
              <StatusBadge tone={preflightChecks.browserChecked ? 'success' : 'warning'}>{preflightChecks.browserChecked ? 'Ready' : 'Pending'}</StatusBadge>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>Support and accommodations route visible</span>
              <StatusBadge tone={preflightChecks.supportVisible ? 'success' : 'warning'}>{preflightChecks.supportVisible ? 'Visible' : 'Pending'}</StatusBadge>
            </li>
          </ul>
        </div>

        <TextArea
          label="Practice AI message"
          value={preflightPracticeMessage}
          onChange={(e) => setPreflightPracticeMessage(e.target.value)}
          onBlur={() => {
            void persistPreflight(preflightChecks, preflightPracticeMessage, preflightPracticeDraft, false);
          }}
          placeholder="Example: Summarise what I should deliver in Stage 1."
          hint="Practice interactions are separate from scored assessment evidence."
        />

        <div className="mt-4">
          <TextArea
            label="Practice draft"
            value={preflightPracticeDraft}
            onChange={(e) => setPreflightPracticeDraft(e.target.value)}
            onBlur={() => {
              void persistPreflight(preflightChecks, preflightPracticeMessage, preflightPracticeDraft, false);
            }}
            placeholder="Type anything and save once to confirm draft persistence."
          />
        </div>

        <div className="mt-4 text-sm text-ink-secondary">
          {preflightSaveState === 'saving' && 'Saving preflight…'}
          {preflightSaveState === 'saved' && 'Preflight saved.'}
          {preflightSaveState === 'error' && 'Could not save preflight. You can continue and retry.'}
        </div>

        <div className="flex items-center justify-between mt-6">
          <a
            href={`mailto:${invitation.supportContactEmail}`}
            className="text-sm text-brand hover:text-brand-hover hover:underline inline-flex items-center gap-1.5"
          >
            <LifeBuoy className="h-4 w-4" /> Need support or accommodations?
          </a>
          <Button
            disabled={!allChecksPassed}
            icon={<ArrowRight className="h-4 w-4" />}
            onClick={async () => {
              await persistPreflight(preflightChecks, preflightPracticeMessage, preflightPracticeDraft, true);
              setStage('welcome');
            }}
          >
            Start assessment setup
          </Button>
        </div>
      </CandidateShell>
    );
  }

  // === WELCOME ===
  if (stage === 'welcome' && invitation) {
    return (
      <CandidateShell steps={stepStatuses} orgName={invitation.orgName} supportEmail={invitation.supportContactEmail}>
        <h1 className="text-2xl font-bold text-ink mb-2">{invitation.assessmentTitle}</h1>
        <p className="text-ink-secondary mb-6 leading-relaxed">{invitation.assessmentPurpose}</p>

        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          <div className="rounded-card border border-border bg-surface p-4 flex items-start gap-3">
            <Clock className="h-5 w-5 text-brand flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-ink">Expected time</p>
              <p className="text-sm text-ink-secondary">{invitation.expectedDurationMinutes} minutes</p>
            </div>
          </div>
          <div className="rounded-card border border-border bg-surface p-4 flex items-start gap-3">
            <FileText className="h-5 w-5 text-brand flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-ink">Stages</p>
              <p className="text-sm text-ink-secondary">{invitation.stages.length} stages to complete</p>
            </div>
          </div>
        </div>

        <div className="rounded-card border border-border bg-surface p-5 mb-6">
          <h2 className="text-sm font-semibold text-ink mb-3">What this assessment involves</h2>
          <ul className="text-sm text-ink-secondary space-y-2 list-disc pl-5">
            <li>You will complete tasks and submit evidence of your work</li>
            <li>A trained person reviews your evidence against published criteria</li>
            <li>No automated hiring decision is made by this platform</li>
            <li>Your work is saved as you go, and you can pause if needed</li>
          </ul>
        </div>

        <div className="rounded-card border border-status-info/30 bg-status-info/5 p-5 mb-6">
          <h2 className="text-sm font-semibold text-status-info mb-3">What is and isn't monitored</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-ink-secondary uppercase mb-2">We collect</p>
              <ul className="text-sm text-ink space-y-1 list-disc pl-5">
                <li>Your written responses and uploaded files</li>
                <li>Submission timestamps</li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-ink-secondary uppercase mb-2">We do NOT collect</p>
              <ul className="text-sm text-ink space-y-1 list-disc pl-5">
                <li>Camera, microphone, or biometric data</li>
                <li>Keystroke timing or clipboard monitoring</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <a
            href={`mailto:${invitation.supportContactEmail}`}
            className="text-sm text-brand hover:text-brand-hover hover:underline inline-flex items-center gap-1.5"
          >
            <LifeBuoy className="h-4 w-4" /> Need accommodations? Contact support
          </a>
          <Button icon={<ArrowRight className="h-4 w-4" />} onClick={() => setStage('disclosure')}>
            Continue to disclosure
          </Button>
        </div>
      </CandidateShell>
    );
  }

  // === DISCLOSURE ===
  if (stage === 'disclosure' && invitation) {
    return (
      <CandidateShell steps={stepStatuses} orgName={invitation.orgName} supportEmail={invitation.supportContactEmail}>
        <h1 className="text-2xl font-bold text-ink mb-2">Disclosure & support</h1>
        <p className="text-ink-secondary mb-6">
          Please review the information below. You must acknowledge that you have read it before you can start the assessment.
        </p>

        <div className="space-y-4 mb-6">
          <Accordion
            items={[
              {
                id: 'privacy',
                title: 'Privacy notice',
                content: (
                  <div className="space-y-2">
                    <p>Your evidence is processed by {invitation.orgName} for the purpose of assessing your capability for the role of {invitation.jobProfileTitle}.</p>
                    <p>Your data is retained according to the organisation's retention policy. You can request access, correction, or deletion of your data at any time.</p>
                    <p>Evidence is reviewed by trained people. No automated employment decision is made by this platform.</p>
                  </div>
                ),
                defaultOpen: true,
              },
              {
                id: 'process',
                title: 'Assessment process',
                content: (
                  <div className="space-y-2">
                    <p>The assessment has {invitation.stages.length} stages. You can pause and resume at any time — your work is saved.</p>
                    <p>Once submitted, your evidence is reviewed by a trained reviewer against published criteria.</p>
                    <p>You will receive an Evidence Profile summarising the review. This is not an employment decision.</p>
                  </div>
                ),
              },
              {
                id: 'integrity',
                title: 'Integrity & fairness',
                content: (
                  <div className="space-y-2">
                    <p>This platform does not monitor your camera, microphone, or biometric data.</p>
                    <p>Some metadata about your submission may be collected separately and reviewed only if a fairness concern is raised. This is kept separate from your performance evidence.</p>
                  </div>
                ),
              },
            ]}
          />
        </div>

        <div className="rounded-card border border-border bg-surface-subtle p-4 mb-6">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={disclosureAcknowledged}
              onChange={(e) => setDisclosureAcknowledged(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-border text-brand focus:ring-2 focus:ring-focus/20"
            />
            <span className="text-sm text-ink">
              I have read and understood the privacy notice, assessment process, and integrity information above.
            </span>
          </label>
        </div>

        <InlineNotice tone="info">
          <LifeBuoy className="h-4 w-4 flex-shrink-0" />
          <span>Need an accommodation? You can request one privately after acknowledging — it won't affect your assessment.</span>
        </InlineNotice>

        <div className="flex items-center justify-between mt-6">
          <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setStage('welcome')}>
            Back
          </Button>
          <Button
            loading={startingAssessment}
            disabled={!disclosureAcknowledged}
            icon={<ArrowRight className="h-4 w-4" />}
            onClick={beginAssessment}
          >
            Start assessment workspace
          </Button>
        </div>
      </CandidateShell>
    );
  }

  // === ASSESSMENT ===
  if (stage === 'assessment' && invitation) {
    const guide = invitation.assessmentCode ? workspaceGuideByCode[invitation.assessmentCode] : undefined;
    const hhmmss = (() => {
      if (assessmentSecondsRemaining === null) return null;
      const mins = Math.floor(assessmentSecondsRemaining / 60)
        .toString()
        .padStart(2, '0');
      const secs = (assessmentSecondsRemaining % 60).toString().padStart(2, '0');
      return `${mins}:${secs}`;
    })();

    return (
      <CandidateShell steps={stepStatuses} orgName={invitation.orgName} supportEmail={invitation.supportContactEmail}>
        <div className="flex items-center justify-between gap-4 mb-4">
          <h1 className="text-2xl font-bold text-ink">Assessment workspace</h1>
          <div className="flex items-center gap-4">
            {hhmmss && <StatusBadge tone={assessmentSecondsRemaining !== null && assessmentSecondsRemaining <= 120 ? 'warning' : 'info'}>Time left {hhmmss}</StatusBadge>}
            <ConnectionStatus online={online} />
            <SaveStatus state={saveState} lastSavedAt={lastSavedAt} />
          </div>
        </div>

        {assessmentTimerNotice && (
          <div className="mb-4">
            <Alert tone={assessmentLocked ? 'warning' : 'info'} title={assessmentLocked ? 'Stage locked' : 'Time warning'}>
              {assessmentTimerNotice}
            </Alert>
          </div>
        )}

        {!online && (
          <div className="mb-4">
            <Alert tone="warning" title="You're offline">
              Your work is safe. You can continue writing — it will be saved when your connection returns.
            </Alert>
          </div>
        )}

        {workspaceData.status === 'loading' && <LoadingState label="Loading your saved work…" />}

        {workspaceData.status === 'error' && (
          <div className="mb-4">
            <Alert tone="warning" title="Couldn't load your saved work">
              We couldn't retrieve your previous responses. You can still continue — your new work will be saved.
            </Alert>
          </div>
        )}

        {guide && (
          <div className="rounded-card border border-border bg-surface-subtle p-4 mb-4">
            <h2 className="text-sm font-semibold text-ink mb-2">{guide.title}</h2>
            <ul className="text-sm text-ink-secondary list-disc pl-5 space-y-1.5">
              {guide.checks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-card border border-border bg-surface p-5 mb-4">
          <h2 className="font-semibold text-ink mb-2">Source pack</h2>
          <p className="text-sm text-ink-secondary mb-3">
            Review this brief carefully before writing responses. It contains the scenario, constraints, and source context for your assessment.
          </p>

          {sourcePackData.status === 'loading' && <LoadingState label="Loading source pack…" />}

          {sourcePackData.status === 'error' && (
            <Alert tone="warning" title="Couldn't load source pack">
              You can continue with your responses, but source-pack context is unavailable right now.
            </Alert>
          )}

          {sourcePackData.status === 'success' && sourcePackData.data.items.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {sourcePackData.data.items.map((item) => (
                  <Button
                    key={item.id}
                    size="sm"
                    variant={sourcePackItemId === item.id ? 'primary' : 'secondary'}
                    onClick={() => setSourcePackItemId(item.id)}
                  >
                    {item.title}
                  </Button>
                ))}
              </div>

              {sourcePackDetail.status === 'loading' && <LoadingState label="Loading source item…" />}

              {sourcePackDetail.status === 'success' && (
                <div className="rounded-card border border-border bg-surface-subtle p-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <h3 className="text-sm font-semibold text-ink">{sourcePackDetail.data.title}</h3>
                    <StatusBadge tone="info">{Math.ceil(sourcePackDetail.data.sizeBytes / 1024)} KB</StatusBadge>
                  </div>
                  {sourcePackDetail.data.description && (
                    <p className="text-sm text-ink-secondary mb-2">{sourcePackDetail.data.description}</p>
                  )}
                  {sourcePackDetail.data.itemType === 'inline_text' ? (
                    <pre className="whitespace-pre-wrap text-sm text-ink leading-relaxed">
                      {sourcePackDetail.data.content ?? 'No inline content provided.'}
                    </pre>
                  ) : (
                    <p className="text-sm text-ink-secondary">
                      This item is provided as {sourcePackDetail.data.mimeType}. Download integration will be enabled in the next slice.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {workspaceData.status !== 'loading' && invitation.stages.map((stageItem, idx) => (
          <div key={stageItem.id} className="rounded-card border border-border bg-surface p-5 mb-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white text-sm font-semibold">
                  {idx + 1}
                </span>
                <div>
                  <h2 className="font-semibold text-ink">{stageItem.title}</h2>
                  <p className="text-sm text-ink-secondary">{stageItem.description}</p>
                </div>
              </div>
              {typeof stageItem.durationMinutes === 'number' && (
                <StatusBadge tone="info">{stageItem.durationMinutes} min</StatusBadge>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-3 mb-4">
              <div className="rounded-card border border-border bg-surface-subtle p-3">
                <p className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1">Candidate action</p>
                <p className="text-sm text-ink">{stageItem.candidateAction || stageItem.description}</p>
              </div>
              <div className="rounded-card border border-border bg-surface-subtle p-3">
                <p className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-1">Evidence captured</p>
                <p className="text-sm text-ink">{stageItem.evidenceCaptured || 'Provide clear evidence tied to this stage objective.'}</p>
              </div>
            </div>

            <TextArea
              label={`Your response: ${stageItem.title}`}
              value={evidence[stageItem.id] ?? ''}
              disabled={assessmentLocked}
              onChange={(e) => {
                const val = e.target.value;
                setEvidence((prev) => ({ ...prev, [stageItem.id]: val }));
                setIsEvidenceDirty(true);
              }}
              onBlur={(e) => handleSave(stageItem.id, e.target.value)}
              placeholder="Write your response here. Your work is saved when you move to the next field or click pause."
              hint="Use concrete evidence, decisions, checks, and trade-offs for this stage."
            />

            <div className="rounded-card border border-border bg-surface-subtle p-3 mt-3">
              <p className="text-xs font-semibold text-ink-secondary uppercase tracking-wide mb-2">Supporting artifacts</p>
              <p className="text-sm text-ink-secondary mb-3">
                Upload files that support this stage response. Files are attached to your assessment workspace.
              </p>

              <input
                type="file"
                disabled={assessmentLocked}
                onChange={async (e) => {
                  const input = e.currentTarget;
                  const file = e.target.files?.[0];
                  if (!file) return;
                  await uploadArtifact(stageItem.id, file);
                  input.value = '';
                }}
                className="block w-full text-sm text-ink-secondary file:mr-3 file:rounded-control file:border-0 file:bg-brand file:px-3 file:py-2 file:text-white hover:file:bg-brand-hover"
              />

              {(artifactsByStage[stageItem.id] ?? []).length > 0 && (
                <div className="mt-3 space-y-2">
                  {(artifactsByStage[stageItem.id] ?? []).map((artifact) => (
                    <div key={artifact.artifactId} className="flex items-center justify-between rounded-card border border-border bg-surface px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Paperclip className="h-4 w-4 text-ink-secondary flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm text-ink truncate">{artifact.filename}</p>
                          <p className="text-xs text-ink-secondary">{Math.ceil(artifact.sizeBytes / 1024)} KB • {artifact.scanStatus}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={assessmentLocked}
                        icon={<Trash2 className="h-4 w-4" />}
                        loading={artifactBusyStageId === stageItem.id}
                        onClick={() => removeArtifact(stageItem.id, artifact.artifactId)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-3">
              <Button
                variant="secondary"
                size="sm"
                disabled={assessmentLocked}
                icon={<Save className="h-4 w-4" />}
                onClick={() => handleSave(stageItem.id, evidence[stageItem.id] ?? '')}
              >
                Save now
              </Button>
            </div>
          </div>
        ))}

        {workspaceData.status !== 'loading' && (
          <div className="rounded-card border border-border bg-surface p-5 mb-4">
            <h2 className="font-semibold text-ink mb-2">AI evidence record</h2>
            <p className="text-sm text-ink-secondary mb-3">
              Record material AI prompts/outputs, checks you performed, corrections you made, and where you did not trust AI.
            </p>
            <TextArea
              label="AI evidence log"
              value={evidence.__ai_evidence__ ?? ''}
              disabled={assessmentLocked}
              onChange={(e) => {
                const val = e.target.value;
                setEvidence((prev) => ({ ...prev, __ai_evidence__: val }));
                setIsEvidenceDirty(true);
              }}
              onBlur={(e) => handleSave('__ai_evidence__', e.target.value)}
              placeholder="Prompt used → output summary → verification steps → corrections → what you rejected and why"
              hint="Do not include personal data, credentials, or confidential customer information."
            />
          </div>
        )}

        {timelineData.status === 'success' && (
          <div className="rounded-card border border-border bg-surface p-5 mb-4">
            <h2 className="font-semibold text-ink mb-2">Evidence timeline</h2>
            <p className="text-sm text-ink-secondary mb-3">
              Review captured events, add context, and flag accidental actions or tool failures.
            </p>
            <div className="space-y-3 max-h-[360px] overflow-auto pr-1">
              {timelineData.data.events.length === 0 && (
                <p className="text-sm text-ink-secondary">No events captured yet.</p>
              )}
              {timelineData.data.events.map((event) => (
                <div key={event.id} className="rounded-card border border-border bg-surface-subtle p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <p className="text-sm font-semibold text-ink">{event.eventType}</p>
                    <p className="text-xs text-ink-secondary">{new Date(event.occurredAt).toLocaleString()}</p>
                  </div>
                  <p className="text-xs text-ink-secondary mb-2">Category: {event.category}</p>
                  <TextArea
                    label="Annotation"
                    value={timelineDraftById[event.id] ?? event.annotation.note ?? ''}
                    onChange={(e) => setTimelineDraftById((prev) => ({ ...prev, [event.id]: e.target.value }))}
                    placeholder="Add context or correction note for this event."
                    className="min-h-[90px]"
                  />
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {['none', 'accidental', 'tool_failure', 'correction'].map((flag) => (
                      <Button
                        key={flag}
                        size="sm"
                        variant={(timelineFlagById[event.id] ?? event.annotation.flag ?? 'none') === flag ? 'primary' : 'secondary'}
                        onClick={() => setTimelineFlagById((prev) => ({ ...prev, [event.id]: flag }))}
                      >
                        {flag}
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      loading={timelineSavingId === event.id}
                      onClick={() => saveTimelineAnnotation(event.id)}
                    >
                      Save annotation
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {artifactError && (
          <div className="mb-4">
            <Alert tone="warning" title="Artifact update issue">
              {artifactError}
            </Alert>
          </div>
        )}

        {workspaceData.status !== 'loading' && (
          <div className="flex items-center justify-between sticky bottom-4 bg-surface rounded-card border border-border shadow-elevated p-3">
            <Button
              variant="secondary"
              size="sm"
              disabled={assessmentLocked}
              icon={<Pause className="h-4 w-4" />}
              onClick={async () => {
                setSaveState('saving');
                try {
                  await saveWorkspace({ ...evidence });
                  setSaveState('saved');
                  setPortalState('paused');
                } catch {
                  setSaveState('error');
                }
              }}
            >
              Save & pause
            </Button>
            <Button
              icon={<ArrowRight className="h-4 w-4" />}
              onClick={async () => {
                if (!assessmentLocked) {
                  setSaveState('saving');
                  try {
                    await saveWorkspace({ ...evidence });
                    setSaveState('saved');
                  } catch {
                    setSaveState('error');
                  }
                }
                setStage('review');
              }}
            >
              Review my answers
            </Button>
          </div>
        )}

        {portalState === 'paused' && (
          <Overlay
            open={portalState === 'paused'}
            onClose={() => setPortalState('assessment')}
            title="Your work is saved"
            footer={
              <Button onClick={() => setPortalState('assessment')}>Continue working</Button>
            }
          >
            <p className="text-sm text-ink">
              You can close this window and come back later using your original invitation link. Your work will be waiting for you.
            </p>
          </Overlay>
        )}
      </CandidateShell>
    );
  }

  // === REVIEW & SUBMIT ===
  if (stage === 'review' && invitation) {
    const answeredCount = invitation.stages.filter((stageItem) => (evidence[stageItem.id] ?? '').trim().length > 0).length;
    const totalCount = invitation.stages.length;
    const missingCount = totalCount - answeredCount;

    return (
      <CandidateShell steps={stepStatuses} orgName={invitation.orgName} supportEmail={invitation.supportContactEmail}>
        <h1 className="text-2xl font-bold text-ink mb-2">Review & submit</h1>
        <p className="text-ink-secondary mb-6">
          Please review your responses below. Once you submit, your evidence will be sent for review by a trained person.
        </p>

        {missingCount > 0 && (
          <div className="mb-4">
            <Alert tone="warning" title={`${missingCount} response${missingCount > 1 ? 's are' : ' is'} empty`}>
              You can submit without completing everything, but empty responses won't be reviewed. You can go back to add more.
            </Alert>
          </div>
        )}

        <div className="space-y-3 mb-6">
          {invitation.stages.map((stageItem, idx) => (
            <div key={stageItem.id} className="rounded-card border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/10 text-brand text-xs font-semibold">
                    {idx + 1}
                  </span>
                  <h2 className="text-sm font-semibold text-ink">{stageItem.title}</h2>
                </div>
                <div className="flex items-center gap-2">
                  {evidence[stageItem.id]?.trim() ? (
                    <StatusBadge tone="success">Completed</StatusBadge>
                  ) : (
                    <StatusBadge tone="warning">Empty</StatusBadge>
                  )}
                  <IconButton
                    label="Edit this response"
                    size="sm"
                    onClick={() => setStage('assessment')}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
              <p className="text-sm text-ink-secondary line-clamp-3 whitespace-pre-wrap">
                {evidence[stageItem.id]?.trim() || 'No response provided.'}
              </p>
            </div>
          ))}
        </div>

        {timelineData.status === 'success' && timelineData.data.events.length > 0 && (
          <div className="rounded-card border border-border bg-surface p-4 mb-6">
            <h2 className="text-sm font-semibold text-ink mb-2">Recent evidence events</h2>
            <ul className="space-y-1.5 text-sm text-ink-secondary">
              {timelineData.data.events.slice(0, 5).map((event) => (
                <li key={event.id}>
                  {event.eventType} at {new Date(event.occurredAt).toLocaleTimeString()}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-card bg-surface-subtle p-4 mb-6">
          <h2 className="text-sm font-semibold text-ink mb-2">Privacy reminder</h2>
          <p className="text-sm text-ink-secondary">
            By submitting, you consent to your evidence being reviewed by a trained reviewer at {invitation.orgName}. Your data is handled according to their retention policy. You can withdraw your submission later if you change your mind.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setStage('assessment')}>
            Back to assessment
          </Button>
          <Button icon={<Send className="h-4 w-4" />} onClick={() => setSubmitDialogOpen(true)}>
            Submit my assessment
          </Button>
        </div>

        <ConfirmationDialog
          open={submitDialogOpen}
          title="Submit your assessment?"
          description={`You are about to submit ${answeredCount} of ${totalCount} responses. This will send your evidence for review. You can withdraw later if needed.`}
          confirmLabel="Yes, submit"
          cancelLabel="Not yet"
          onConfirm={handleSubmit}
          onCancel={() => setSubmitDialogOpen(false)}
        />
      </CandidateShell>
    );
  }

  // Fallback — shouldn't reach here
  return null;
}
