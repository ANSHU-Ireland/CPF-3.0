import { describe, expect, it } from "vitest";
import { summariseRuntimeEvents } from "../src/modules/candidate/runtime-v2.js";

describe("summariseRuntimeEvents", () => {
  it("computes precise behaviour counters for reviewer analysis", () => {
    const summary = summariseRuntimeEvents([
      { sequence_no: "12", event_type: "network_disconnected", category: "network", severity: "high" },
      { sequence_no: "11", event_type: "tool_execute_failed", category: "tool", severity: "critical" },
      { sequence_no: "10", event_type: "external_clipboard_blocked", category: "clipboard", severity: "info" },
      { sequence_no: "9", event_type: "focus_lost", category: "focus", severity: "warning" },
    ]);

    expect(summary.totalEvents).toBe(4);
    expect(summary.focusLossCount).toBe(1);
    expect(summary.clipboardBlockedCount).toBe(1);
    expect(summary.networkDropCount).toBe(1);
    expect(summary.toolFailureCount).toBe(1);
    expect(summary.highOrCriticalCount).toBe(2);
    expect(summary.latestSequenceNo).toBe(12);
    expect(summary.oldestSequenceNo).toBe(9);
  });

  it("returns zero-safe values on empty events", () => {
    const summary = summariseRuntimeEvents([]);
    expect(summary.totalEvents).toBe(0);
    expect(summary.focusLossCount).toBe(0);
    expect(summary.clipboardBlockedCount).toBe(0);
    expect(summary.networkDropCount).toBe(0);
    expect(summary.toolFailureCount).toBe(0);
    expect(summary.highOrCriticalCount).toBe(0);
    expect(summary.latestSequenceNo).toBe(0);
    expect(summary.oldestSequenceNo).toBe(0);
  });
});
