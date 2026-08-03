// One-shot scaffold: writes docs/execution/nodes/S01..S20 node files from the
// execution graph. Idempotent — skips files that already exist.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const nodesDir = join(root, "docs", "execution", "nodes");
mkdirSync(nodesDir, { recursive: true });

const nodes = [
  ["S01", "baseline", "Baseline and execution memory", [], "Green V1 contracts/tests; graph+nodes validate; owners named; no production behaviour changed."],
  ["S02", "feature-flags", "Feature flags and V2 route seams", ["S01"], "V1 unchanged flags-off; test tenant reaches V2 shells; kill switches work without deploy."],
  ["S03", "governance", "Governance, classification, DPIA scope", ["S02"], "Classification record + DPIA scope + hard product rules approved or blocker recorded."],
  ["S04", "design-system", "Design system", ["S03"], "Tokens + accessible primitives; all interactive states; keyboard/contrast/zoom smoke tests."],
  ["S05", "contracts", "V2 domain, API, event and manifest contracts", ["S03"], "Zod contracts versioned; unknown fields rejected at boundaries; replay/idempotency tests."],
  ["S06", "storage", "V2 storage, RLS, retention", ["S05"], "Additive tables; forced RLS; cross-tenant negative tests fail closed; retention jobs delete with evidence."],
  ["S07", "assessment-packs", "Four signed assessment packs", ["S05"], "Immutable versions + content hash; weights total 100; hidden tests never in candidate/model context."],
  ["S08", "runtime", "Assessment runtime and artifact engine", ["S06", "S07"], "Illegal transitions rejected; concurrent autosave+submit → one receipt; quotas enforced."],
  ["S09", "copilot", "Controlled assessment copilot", ["S08"], "Server-built prompts; displayed-messages-only storage; forbidden-output guards; budgets; kill switch."],
  ["S10", "plugin-broker", "Sandbox plugin broker and catalogue", ["S08"], "Capability tokens; egress deny; receipts immutable; abuse contract tests fail closed."],
  ["S11", "candidate-entry", "Candidate entry, notices, accommodations", ["S04", "S06"], "Notice versions recorded; declining invasive mode offers alternative; accommodations confidential."],
  ["S12", "preflight", "Preflight, installer handoff, tutorial", ["S11"], "Clean+failure preflight paths; tutorial unscored and excluded from evidence; clock starts on explicit check-in."],
  ["S13", "workspaces", "Live candidate role workspaces", ["S09", "S10", "S12"], "Four packs end-to-end; AI/plugin outage leaves work functional; no publish/send/spend path."],
  ["S14", "finalisation", "Review-before-submit, atomic finalisation, recovery", ["S13"], "Duplicate/concurrent/offline submits → exactly one signed receipt; artifacts immutable after."],
  ["S15", "companion", "Signed proctor companion", ["S12", "S14"], "Signed installers; narrow bridge; self-termination sequence; pen test; DPIA-approved telemetry."],
  ["S16", "reviewer-queue", "Reviewer V2 queue, assignment, calibration", ["S04", "S14"], "Qualification+calibration gating; blind second review; SLA-ordered, never performance-ordered."],
  ["S17", "evidence-review", "Evidence review, adjudication, appeal", ["S16"], "Anchored ratings + rationale + confidence + limitations required; integrity separated; appeals independent."],
  ["S18", "hardening", "Cross-system hardening", ["S15", "S17"], "No open P0/P1; ASVS/AISVS/WCAG-mapped checks; drills pass; runbooks rehearsed."],
  ["S19", "shadow-pilot", "Shadow-mode UAT and validation", ["S18"], "Pre-registered gates pass on 200–500 shadow sessions; IRR ≥ 0.70 per dimension investigated."],
  ["S20", "controlled-rollout", "Controlled rollout and monitoring", ["S19"], "Staged rollout with stop conditions; signed release record; V1 retirement separate."],
];

for (const [id, slug, title, deps, acceptance] of nodes) {
  const file = join(nodesDir, `${id}-${slug}.md`);
  if (existsSync(file)) continue;
  writeFileSync(
    file,
    `# ${id} — ${title}

\`\`\`yaml
id: ${id}
title: ${title}
status: see ../project-state.yaml
depends_on: [${deps.join(", ")}]
owner: platform-lead
acceptance:
  - ${acceptance}
rollback: >
  Flags off / additive artefacts retained; forward-fix only on evidence tables.
\`\`\`

Full requirements: plan §"Step ${Number(id.slice(1))}" in
docs/status/CPF_20_Step_Integration_Execution_Plan.md. Evidence links live in
../project-state.yaml.
`,
  );
}
console.log("nodes_scaffolded");
