import { describe, expect, it } from "vitest";
import {
  PACK_CODES,
  candidateView,
  evaluateHiddenCheck,
  loadAllPacks,
  loadHiddenChecks,
  loadPack,
  packContentHash,
} from "../src/index.js";

describe("S07 assessment packs", () => {
  it("all four packs parse, weights total 100, all ten dimensions present", () => {
    const packs = loadAllPacks();
    expect(packs).toHaveLength(4);
    for (const pack of packs) {
      const total = pack.dimensionWeights.reduce((s, w) => s + w.weight, 0);
      expect(total, pack.packCode).toBe(100);
      expect(new Set(pack.dimensionWeights.map((w) => w.dimensionId)).size).toBe(10);
      expect(pack.calibrationCases.length).toBeGreaterThanOrEqual(2);
      expect(pack.expectedDurationMinutes).toBe(110);
    }
  });

  it("content hash is deterministic and version-sensitive", () => {
    const pack = loadPack("SWE-FS-01");
    expect(packContentHash(pack)).toBe(packContentHash(loadPack("SWE-FS-01")));
    expect(packContentHash({ ...pack, packVersion: 2 })).not.toBe(packContentHash(pack));
  });

  it("candidate view structurally excludes weights, anchors, calibration and job analysis", () => {
    for (const code of PACK_CODES) {
      const view = candidateView(loadPack(code));
      const serialised = JSON.stringify(view);
      expect(serialised).not.toContain("dimensionWeights");
      expect(serialised).not.toContain("calibrationCases");
      expect(serialised).not.toContain("expectedAnchors");
      expect(serialised).not.toContain("jobAnalysisNote");
      // Transparency: candidates still see which dimensions are assessed.
      expect(view.dimensions).toHaveLength(10);
    }
  });

  it("hidden checks are a separate export and never appear in any pack serialisation", () => {
    for (const code of PACK_CODES) {
      const packJson = JSON.stringify(loadPack(code));
      const viewJson = JSON.stringify(candidateView(loadPack(code)));
      for (const check of loadHiddenChecks(code)) {
        expect(packJson).not.toContain(check.id);
        expect(viewJson).not.toContain(check.id);
      }
      expect(loadHiddenChecks(code).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("hidden checks evaluate deterministically", () => {
    const [tenancy] = loadHiddenChecks("SWE-FS-01");
    expect(evaluateHiddenCheck(tenancy!, "WHERE organisation_id = $1")).toBe(true);
    expect(evaluateHiddenCheck(tenancy!, "SELECT * FROM invoices")).toBe(false);
    const noGuarantee = loadHiddenChecks("DM-GTM-02").find((c) => c.kind === "not_contains")!;
    expect(evaluateHiddenCheck(noGuarantee, "we guarantee compliance")).toBe(false);
    expect(evaluateHiddenCheck(noGuarantee, "auditor-ready evidence trail")).toBe(true);
  });

  it("marketing packs contain no algorithm puzzles; SWE packs are production-shaped", () => {
    expect(JSON.stringify(loadPack("DM-PERF-01")) + JSON.stringify(loadPack("DM-GTM-02"))).not.toMatch(/leetcode|binary tree|linked list/i);
    expect(loadPack("SWE-FS-01").brief).toMatch(/tenant/i);
    expect(loadPack("SWE-PLAT-02").brief).toMatch(/incident/i);
  });

  it("no pack asset contains credentials or personal data markers", () => {
    for (const pack of loadAllPacks()) {
      for (const asset of pack.assets) {
        expect(asset.content).not.toMatch(/password\s*[:=]|api[_-]?key|BEGIN (RSA|EC) PRIVATE KEY/i);
        expect(asset.content).not.toMatch(/@gmail\.com|@outlook\.com/i);
      }
    }
  });
});
