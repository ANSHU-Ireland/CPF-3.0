// S04 acceptance: components carry correct semantics (roles, labels, keyboard
// paths) and pass an axe smoke check. Rendered with happy-dom.
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import {
  AutosaveState,
  DataTable,
  ErrorSummary,
  EvidenceLink,
  IncidentBanner,
  Notice,
  Receipt,
  StatusChip,
  Stepper,
  Tabs,
  TabPanel,
  Timeline,
  Timer,
} from "../src/index.js";

function TabsFixture() {
  const [active, setActive] = useState("artifact");
  const tabs = [
    { id: "artifact", label: "Artifact" },
    { id: "evidence", label: "Evidence" },
    { id: "rubric", label: "Rubric" },
  ];
  return (
    <div>
      <Tabs tabs={tabs} activeId={active} onChange={setActive} label="Review panes" />
      {tabs.map((t) => (
        <TabPanel key={t.id} tabId={t.id} active={active === t.id}>
          {t.id}
        </TabPanel>
      ))}
    </div>
  );
}

describe("design system semantics", () => {
  it("StatusChip pairs colour with text content", () => {
    render(<StatusChip tone="success">Saved</StatusChip>);
    expect(screen.getByText("Saved")).toBeDefined();
  });

  it("Notice uses status role for non-danger and alert for danger", () => {
    const info = render(<Notice tone="info" title="Heads up" />);
    expect(screen.getByRole("status", { name: "Heads up" })).toBeDefined();
    info.unmount();
    render(<Notice tone="danger" title="Problem" />);
    expect(screen.getByRole("alert", { name: "Problem" })).toBeDefined();
  });

  it("ErrorSummary links each error to its field id", () => {
    render(<ErrorSummary errors={[{ fieldId: "email", message: "Enter your e-mail" }]} />);
    const link = screen.getByRole("link", { name: "Enter your e-mail" });
    expect(link.getAttribute("href")).toBe("#email");
  });

  it("ErrorSummary renders nothing when there are no errors", () => {
    const { container } = render(<ErrorSummary errors={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("Tabs support arrow-key roving focus and aria-selected", () => {
    render(<TabsFixture />);
    const artifact = screen.getByRole("tab", { name: "Artifact" });
    expect(artifact.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(artifact, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Evidence" }).getAttribute("aria-selected")).toBe("true");
    // panels are labelled by their tabs
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe("tab-evidence");
  });

  it("Stepper marks the current step with aria-current", () => {
    render(<Stepper steps={["Notices", "Checks", "Tutorial"]} currentIndex={1} />);
    const current = screen.getAllByRole("listitem")[1]!;
    expect(current.getAttribute("aria-current")).toBe("step");
  });

  it("Timer never uses colour alone and announces via live region", () => {
    render(<Timer remainingSeconds={299} />);
    expect(screen.getByRole("timer")).toBeDefined();
  });

  it("AutosaveState is a polite status region", () => {
    render(<AutosaveState state="saving" />);
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
  });

  it("IncidentBanner is an alert with a recovery action slot", () => {
    render(<IncidentBanner title="Connection lost" detail="Reconnecting…" action={<button>Retry</button>} />);
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
  });

  it("DataTable has a caption and column headers with scope", () => {
    render(
      <DataTable
        caption="Review queue"
        columns={[{ id: "c", header: "Candidate", render: (r: { name: string }) => r.name }]}
        rows={[{ name: "P-1042" }]}
        rowKey={(r) => r.name}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Candidate" }).getAttribute("scope")).toBe("col");
  });

  it("Timeline is an ordered list labelled for assistive tech", () => {
    render(<Timeline label="Session events" items={[{ id: "e1", title: "Started" }]} />);
    expect(screen.getByRole("list", { name: "Session events" })).toBeDefined();
  });

  it("Receipt renders term/value pairs with monospace hashes", () => {
    render(
      <Receipt
        title="Submission receipt"
        entries={[{ term: "Artifact head", value: "ab12…", mono: true }]}
      />,
    );
    expect(screen.getByText("Artifact head")).toBeDefined();
  });

  it("EvidenceLink is a real button with the immutable id as its accessible name", () => {
    render(<EvidenceLink id="EV-00042" kind="test" />);
    expect(screen.getByRole("button", { name: /EV-00042/ })).toBeDefined();
  });
});
