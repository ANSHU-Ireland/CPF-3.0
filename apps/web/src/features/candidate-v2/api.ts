/**
 * Candidate V2 runtime client (S11–S14). All calls carry the invitation token;
 * session-scoped calls add the x-cpf-candidate-token header. No mock modes.
 */

export interface V2Landing {
  candidateName: string;
  experienceVersion: string;
  state: string;
  sessionId: string | null;
  pack: {
    packCode: string;
    packVersion: number;
    title: string;
    targetRole: string;
    expectedDurationMinutes: number;
    brief: string;
    stages: Array<{ id: string; title: string; guidance: string; suggestedMinutes: number; deliverableSlots: string[] }>;
    assets: Array<{ path: string; title: string; mimeType: string; content: string }>;
    deliverables: Array<{ slot: string; title: string; kind: string; required: boolean; acceptanceSummary: string }>;
    dimensions: Array<{ dimensionId: string }>;
    accessibilityNotes: string;
    plugins: Array<{ pluginId: string; pluginVersion: string; mode: string; essential: boolean }>;
  };
  notices: Record<string, string>;
}

export class V2ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "V2ApiError";
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  let code = "UNKNOWN";
  let message = `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
  } catch {
    // non-JSON error body
  }
  throw new V2ApiError(res.status, code, message);
}

export const v2 = {
  landing: (token: string) => fetch(`/v2/candidate/${encodeURIComponent(token)}`).then((r) => parse<V2Landing>(r)),
  disclose: (token: string) =>
    fetch(`/v2/candidate/${encodeURIComponent(token)}/disclose`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).then((r) => parse<{ sessionId: string; state: string; manifest: { nonce: string; timeboxMinutes: number } }>(r)),
  lifecycle: (token: string, step: "preflight/complete" | "check-in" | "start") =>
    fetch(`/v2/candidate/${encodeURIComponent(token)}/${step}`, { method: "POST" }).then((r) =>
      parse<{ state: string; sessionId: string; remainingSeconds: number }>(r),
    ),
  state: (token: string, sessionId: string) =>
    fetch(`/v2/sessions/${sessionId}/state`, { headers: { "x-cpf-candidate-token": token } }).then((r) =>
      parse<{ state: string; remainingSeconds: number; serverTime: string; timeboxMinutes: number; manifestNonce: string }>(r),
    ),
  saveArtifact: (
    token: string,
    sessionId: string,
    path: string,
    body: { kind: string; deliverableSlot?: string | null; content: string; baseVersionNo: number },
  ) =>
    fetch(`/v2/sessions/${sessionId}/artifacts/${path}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-cpf-candidate-token": token },
      body: JSON.stringify(body),
    }).then((r) => parse<{ artifactId: string; versionNo: number; contentHash: string; savedAt: string }>(r)),
  listArtifacts: (token: string, sessionId: string) =>
    fetch(`/v2/sessions/${sessionId}/artifacts`, { headers: { "x-cpf-candidate-token": token } }).then((r) =>
      parse<{ artifacts: Array<{ path: string; kind: string; deliverable_slot: string | null; latest_version_no: number; final_version_no: number | null }> }>(r),
    ),
  copilot: (token: string, sessionId: string, text: string) =>
    fetch(`/v2/sessions/${sessionId}/copilot/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cpf-candidate-token": token },
      body: JSON.stringify({ text }),
    }).then((r) => parse<{ turnNo: number; message: { role: string; text: string; validationStatus: string }; budget: { turnsUsed: number; turnsMax: number } }>(r)),
  transcript: (token: string, sessionId: string) =>
    fetch(`/v2/sessions/${sessionId}/copilot/messages`, { headers: { "x-cpf-candidate-token": token } }).then((r) =>
      parse<{ messages: Array<{ turn_no: number; role: string; displayed_text: string; validation_status: string }> }>(r),
    ),
  invokeTool: (token: string, sessionId: string, pluginId: string, operation: string, args: Record<string, unknown>) =>
    fetch(`/v2/sessions/${sessionId}/tools/${pluginId}/${operation}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cpf-candidate-token": token,
        "idempotency-key": `ui-${crypto.randomUUID()}`,
      },
      body: JSON.stringify({ arguments: args }),
    }).then((r) => parse<{ receipt: { invocation_id: string; status: string; source_descriptor: string }; result: unknown }>(r)),
  receipts: (token: string, sessionId: string) =>
    fetch(`/v2/sessions/${sessionId}/tools/receipts`, { headers: { "x-cpf-candidate-token": token } }).then((r) =>
      parse<{ receipts: Array<{ invocation_id: string; plugin_id: string; operation: string; status: string; source_descriptor: string; started_at: string }> }>(r),
    ),
  reportIncident: (token: string, sessionId: string, category: string, description: string) =>
    fetch(`/v2/sessions/${sessionId}/incidents`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cpf-candidate-token": token },
      body: JSON.stringify({ category, description }),
    }).then((r) => parse<{ incidentId: string; status: string }>(r)),
  pause: (token: string, sessionId: string) =>
    fetch(`/v2/sessions/${sessionId}/pause`, { method: "POST", headers: { "x-cpf-candidate-token": token } }).then((r) => parse<{ state: string }>(r)),
  resume: (token: string, sessionId: string) =>
    fetch(`/v2/sessions/${sessionId}/resume`, { method: "POST", headers: { "x-cpf-candidate-token": token } }).then((r) => parse<{ state: string }>(r)),
  finalise: (token: string, sessionId: string, manifestNonce: string, declaredLimitations: string) =>
    fetch(`/v2/sessions/${sessionId}/finalise`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cpf-candidate-token": token },
      body: JSON.stringify({ manifestNonce, declaredLimitations }),
    }).then((r) =>
      parse<{ receipt: { id: string; support_code: string; artifact_head: string; event_head: string | null; signature: string; submitted_at: string }; replay: boolean }>(r),
    ),
};
