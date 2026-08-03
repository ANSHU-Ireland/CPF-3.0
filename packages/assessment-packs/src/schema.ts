import { z } from "zod";

/**
 * S07 — pack schema. A published pack version is immutable: publish computes
 * a content hash; any edit is a clone to a new version (DB trigger enforces).
 * Weights total 100 but stay separate dimensions — no universal aggregate is
 * ever shown (ADR-002). Hidden checks never enter candidate/model context.
 */

export const DIMENSION_IDS = [
  "problem_framing",
  "delegation_to_ai",
  "verification_of_ai_output",
  "correction_and_iteration",
  "tool_orchestration",
  "evidence_grounding",
  "communication_handover",
  "risk_and_safety_judgement",
  "execution_quality",
  "time_and_scope_management",
] as const;
export type DimensionId = (typeof DIMENSION_IDS)[number];

export const PackStage = z
  .object({
    id: z.string().min(1).max(60),
    title: z.string().min(1).max(160),
    guidance: z.string().min(1).max(4000),
    /** Stages guide; the candidate can revisit before submission. */
    suggestedMinutes: z.number().int().min(5).max(180),
    deliverableSlots: z.array(z.string().min(1).max(80)).max(8),
  })
  .strict();

export const PackAsset = z
  .object({
    path: z.string().min(1).max(200),
    title: z.string().min(1).max(160),
    mimeType: z.string().min(3).max(100),
    /** Deterministic seed content (small, text-based, non-personal). */
    content: z.string().max(100_000),
  })
  .strict();

export const DeliverableSpec = z
  .object({
    slot: z.string().min(1).max(80),
    title: z.string().min(1).max(160),
    kind: z.enum(["document", "table", "creative", "code_patch", "handover_note", "file"]),
    required: z.boolean(),
    acceptanceSummary: z.string().min(1).max(1000),
  })
  .strict();

export const DimensionWeight = z
  .object({
    dimensionId: z.enum(DIMENSION_IDS),
    weight: z.number().int().min(0).max(40),
    /** Anchor descriptions shown to reviewers (candidate-safe wording). */
    anchors: z
      .object({
        developing: z.string().min(1).max(600),
        capable: z.string().min(1).max(600),
        strong: z.string().min(1).max(600),
        exemplary: z.string().min(1).max(600),
      })
      .strict(),
  })
  .strict();

export const CalibrationCase = z
  .object({
    id: z.string().min(1).max(60),
    summary: z.string().min(1).max(2000),
    expectedAnchors: z.record(z.enum(DIMENSION_IDS), z.enum(["not_observed", "developing", "capable", "strong", "exemplary"])),
    rationale: z.string().min(1).max(2000),
  })
  .strict();

/** Hidden acceptance check — SEPARATE export; never serialised to candidates/models. */
export const HiddenCheck = z
  .object({
    id: z.string().min(1).max(60),
    description: z.string().min(1).max(1000),
    /** Deterministic predicate over deliverable content, evaluated server-side. */
    kind: z.enum(["contains", "not_contains", "regex", "table_column_present"]),
    target: z.string().min(1).max(80),
    pattern: z.string().min(1).max(400),
  })
  .strict();

export const PluginRequirement = z
  .object({
    pluginId: z.string().min(1).max(80),
    pluginVersion: z.string().min(1).max(40),
    mode: z.enum(["read_only", "draft_preview", "session_sandbox", "simulated"]),
    essential: z.boolean(),
    maxInvocations: z.number().int().positive().max(10_000),
  })
  .strict();

export const AssessmentPack = z
  .object({
    packCode: z.string().regex(/^(SWE|DM)-[A-Z]+-\d{2}$/),
    packVersion: z.number().int().positive(),
    title: z.string().min(1).max(160),
    targetRole: z.string().min(1).max(120),
    targetLevel: z.enum(["junior", "mid", "senior"]),
    roleFamily: z.enum(["software-engineering", "digital-marketing"]),
    expectedDurationMinutes: z.number().int().min(60).max(240),
    brief: z.string().min(100).max(20_000),
    jobAnalysisNote: z.string().min(1).max(4000),
    stages: z.array(PackStage).min(2).max(8),
    assets: z.array(PackAsset).max(16),
    deliverables: z.array(DeliverableSpec).min(1).max(10),
    dimensionWeights: z.array(DimensionWeight).length(10),
    calibrationCases: z.array(CalibrationCase).min(2).max(10),
    plugins: z.array(PluginRequirement).max(16),
    copilotPromptRef: z.string().min(1).max(120),
    rubricVersion: z.string().min(1).max(64),
    accessibilityNotes: z.string().min(1).max(4000),
    changeLog: z.string().max(4000),
  })
  .strict()
  .superRefine((pack, ctx) => {
    const total = pack.dimensionWeights.reduce((sum, w) => sum + w.weight, 0);
    if (total !== 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `dimension weights must total 100 (got ${total})` });
    }
    const ids = new Set(pack.dimensionWeights.map((w) => w.dimensionId));
    if (ids.size !== 10) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "all ten dimensions must appear exactly once" });
    }
  });
export type AssessmentPack = z.infer<typeof AssessmentPack>;
export type HiddenCheck = z.infer<typeof HiddenCheck>;
