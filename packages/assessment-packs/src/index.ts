import { createHash } from "node:crypto";
import { AssessmentPack, HiddenCheck, DIMENSION_IDS, type DimensionId } from "./schema.js";
import { SWE_FS_01, SWE_FS_01_HIDDEN, SWE_PLAT_02, SWE_PLAT_02_HIDDEN } from "./packs-swe.js";
import { DM_PERF_01, DM_PERF_01_HIDDEN, DM_GTM_02, DM_GTM_02_HIDDEN } from "./packs-dm.js";

export { AssessmentPack, HiddenCheck, DIMENSION_IDS };
export type { DimensionId };
export { STANDARD_ANCHORS } from "./anchors.js";

export const PACK_CODES = ["SWE-FS-01", "SWE-PLAT-02", "DM-PERF-01", "DM-GTM-02"] as const;
export type PackCode = (typeof PACK_CODES)[number];

const packs: Record<PackCode, AssessmentPack> = {
  "SWE-FS-01": AssessmentPack.parse(SWE_FS_01),
  "SWE-PLAT-02": AssessmentPack.parse(SWE_PLAT_02),
  "DM-PERF-01": AssessmentPack.parse(DM_PERF_01),
  "DM-GTM-02": AssessmentPack.parse(DM_GTM_02),
};

/**
 * Hidden checks are deliberately NOT part of the AssessmentPack object so no
 * serialisation of a pack can ever leak them into candidate or model context.
 */
const hiddenChecks: Record<PackCode, HiddenCheck[]> = {
  "SWE-FS-01": SWE_FS_01_HIDDEN.map((c) => HiddenCheck.parse(c)),
  "SWE-PLAT-02": SWE_PLAT_02_HIDDEN.map((c) => HiddenCheck.parse(c)),
  "DM-PERF-01": DM_PERF_01_HIDDEN.map((c) => HiddenCheck.parse(c)),
  "DM-GTM-02": DM_GTM_02_HIDDEN.map((c) => HiddenCheck.parse(c)),
};

export function loadPack(code: PackCode): AssessmentPack {
  return packs[code];
}

export function loadAllPacks(): AssessmentPack[] {
  return PACK_CODES.map((code) => packs[code]);
}

/** Server-side only. Never expose through candidate/model-facing routes. */
export function loadHiddenChecks(code: PackCode): HiddenCheck[] {
  return hiddenChecks[code];
}

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonicalise(v)]),
    );
  }
  return value;
}

/** Deterministic content hash over the candidate-safe pack definition. */
export function packContentHash(pack: AssessmentPack): string {
  return createHash("sha256").update(JSON.stringify(canonicalise(pack)), "utf8").digest("hex");
}

/** Candidate-facing projection (assets included; hidden checks structurally absent). */
export function candidateView(pack: AssessmentPack): Omit<AssessmentPack, "calibrationCases" | "dimensionWeights" | "jobAnalysisNote"> & {
  dimensions: Array<{ dimensionId: DimensionId }>;
} {
  const { calibrationCases: _c, dimensionWeights, jobAnalysisNote: _j, ...safe } = pack;
  // Candidates see WHICH dimensions are assessed (transparency) but never
  // weights or reviewer anchors (no gaming, no hidden thresholds either —
  // weights are in the signed pack the employer approved).
  return { ...safe, dimensions: dimensionWeights.map((w) => ({ dimensionId: w.dimensionId })) };
}

/** Deterministic hidden-check evaluation (server-side, S08 finalisation). */
export function evaluateHiddenCheck(check: HiddenCheck, deliverableText: string): boolean {
  switch (check.kind) {
    case "contains":
      return deliverableText.includes(check.pattern);
    case "not_contains":
      return !deliverableText.includes(check.pattern);
    case "regex":
      return new RegExp(check.pattern, "i").test(deliverableText);
    case "table_column_present":
      return deliverableText.split("\n").some((line) => line.includes("|") && line.toLowerCase().includes(check.pattern.toLowerCase()));
  }
}
