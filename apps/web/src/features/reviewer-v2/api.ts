/** Reviewer V2 client (S16/S17). Uses the org-scoped V2 review endpoints. */
import { api } from "../../api.js";

export interface QueueItem {
  sessionId: string;
  pseudonym: string;
  packCode: string;
  packVersion: number;
  targetRole: string;
  targetLevel: string;
  status: string;
  submittedAt: string | null;
  slaHoursRemaining: number;
  assignedToMe: boolean;
  secondReviewRequired: boolean;
  technicalIncidents: boolean;
}

export interface ReviewBundle {
  sessionId: string;
  pseudonym: string;
  state: string;
  pack: {
    packCode: string;
    packVersion: number;
    title: string;
    targetRole: string;
    targetLevel: string;
    deliverables: Array<{ slot: string; title: string; kind: string; required: boolean; acceptanceSummary: string }>;
    dimensions: Array<{ dimensionId: string; anchors: Record<string, string> }>;
  };
  myRound: number | null;
  secondReviewRequired: boolean;
  artifacts: Array<{ id: string; path: string; kind: string; deliverable_slot: string | null; final_version_no: number | null; content: string | null; content_hash: string; provenance: string }>;
  versionHistory: Array<{ artifact_id: string; version_no: number; content_hash: string; provenance: string; created_at: string; path: string }>;
  aiTranscript: Array<{ turn_no: number; role: string; displayed_text: string; validation_status: string }>;
  toolReceipts: Array<{ invocation_id: string; plugin_id: string; operation: string; status: string; source_descriptor: string; started_at: string }>;
  technicalIncidents: Array<{ id: string; category: string; description: string; status: string; opened_at: string }>;
  hiddenCheckResults: { results: Array<{ id: string; passed: boolean }>; declaredLimitations?: string } | null;
  dimensionReviews: Array<{ review_round: number; dimension_id: string; anchor: string; rationale: string; confidence: string }>;
}

export const reviewV2 = {
  queue: (orgId: string) => api.get<{ items: QueueItem[] }>(`/v2/orgs/${orgId}/reviews/queue`),
  bundle: (orgId: string, sessionId: string) => api.get<ReviewBundle>(`/v2/orgs/${orgId}/reviews/${sessionId}`),
  saveDimension: (
    orgId: string,
    sessionId: string,
    dimensionId: string,
    body: { anchor: string; rationale: string; confidence: string; limitations?: string; citedEvidence?: string[]; counterEvidence?: string[]; followUpProbe?: string },
  ) => api.put<{ saved: boolean }>(`/v2/orgs/${orgId}/reviews/${sessionId}/dimensions/${dimensionId}`, body),
  finalise: (orgId: string, sessionId: string) => api.post<{ outcome: string }>(`/v2/orgs/${orgId}/reviews/${sessionId}/finalise`, {}),
};
