import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { CandidateV2EntryPage } from "../src/features/candidate-v2/entry/CandidateV2EntryPage.js";

/**
 * S11/S12 acceptance (UI slice): notices before anything else, comprehension
 * gate blocks continue, preflight statuses render, friendly failure states.
 */

const landing = {
  candidateName: "Nadia Test",
  experienceVersion: "v2",
  state: "invited",
  sessionId: null,
  pack: {
    packCode: "SWE-FS-01",
    packVersion: 1,
    title: "Tenant-safe product change",
    targetRole: "Full-stack software engineer",
    expectedDurationMinutes: 110,
    brief: "Brief text",
    stages: [{ id: "plan", title: "Plan", guidance: "g", suggestedMinutes: 20, deliverableSlots: ["plan"] }],
    assets: [{ path: "docs/x.md", title: "X", mimeType: "text/markdown", content: "asset body" }],
    deliverables: [{ slot: "plan", title: "Change plan", kind: "document", required: true, acceptanceSummary: "s" }],
    dimensions: Array.from({ length: 10 }, (_, i) => ({ dimensionId: `dim_${i}` })),
    accessibilityNotes: "All assets are text-based.",
    plugins: [{ pluginId: "repofs", pluginVersion: "1.0.0", mode: "session_sandbox", essential: true }],
  },
  notices: { aiUse: "notice/ai-use@2026-08-03" },
};

function mockFetch(routes: Record<string, unknown | ((init?: RequestInit) => unknown)>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const key = Object.keys(routes).find((k) => String(url).includes(k));
      if (!key) return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "no mock" } }), { status: 404 });
      const value = routes[key];
      const body = typeof value === "function" ? (value as (i?: RequestInit) => unknown)(init) : value;
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/candidate-v2/tok-abc"]}>
      <Routes>
        <Route path="/candidate-v2/:token" element={<CandidateV2EntryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CandidateV2EntryPage (S11/S12)", () => {
  beforeEach(() => mockFetch({ "/v2/candidate/tok-abc": landing }));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the invitation summary and notices first, with the clock explicitly not started", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Tenant-safe product change" });
    expect(screen.getByText(/clock starts only when you explicitly check in/i)).toBeDefined();
    expect(screen.getByText(/No automated hiring decision/i)).toBeDefined();
    expect(screen.getByText(/Accommodations and alternatives/i)).toBeDefined();
  });

  it("comprehension gate: continue without confirming shows an error summary linking each unchecked item", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Tenant-safe product change" });
    await userEvent.click(screen.getByRole("button", { name: /Acknowledge notices and continue/ }));
    const summary = await screen.findByRole("alert");
    expect(summary.textContent).toContain("There is a problem");
    expect(screen.getAllByRole("link").length).toBeGreaterThanOrEqual(4);
  });

  it("acknowledges after all confirmations and calls the disclose endpoint", async () => {
    const discloseSpy = vi.fn(() => ({ sessionId: "s-1", state: "disclosed", manifest: { nonce: "a".repeat(64), timeboxMinutes: 110 } }));
    mockFetch({
      "/disclose": discloseSpy,
      "/v2/candidate/tok-abc": () => landing,
    });
    renderPage();
    await screen.findByRole("heading", { name: "Tenant-safe product change" });
    for (const checkbox of screen.getAllByRole("checkbox")) {
      await userEvent.click(checkbox);
    }
    await userEvent.click(screen.getByRole("button", { name: /Acknowledge notices and continue/ }));
    await waitFor(() => expect(discloseSpy).toHaveBeenCalled());
  });

  it("renders a friendly terminal state for an invalid link", async () => {
    mockFetch({});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { code: "INVITATION_NOT_FOUND", message: "This invitation link is invalid or has expired." } }), { status: 404 }),
      ),
    );
    renderPage();
    await screen.findByText(/We can't open this invitation/);
    expect(screen.getAllByText(/link is invalid or has expired/).length).toBeGreaterThanOrEqual(1);
  });

  it("preflight step surfaces per-check status and blocks continue until ready", async () => {
    mockFetch({
      "/v2/candidate/tok-abc": { ...landing, state: "disclosed", sessionId: "s-1" },
      "/health": {},
    });
    renderPage();
    await screen.findByText("Compatibility check");
    await screen.findByText(/Reachable/);
    const btn = await screen.findByRole("button", { name: /Everything is ready — continue/ });
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByText(/Tutorial available, not scored/)).toBeDefined();
  });
});
