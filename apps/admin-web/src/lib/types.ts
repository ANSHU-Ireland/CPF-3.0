/**
 * Domain view models at the adapter boundary.
 * These are explicit handwritten types matching the OpenAPI contract shapes
 * we depend on. Generated types would replace these once stable.
 */

export interface AuthSession {
  token: string;
  role: Role;
  orgId: string | null;
  orgName: string | null;
  userId: string;
  email: string;
  displayName: string;
  mfaEnrolled: boolean;
}

export type Role = 'platform_admin' | 'employer_admin' | 'reviewer' | 'candidate';

/** Candidate-facing invitation state */
export type CandidatePortalState =
  | 'welcome'
  | 'disclosure'
  | 'assessment'
  | 'review'
  | 'submitted'
  | 'paused'
  | 'withdrawn'
  | 'report_issued'
  | 'expired'
  | 'error';

export interface AssessmentInvitation {
  token: string;
  assessmentCode?: string;
  assessmentTitle: string;
  assessmentPurpose: string;
  expectedDurationMinutes: number;
  stages: AssessmentStage[];
  orgName: string;
  jobProfileTitle: string;
  supportContactEmail: string;
  expiresAt: string;
}

export interface AssessmentStage {
  id: string;
  title: string;
  description: string;
  order: number;
  durationMinutes?: number;
  candidateAction?: string;
  evidenceCaptured?: string;
}

export interface AssessmentTask {
  id: string;
  stageId: string;
  title: string;
  brief: string;
  resources: AssessmentResource[];
  allowedTools: string[];
  required: boolean;
}

export interface AssessmentResource {
  id: string;
  title: string;
  type: 'document' | 'link' | 'description';
  url?: string;
  content?: string;
}

export interface CandidateEvidenceEntry {
  id: string;
  taskId: string;
  content: string;
  lastSavedAt: string | null;
}

export interface ReviewItem {
  reviewId: string;
  assessmentTitle: string;
  jobProfileTitle: string;
  candidateName: string;
  assignedRole: string;
  submittedDate: string;
  dueDate: string | null;
  reviewProgress: number;
  hasConflict: boolean;
  status: 'assigned' | 'in_progress' | 'draft' | 'ready_to_finalise';
}

export interface ReviewDetail {
  reviewId: string;
  candidateName: string;
  candidateId: string;
  assessmentTitle: string;
  jobProfileTitle: string;
  dimensions: ReviewDimension[];
  integritySignals: IntegritySignal[];
  secondReviewRequired: boolean;
  aiAssistEnabled: boolean;
  aiAssistBudgetRemaining: boolean;
}

export interface ReviewDimension {
  id: string;
  title: string;
  description: string;
  criteria: ReviewCriterion[];
}

export interface ReviewCriterion {
  id: string;
  title: string;
  description: string;
  status: 'unscored' | 'scored' | 'flagged';
  scoreOptions: RubricAnchor[];
  selectedScore: string | null;
  rationale: string | null;
  limitations: string | null;
  claims: ReviewClaim[];
  evidenceRefs: EvidenceReference[];
}

export interface RubricAnchor {
  value: string;
  label: string;
  description: string;
}

export interface ReviewClaim {
  id: string;
  text: string;
  evidenceRefIds: string[];
}

export interface EvidenceReference {
  id: string;
  label: string;
  timestamp: string;
  type: 'submission' | 'document' | 'metadata';
}

export interface IntegritySignal {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  requiresHumanInterpretation: boolean;
}

export interface Organisation {
  id: string;
  name: string;
  status: 'active' | 'suspended' | 'provisioning';
  planName: string;
  userCount: number;
  candidateCount: number;
  createdAt: string;
  mfaEnforcementEnabled: boolean;
}

export interface Plan {
  id: string;
  name: string;
  maxUsers: number;
  maxCandidates: number;
  modules: string[];
  description: string;
}

export interface TeamMember {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: 'active' | 'invited' | 'suspended';
  mfaEnrolled: boolean;
  lastActiveAt: string | null;
  calibrationCount: number;
}

export interface PipelineRow {
  sessionId: string;
  candidateName: string;
  jobProfileTitle: string;
  status: string;
  dueDate: string | null;
  age: string;
  assignedReviewer: string | null;
  hasAccommodations: boolean;
  submittedAt: string | null;
}

export interface ComplianceReadiness {
  categories: ComplianceCategory[];
  overallStatus: 'on_track' | 'attention_needed' | 'blocked';
}

export interface ComplianceCategory {
  key: string;
  label: string;
  status: 'implemented' | 'evidence_pending' | 'blocked';
  ownerName: string | null;
  ownerEmail: string | null;
  lastReviewedAt: string | null;
  description: string;
  nextAction: string | null;
}

export interface EvidenceProfile {
  id: string;
  candidateName: string;
  jobProfileTitle: string;
  version: number;
  issuedAt: string;
  dimensions: EvidenceProfileDimension[];
  limitations: string[];
  counterEvidence: string[];
  responsibleUseAcknowledged: boolean;
  notEmploymentDecision: boolean;
}

export interface EvidenceProfileDimension {
  id: string;
  title: string;
  band: string;
  description: string;
}

export interface DataRightsCase {
  id: string;
  candidateName: string;
  requestType: 'access' | 'rectification' | 'erasure' | 'portability' | 'objection';
  status: 'new' | 'in_progress' | 'awaiting_validation' | 'completed' | 'on_hold';
  submittedAt: string;
  dueByDate: string;
  ownerName: string | null;
  legalHold: boolean;
}

export interface SupportAccessRequest {
  id: string;
  orgName: string;
  reason: string;
  scope: string;
  requestedBy: string;
  approver: string | null;
  status: 'requested' | 'active' | 'expired' | 'revoked';
  grantedAt: string | null;
  expiresAt: string | null;
}

export interface SuppressedMetric {
  label: string;
  value: number | string;
  suppressed: boolean;
}

/** K-anonymity helper: API may return a suppression string or a real number */
export function resolveSuppressed(raw: number | string | null | undefined): SuppressedMetric {
  if (raw === null || raw === undefined) {
    return { label: '', value: '—', suppressed: true };
  }
  if (typeof raw === 'string') {
    return { label: '', value: '< 5 organisations', suppressed: true };
  }
  return { label: '', value: raw, suppressed: false };
}

/** Forbidden outcome vocabulary — must never appear in production UI */
export const FORBIDDEN_TERMS = [
  'hire', 'reject', 'pass', 'fail', 'shortlist', 'cut-off', 'leaderboard',
  'rank', 'ranking', 'merit score', 'employment verdict',
];

export function containsForbiddenTerm(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_TERMS.some((term) => lower.includes(term));
}
