import { describe, expect, it } from "vitest";
import {
  BridgeCommand,
  BridgeEvent,
  SHUTDOWN_SEQUENCE,
  ShutdownOrderError,
  chainHead,
  nextShutdownStep,
  verifyChain,
} from "../src/index.js";

describe("S15 proctor protocol", () => {
  it("bridge accepts only the closed message set (no shell/fs/biometric messages exist)", () => {
    expect(() => BridgeCommand.parse({ type: "run_shell", cmd: "dir" })).toThrow();
    expect(() => BridgeCommand.parse({ type: "read_file", path: "C:/secrets" })).toThrow();
    expect(() => BridgeEvent.parse({ type: "face_match", score: 0.9 })).toThrow();
    expect(() => BridgeEvent.parse({ type: "process_list", processes: [] })).toThrow();
    expect(() =>
      BridgeEvent.parse({ type: "watcher_state", ruleId: "screen_share_active", state: "violation" }),
    ).not.toThrow();
  });

  it("watcher_state carries rule id + state only — extra fields are rejected", () => {
    expect(() =>
      BridgeEvent.parse({ type: "watcher_state", ruleId: "x", state: "ok", processName: "zoom.exe" }),
    ).toThrow();
  });

  it("shutdown steps must run in exact order; receipt verification precedes destruction", () => {
    const done: (typeof SHUTDOWN_SEQUENCE)[number][] = [];
    for (const step of SHUTDOWN_SEQUENCE) {
      expect(nextShutdownStep(done, step)).toBe(step);
      done.push(step);
    }
    expect(() => nextShutdownStep([], "clear_ephemeral")).toThrow(ShutdownOrderError);
    expect(() => nextShutdownStep(["freeze_mutations"], "revoke_tokens")).toThrow(ShutdownOrderError);
    expect(SHUTDOWN_SEQUENCE.indexOf("verify_receipt")).toBeLessThan(SHUTDOWN_SEQUENCE.indexOf("revoke_tokens"));
    expect(SHUTDOWN_SEQUENCE.indexOf("verify_receipt")).toBeLessThan(SHUTDOWN_SEQUENCE.indexOf("clear_ephemeral"));
  });

  it("hash chain detects gaps and tampering", () => {
    const events = [
      { sequenceNo: 1, occurredAtIso: "2026-08-03T10:00:00Z" },
      { sequenceNo: 2, occurredAtIso: "2026-08-03T10:00:20Z" },
      { sequenceNo: 3, occurredAtIso: "2026-08-03T10:00:40Z" },
    ];
    let head: string | null = null;
    for (const e of events) head = chainHead(head, e.sequenceNo, e.occurredAtIso);
    expect(verifyChain(events, head!)).toBe(true);
    expect(verifyChain(events.slice(0, 2), head!)).toBe(false); // gap
    expect(verifyChain(events.map((e) => (e.sequenceNo === 2 ? { ...e, occurredAtIso: "2026-08-03T10:00:21Z" } : e)), head!)).toBe(false); // tamper
  });
});
