import type { AssessmentPack, HiddenCheck } from "./schema.js";
import { weightSet } from "./anchors.js";

/** SWE-FS-01 — tenant-safe product change (full-stack, mid level). */
export const SWE_FS_01: AssessmentPack = {
  packCode: "SWE-FS-01",
  packVersion: 1,
  title: "Tenant-safe product change",
  targetRole: "Full-stack software engineer",
  targetLevel: "mid",
  roleFamily: "software-engineering",
  expectedDurationMinutes: 110,
  brief:
    "You are joining the team that runs a multi-tenant B2B invoicing product. Product wants a " +
    "'bulk archive' action on the invoice list: a customer admin selects up to 50 invoices and " +
    "archives them in one action. The platform is strictly tenant-isolated (every table carries " +
    "organisation_id with row-level security) and all state changes must be audited. Your job in " +
    "this session: (1) plan the change, (2) implement the API endpoint and the repository layer " +
    "against the supplied codebase snapshot, (3) make the visible test suite pass, and (4) write " +
    "a handover note covering risks, tenancy guarantees, and what you would ship behind a flag. " +
    "The AI copilot and the sandbox tools are there to be used — how you direct and verify them " +
    "is part of day-to-day work. Nothing you do here can reach a real system.",
  jobAnalysisNote:
    "Mirrors the dominant work sample for mid-level product engineers in multi-tenant SaaS: " +
    "scoped feature delivery in an existing codebase where tenancy and audit are non-negotiable. " +
    "Maps to dimensions: framing, execution quality, verification, risk judgement, handover.",
  stages: [
    {
      id: "plan",
      title: "Plan the change",
      guidance: "Read the brief, the API conventions asset and the schema. Write a short plan: endpoint contract, tenancy checks, audit event, rollout note.",
      suggestedMinutes: 20,
      deliverableSlots: ["plan"],
    },
    {
      id: "implement",
      title: "Implement endpoint + repository",
      guidance: "Implement POST /v1/orgs/:orgId/invoices:bulk-archive in the sandbox repo. Use RepoFS/TestRunner. Keep tenancy + audit invariants.",
      suggestedMinutes: 55,
      deliverableSlots: ["code_patch"],
    },
    {
      id: "verify",
      title: "Verify and harden",
      guidance: "Run the visible tests. Consider limit enforcement, idempotency, partial failure, and cross-tenant attack attempts.",
      suggestedMinutes: 20,
      deliverableSlots: [],
    },
    {
      id: "handover",
      title: "Handover note",
      guidance: "Write the handover: what shipped, tenancy guarantees, known gaps, flag/rollback plan, what you'd do next.",
      suggestedMinutes: 15,
      deliverableSlots: ["handover"],
    },
  ],
  assets: [
    {
      path: "docs/api-conventions.md",
      title: "API conventions",
      mimeType: "text/markdown",
      content:
        "# API conventions\n- Errors: { error: { code, message, requestId, retryable } }\n- All org routes: requireOrgRole guard sets request.orgId; repositories MUST filter by organisation_id\n- Mutations append an audit event (action, entityType, entityId)\n- Bulk operations: max 50 items, reject the whole batch on any cross-tenant id (no partial silent success)\n- Idempotency-Key header honoured on bulk mutations",
    },
    {
      path: "db/schema.sql",
      title: "Relevant schema",
      mimeType: "text/plain",
      content:
        "CREATE TABLE invoices (\n  id uuid PRIMARY KEY,\n  organisation_id uuid NOT NULL,\n  status text NOT NULL CHECK (status IN ('draft','sent','paid','archived')),\n  archived_at timestamptz,\n  updated_at timestamptz NOT NULL DEFAULT now()\n);\nCREATE POLICY invoices_tenant_isolation ON invoices USING (organisation_id = current_org_id());",
    },
    {
      path: "src/invoices/repository.ts",
      title: "Repository (to extend)",
      mimeType: "text/plain",
      content:
        "export async function listInvoices(client, orgId, cursor) { /* existing */ }\n// TODO(candidate): bulkArchive(client, orgId, invoiceIds: string[]) — must be tenant-safe and auditable",
    },
    {
      path: "test/bulk-archive.visible.test.md",
      title: "Visible acceptance tests (description)",
      mimeType: "text/markdown",
      content:
        "1. archives 3 own-tenant sent invoices → 200, all archived_at set, audit row appended\n2. any foreign-tenant id in batch → 403, nothing archived\n3. >50 ids → 422 BATCH_LIMIT\n4. repeat with same Idempotency-Key → same response, no duplicate audit\n5. draft invoices are not archivable → 422 with per-item reasons",
    },
  ],
  deliverables: [
    { slot: "plan", title: "Change plan", kind: "document", required: true, acceptanceSummary: "Endpoint contract, tenancy approach, audit event, rollout/flag note." },
    { slot: "code_patch", title: "Implementation patch", kind: "code_patch", required: true, acceptanceSummary: "bulkArchive repository + route handler; visible tests pass; tenancy enforced." },
    { slot: "handover", title: "Handover note", kind: "handover_note", required: true, acceptanceSummary: "What shipped, guarantees, gaps, rollback, next steps." },
  ],
  dimensionWeights: weightSet({
    problem_framing: 12,
    delegation_to_ai: 8,
    verification_of_ai_output: 12,
    correction_and_iteration: 8,
    tool_orchestration: 10,
    evidence_grounding: 8,
    communication_handover: 12,
    risk_and_safety_judgement: 12,
    execution_quality: 12,
    time_and_scope_management: 6,
  }),
  calibrationCases: [
    {
      id: "cal-fs01-a",
      summary:
        "Candidate shipped a working endpoint quickly by accepting copilot code wholesale; missed the cross-tenant batch rejection; handover was two lines.",
      expectedAnchors: {
        problem_framing: "capable",
        delegation_to_ai: "capable",
        verification_of_ai_output: "developing",
        correction_and_iteration: "capable",
        tool_orchestration: "capable",
        evidence_grounding: "capable",
        communication_handover: "developing",
        risk_and_safety_judgement: "developing",
        execution_quality: "capable",
        time_and_scope_management: "strong",
      },
      rationale: "Speed came from unverified delegation: the tenancy hole and thin handover are exactly what the rubric separates from execution pace.",
    },
    {
      id: "cal-fs01-b",
      summary:
        "Candidate wrote the plan first, directed the copilot per subtask, added a cross-tenant negative test unprompted, ran out of time to polish per-item errors but declared it in the handover.",
      expectedAnchors: {
        problem_framing: "strong",
        delegation_to_ai: "strong",
        verification_of_ai_output: "strong",
        correction_and_iteration: "capable",
        tool_orchestration: "strong",
        evidence_grounding: "strong",
        communication_handover: "strong",
        risk_and_safety_judgement: "exemplary",
        execution_quality: "capable",
        time_and_scope_management: "strong",
      },
      rationale: "Unprompted adversarial test = exemplary risk judgement; declared scope cut is strong time management, not a defect.",
    },
  ],
  plugins: [
    { pluginId: "repofs", pluginVersion: "1.0.0", mode: "session_sandbox", essential: true, maxInvocations: 2000 },
    { pluginId: "testrunner", pluginVersion: "1.0.0", mode: "session_sandbox", essential: true, maxInvocations: 200 },
    { pluginId: "apiclient", pluginVersion: "1.0.0", mode: "session_sandbox", essential: false, maxInvocations: 300 },
    { pluginId: "dbplan", pluginVersion: "1.0.0", mode: "read_only", essential: false, maxInvocations: 100 },
  ],
  copilotPromptRef: "copilot/swe-base@2026-08-03.1",
  rubricVersion: "rubric/swe-fs-01@1",
  accessibilityNotes:
    "All assets are text-based and screen-reader friendly. Editor supports keyboard-only flow; test output is exposed as structured text. Time extensions apply server-side per accommodation policy.",
  changeLog: "1: initial publication for controlled pilot.",
};

export const SWE_FS_01_HIDDEN: HiddenCheck[] = [
  { id: "h-fs01-tenancy", description: "Patch mentions organisation_id filtering in bulkArchive", kind: "contains", target: "code_patch", pattern: "organisation_id" },
  { id: "h-fs01-audit", description: "Patch appends an audit event", kind: "regex", target: "code_patch", pattern: "audit" },
  { id: "h-fs01-limit", description: "Patch enforces the 50-item batch limit", kind: "regex", target: "code_patch", pattern: "50|BATCH_LIMIT" },
  { id: "h-fs01-handover-risk", description: "Handover names at least one risk or gap", kind: "regex", target: "handover", pattern: "risk|gap|known issue|limitation" },
];

/** SWE-PLAT-02 — production incident and remediation (platform, senior). */
export const SWE_PLAT_02: AssessmentPack = {
  packCode: "SWE-PLAT-02",
  packVersion: 1,
  title: "Production incident and remediation",
  targetRole: "Platform / backend engineer",
  targetLevel: "senior",
  roleFamily: "software-engineering",
  expectedDurationMinutes: 110,
  brief:
    "You are on call for a payments API. At 09:12 UTC error rates on POST /charges jumped from " +
    "0.2% to 14% and p95 latency tripled. A deploy went out at 09:05. You have read-only access " +
    "to logs, traces and metrics snapshots for the incident window, the deploy diff, and a " +
    "feature-flag simulator for staging reversible mitigations. Your job: (1) triage and identify " +
    "the most plausible cause from the supplied evidence, (2) stage the safest immediate " +
    "mitigation with the FeatureFlagLab, (3) write the incident timeline with evidence citations, " +
    "and (4) propose the durable remediation plus the follow-up guardrail (test/alert) that would " +
    "have caught this before customers did. Correlation is not causation — cite receipts.",
  jobAnalysisNote:
    "Senior platform work sample: evidence-driven incident triage, reversible mitigation bias, " +
    "and postmortem quality. Weights emphasise evidence grounding, risk judgement, and verification.",
  stages: [
    { id: "triage", title: "Triage the incident", guidance: "Query LogLab/TraceLab/MetricsLab snapshots. Correlate the deploy diff with observed failure modes.", suggestedMinutes: 35, deliverableSlots: [] },
    { id: "mitigate", title: "Stage the mitigation", guidance: "Use FeatureFlagLab to stage the least-risky reversible mitigation. Confirm the candidate flag actually gates the suspect path.", suggestedMinutes: 20, deliverableSlots: ["mitigation"] },
    { id: "timeline", title: "Incident timeline", guidance: "Write the timeline: detection, evidence, decision points. Cite receipt IDs for every material claim.", suggestedMinutes: 30, deliverableSlots: ["timeline"] },
    { id: "remediate", title: "Durable remediation", guidance: "Propose the fix + the guardrail (test/alert/SLO) with rollout order.", suggestedMinutes: 25, deliverableSlots: ["remediation"] },
  ],
  assets: [
    {
      path: "incident/deploy-diff.md",
      title: "09:05 deploy diff (summary)",
      mimeType: "text/markdown",
      content:
        "# Deploy 2026-08-03 09:05 UTC\n- charges-service: connection pool max 50→15 ('cost tuning')\n- charges-service: retry policy on gateway timeouts 0→2 retries\n- checkout-web: button copy change (no backend impact)",
    },
    {
      path: "incident/logs-sample.txt",
      title: "Log excerpt 09:10–09:20",
      mimeType: "text/plain",
      content:
        "09:12:03 charges ERROR pool exhausted waiting 5000ms clientId=c-4411\n09:12:04 charges WARN retrying gateway timeout attempt=1 chargeId=ch_9912\n09:12:09 charges ERROR pool exhausted waiting 5000ms clientId=c-8123\n09:12:11 charges WARN retrying gateway timeout attempt=2 chargeId=ch_9912\n09:12:14 gateway INFO upstream latency 4200ms (baseline 300ms)\n09:13:20 charges ERROR request aborted after 15000ms chargeId=ch_10233",
    },
    {
      path: "incident/metrics-notes.md",
      title: "Metrics snapshot notes",
      mimeType: "text/markdown",
      content:
        "- pool.in_use pinned at 15/15 from 09:11 (was ~22/50 baseline)\n- gateway.upstream_latency_p95: 300ms → 4.1s from 09:08 (starts BEFORE deploy ramp completes)\n- retry.count: 0 → 900/min from 09:10\n- error.rate follows pool exhaustion, not upstream latency directly",
    },
  ],
  deliverables: [
    { slot: "mitigation", title: "Staged mitigation", kind: "document", required: true, acceptanceSummary: "Flag choice + why it is the least-risky reversible action; verification receipt cited." },
    { slot: "timeline", title: "Incident timeline", kind: "document", required: true, acceptanceSummary: "Chronology with receipt citations; separates evidence from hypothesis." },
    { slot: "remediation", title: "Remediation + guardrail", kind: "document", required: true, acceptanceSummary: "Durable fix, guardrail, rollout order, ownership." },
  ],
  dimensionWeights: weightSet({
    problem_framing: 10,
    delegation_to_ai: 6,
    verification_of_ai_output: 12,
    correction_and_iteration: 8,
    tool_orchestration: 12,
    evidence_grounding: 16,
    communication_handover: 10,
    risk_and_safety_judgement: 14,
    execution_quality: 6,
    time_and_scope_management: 6,
  }),
  calibrationCases: [
    {
      id: "cal-plat02-a",
      summary: "Candidate blamed the retry change alone (plausible narrative), staged a flag disabling retries, but never reconciled the upstream-latency-started-first metric; timeline cites no receipts.",
      expectedAnchors: {
        problem_framing: "capable",
        delegation_to_ai: "capable",
        verification_of_ai_output: "developing",
        correction_and_iteration: "capable",
        tool_orchestration: "capable",
        evidence_grounding: "developing",
        communication_handover: "capable",
        risk_and_safety_judgement: "capable",
        execution_quality: "capable",
        time_and_scope_management: "strong",
      },
      rationale: "Uncited, partially contradicted narrative caps evidence grounding at developing even though the mitigation was sane.",
    },
    {
      id: "cal-plat02-b",
      summary: "Candidate identified the interaction (upstream slowdown × shrunken pool × new retries amplifying load), staged pool-size revert as the least-risky action, cited receipts throughout, proposed a saturation alert.",
      expectedAnchors: {
        problem_framing: "strong",
        delegation_to_ai: "strong",
        verification_of_ai_output: "strong",
        correction_and_iteration: "strong",
        tool_orchestration: "strong",
        evidence_grounding: "exemplary",
        communication_handover: "strong",
        risk_and_safety_judgement: "strong",
        execution_quality: "strong",
        time_and_scope_management: "capable",
      },
      rationale: "Multi-factor causal reasoning with receipts and a guardrail is the exemplar for evidence grounding.",
    },
  ],
  plugins: [
    { pluginId: "loglab", pluginVersion: "1.0.0", mode: "read_only", essential: true, maxInvocations: 300 },
    { pluginId: "tracelab", pluginVersion: "1.0.0", mode: "read_only", essential: false, maxInvocations: 200 },
    { pluginId: "metricslab", pluginVersion: "1.0.0", mode: "read_only", essential: true, maxInvocations: 300 },
    { pluginId: "featureflaglab", pluginVersion: "1.0.0", mode: "simulated", essential: true, maxInvocations: 50 },
  ],
  copilotPromptRef: "copilot/swe-base@2026-08-03.1",
  rubricVersion: "rubric/swe-plat-02@1",
  accessibilityNotes: "All incident data is text; charts are provided as tabular notes. No time-critical animations; the scenario clock is narrative, not real.",
  changeLog: "1: initial publication for controlled pilot.",
};

export const SWE_PLAT_02_HIDDEN: HiddenCheck[] = [
  { id: "h-plat02-cite", description: "Timeline cites at least one receipt id", kind: "regex", target: "timeline", pattern: "rcpt-|receipt" },
  { id: "h-plat02-interaction", description: "Remediation acknowledges interaction of pool/retries/upstream", kind: "regex", target: "remediation", pattern: "pool.*(retry|retries)|retr(y|ies).*pool" },
  { id: "h-plat02-guardrail", description: "Remediation includes a guardrail", kind: "regex", target: "remediation", pattern: "alert|SLO|test|monitor" },
];
