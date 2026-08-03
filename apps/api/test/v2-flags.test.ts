import { describe, expect, it } from "vitest";
import { isKilledByEnv, V2_FLAGS } from "../src/modules/v2/flags.js";

describe("S02 V2 flags — environment kill switches", () => {
  it("defaults every flag to not-killed with a clean environment", () => {
    for (const flag of V2_FLAGS) {
      expect(isKilledByEnv(flag, {})).toBe(false);
    }
  });

  it("V2_KILL_ALL downs every V2 surface independently of DB state", () => {
    for (const flag of V2_FLAGS) {
      expect(isKilledByEnv(flag, { V2_KILL_ALL: "true" })).toBe(true);
    }
  });

  it("per-flag kill switches are independent", () => {
    const env = { V2_KILL_CANDIDATE_V2: "true" };
    expect(isKilledByEnv("candidate_v2", env)).toBe(true);
    expect(isKilledByEnv("reviewer_v2", env)).toBe(false);
    expect(isKilledByEnv("assessment_runtime_v2", env)).toBe(false);
    expect(isKilledByEnv("proctor_companion", env)).toBe(false);
  });

  it("only the literal string 'true' kills — no truthy coercion surprises", () => {
    expect(isKilledByEnv("candidate_v2", { V2_KILL_CANDIDATE_V2: "1" })).toBe(false);
    expect(isKilledByEnv("candidate_v2", { V2_KILL_CANDIDATE_V2: "TRUE" })).toBe(false);
    expect(isKilledByEnv("candidate_v2", { V2_KILL_ALL: "false" })).toBe(false);
  });
});
