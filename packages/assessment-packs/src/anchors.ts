import type { AssessmentPack } from "./schema.js";

/**
 * Shared reviewer anchor library. Packs reference these standard anchors;
 * only role-specific overrides are authored per pack (keeps calibration
 * language consistent across packs, which the I-O review requires).
 */
type AnchorSet = { developing: string; capable: string; strong: string; exemplary: string };

export const STANDARD_ANCHORS: Record<string, AnchorSet> = {
  problem_framing: {
    developing: "Restates the brief without identifying the underlying goal, constraints or success measures.",
    capable: "Identifies the core goal and at least the material constraints; states a workable definition of done.",
    strong: "Frames the problem with explicit constraints, assumptions, success measures and out-of-scope calls.",
    exemplary: "Reframes ambiguous requirements into a testable plan; surfaces a constraint or risk the brief did not state.",
  },
  delegation_to_ai: {
    developing: "Uses the copilot for everything or nothing; prompts are unfocused; no evident division of labour.",
    capable: "Delegates suitable subtasks with usable prompts; keeps judgement tasks for themself.",
    strong: "Delegates deliberately with context-rich prompts; sequences AI work to build on verified results.",
    exemplary: "Treats the copilot as a constrained collaborator: scopes, verifies, and re-plans around its strengths and failure modes.",
  },
  verification_of_ai_output: {
    developing: "Accepts AI output unchecked; errors or fabrications survive into deliverables.",
    capable: "Spot-checks AI output against sources or tests; catches obvious errors.",
    strong: "Systematically verifies material claims/code paths before use; documents what was checked.",
    exemplary: "Builds verification into the workflow (tests, source cross-checks, boundary cases); no unverified material claim ships.",
  },
  correction_and_iteration: {
    developing: "Repeats failed approaches; discards work rather than diagnosing.",
    capable: "Diagnoses failures and adjusts; iterations converge.",
    strong: "Uses failures as information; each iteration is justified by observed evidence.",
    exemplary: "Recovers from a significant dead end efficiently and explains the pivot in the handover.",
  },
  tool_orchestration: {
    developing: "Ignores available tools or misuses them; receipts show aimless invocation.",
    capable: "Uses the relevant tools for their intended purpose with sensible parameters.",
    strong: "Combines tools purposefully (query → analyse → act); respects sandbox boundaries without friction.",
    exemplary: "Orchestrates tools into an efficient pipeline; anticipates tool limitations and works around them safely.",
  },
  evidence_grounding: {
    developing: "Claims are unsupported or contradict the supplied data.",
    capable: "Material claims reference supplied data or receipts.",
    strong: "Claims are consistently cited with source, window and attribution context.",
    exemplary: "Distinguishes evidence strength, flags data limitations, and avoids overclaiming under pressure.",
  },
  communication_handover: {
    developing: "Handover is missing, unstructured, or assumes unavailable context.",
    capable: "Handover states what was done, what remains, and where things are.",
    strong: "Handover is decision-ready: rationale, risks, next steps, and open questions are explicit.",
    exemplary: "Handover anticipates the reader's decisions; a colleague could continue without any meeting.",
  },
  risk_and_safety_judgement: {
    developing: "Takes irreversible or unsafe actions without consideration; ignores stated policies.",
    capable: "Respects stated constraints; escalates or defers when unsure.",
    strong: "Identifies unprompted risks (security, privacy, brand, compliance) and mitigates proportionately.",
    exemplary: "Balances delivery pressure against risk explicitly; declines unsafe shortcuts and records why.",
  },
  execution_quality: {
    developing: "Deliverables are incomplete, broken, or inconsistent with the brief.",
    capable: "Deliverables work and satisfy the stated acceptance summary.",
    strong: "Deliverables are robust: edge cases considered, quality checks visible.",
    exemplary: "Deliverables are production-credible; a reviewer finds nothing material to correct.",
  },
  time_and_scope_management: {
    developing: "Runs out of time on core deliverables due to unmanaged scope.",
    capable: "Prioritises required deliverables; cuts scope consciously when needed.",
    strong: "Allocates effort to impact; declares deferred scope with rationale.",
    exemplary: "Delivers the highest-value slice under pressure and leaves a credible plan for the rest.",
  },
};

export function weightSet(weights: Partial<Record<keyof typeof STANDARD_ANCHORS, number>>): AssessmentPack["dimensionWeights"] {
  return Object.entries(STANDARD_ANCHORS).map(([dimensionId, anchors]) => ({
    dimensionId: dimensionId as AssessmentPack["dimensionWeights"][number]["dimensionId"],
    weight: weights[dimensionId as keyof typeof STANDARD_ANCHORS] ?? 0,
    anchors,
  }));
}
