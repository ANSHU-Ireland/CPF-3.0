import type { AssessmentPack, HiddenCheck } from "./schema.js";
import { weightSet } from "./anchors.js";

/** DM-PERF-01 — performance marketing recovery (mid level). */
export const DM_PERF_01: AssessmentPack = {
  packCode: "DM-PERF-01",
  packVersion: 1,
  title: "Performance marketing recovery",
  targetRole: "Performance marketing manager",
  targetLevel: "mid",
  roleFamily: "digital-marketing",
  expectedDurationMinutes: 110,
  brief:
    "You manage paid acquisition for an online kitchenware retailer (AOV €68, blended target " +
    "ROAS 3.2). Over the last three weeks ROAS fell from 3.4 to 2.1 while spend held at " +
    "€2,400/day. You have read-only GA4, Ads and CRM snapshots for the period, plus a landing " +
    "page report. Diagnose what actually changed, reallocate the existing budget (no increase), " +
    "and draft the two highest-impact fixes as ready-to-review drafts (no live changes are " +
    "possible). Every material claim must cite its data source and window; the ClaimsChecker " +
    "will flag unsupported product claims in ad copy. Finish with a one-page recovery memo for " +
    "the head of growth: what happened, what you changed, expected impact with assumptions, and " +
    "what you need next week.",
  jobAnalysisNote:
    "Core weekly loop of a mid-level performance marketer: diagnose mix/creative/landing issues " +
    "from analytics, reallocate under a fixed budget, and communicate trade-offs. Emphasis on " +
    "evidence grounding and consent/claims discipline over channel trivia.",
  stages: [
    { id: "diagnose", title: "Diagnose the drop", guidance: "Use GA4Lab/AdsLab/CRMLab snapshots. Separate mix shift vs creative fatigue vs landing regression vs tracking artefact.", suggestedMinutes: 35, deliverableSlots: ["diagnosis"] },
    { id: "reallocate", title: "Reallocate the budget", guidance: "Rebuild the €2,400/day allocation in the BudgetWorksheet with expected ROAS by line and the assumption behind each.", suggestedMinutes: 25, deliverableSlots: ["budget"] },
    { id: "fix", title: "Draft the two fixes", guidance: "Draft (preview-only) the two highest-impact changes: e.g. creative refresh, negative keywords, landing variant, audience exclusion. Run ClaimsChecker on any copy.", suggestedMinutes: 30, deliverableSlots: ["fix_drafts"] },
    { id: "memo", title: "Recovery memo", guidance: "One page to the head of growth: cause, actions, expected impact + assumptions, asks.", suggestedMinutes: 20, deliverableSlots: ["memo"] },
  ],
  assets: [
    {
      path: "data/ga4-weekly.md",
      title: "GA4 weekly summary (3 weeks)",
      mimeType: "text/markdown",
      content:
        "| week | sessions | cvr | aov | revenue |\n|---|---|---|---|---|\n| W-3 | 41,200 | 2.9% | €69 | €82,400 |\n| W-2 | 44,900 | 2.2% | €67 | €66,200 |\n| W-1 | 47,300 | 1.8% | €66 | €56,200 |\nNotes: sessions up, conversion down; mobile share rose 58%→71%; landing /sale-page LCP degraded from 2.1s to 5.4s on mobile after W-3 banner change.",
    },
    {
      path: "data/ads-breakdown.md",
      title: "Ads breakdown by campaign",
      mimeType: "text/markdown",
      content:
        "| campaign | spend/day | roas W-3 | roas W-1 | note |\n|---|---|---|---|---|\n| Brand search | €300 | 8.1 | 7.8 | stable |\n| Generic search 'knife set' | €700 | 3.1 | 2.4 | cpc +22% |\n| Shopping | €900 | 3.0 | 1.6 | new competitor undercutting hero SKU |\n| Paid social prospecting | €500 | 2.2 | 1.1 | creative unchanged 9 weeks, frequency 6.2 |",
    },
    {
      path: "data/crm-cohorts.md",
      title: "CRM cohort notes (aggregated)",
      mimeType: "text/markdown",
      content: "Repeat-purchase rate stable (11.8%→11.5%). New-customer margin on hero SKU down 9pts after W-2 price match. No consent-base changes; suppression lists unchanged.",
    },
    {
      path: "policy/claims-allowlist.md",
      title: "Approved product claims",
      mimeType: "text/markdown",
      content: "Allowed: 'dishwasher safe', 'German steel', '25-year guarantee'. Restricted (needs proof doc): 'sharpest on the market', any '%-off vs RRP' beyond current price file. Prohibited: health claims.",
    },
  ],
  deliverables: [
    { slot: "diagnosis", title: "Diagnosis", kind: "document", required: true, acceptanceSummary: "Attributes the ROAS drop across causes with cited data + windows; rules out at least one red herring." },
    { slot: "budget", title: "Reallocation worksheet", kind: "table", required: true, acceptanceSummary: "€2,400/day fully allocated; per-line expected ROAS + assumption; no fabricated inputs." },
    { slot: "fix_drafts", title: "Two fix drafts", kind: "creative", required: true, acceptanceSummary: "Preview-only drafts; claims pass the allowlist; each names its success metric." },
    { slot: "memo", title: "Recovery memo", kind: "document", required: true, acceptanceSummary: "Decision-ready one-pager with assumptions and asks." },
  ],
  dimensionWeights: weightSet({
    problem_framing: 12,
    delegation_to_ai: 8,
    verification_of_ai_output: 10,
    correction_and_iteration: 6,
    tool_orchestration: 10,
    evidence_grounding: 16,
    communication_handover: 14,
    risk_and_safety_judgement: 10,
    execution_quality: 8,
    time_and_scope_management: 6,
  }),
  calibrationCases: [
    {
      id: "cal-perf01-a",
      summary: "Candidate cut paid social to zero and pushed all budget to brand search (ROAS looks great), memo claims 'ROAS restored to 3.5'; ignored that brand search cannot absorb 4× budget; no incrementality caveat.",
      expectedAnchors: {
        problem_framing: "developing",
        delegation_to_ai: "capable",
        verification_of_ai_output: "capable",
        correction_and_iteration: "capable",
        tool_orchestration: "capable",
        evidence_grounding: "developing",
        communication_handover: "capable",
        risk_and_safety_judgement: "developing",
        execution_quality: "capable",
        time_and_scope_management: "strong",
      },
      rationale: "Maximising blended ROAS via brand cannibalisation without saturation/incrementality caveats is the classic trap this pack tests.",
    },
    {
      id: "cal-perf01-b",
      summary: "Candidate isolated the mobile landing regression as the largest factor (cited GA4 LCP + mobile share), refreshed social creative, tiered shopping bids off the undercut SKU, kept a small prospecting floor with rationale; memo separated facts from assumptions.",
      expectedAnchors: {
        problem_framing: "strong",
        delegation_to_ai: "strong",
        verification_of_ai_output: "strong",
        correction_and_iteration: "capable",
        tool_orchestration: "strong",
        evidence_grounding: "exemplary",
        communication_handover: "strong",
        risk_and_safety_judgement: "strong",
        execution_quality: "strong",
        time_and_scope_management: "capable",
      },
      rationale: "Correct multi-cause attribution with cited windows and honest assumptions is the exemplar profile.",
    },
  ],
  plugins: [
    { pluginId: "ga4lab", pluginVersion: "1.0.0", mode: "read_only", essential: true, maxInvocations: 300 },
    { pluginId: "adslab", pluginVersion: "1.0.0", mode: "draft_preview", essential: true, maxInvocations: 300 },
    { pluginId: "crmlab", pluginVersion: "1.0.0", mode: "read_only", essential: false, maxInvocations: 150 },
    { pluginId: "pagelab", pluginVersion: "1.0.0", mode: "read_only", essential: false, maxInvocations: 100 },
    { pluginId: "claimschecker", pluginVersion: "1.0.0", mode: "simulated", essential: true, maxInvocations: 100 },
    { pluginId: "budgetworksheet", pluginVersion: "1.0.0", mode: "session_sandbox", essential: true, maxInvocations: 500 },
  ],
  copilotPromptRef: "copilot/dm-base@2026-08-03.1",
  rubricVersion: "rubric/dm-perf-01@1",
  accessibilityNotes: "All data provided as accessible tables; worksheet supports keyboard-only formula entry; no chart-only information.",
  changeLog: "1: initial publication for controlled pilot.",
};

export const DM_PERF_01_HIDDEN: HiddenCheck[] = [
  { id: "h-perf01-landing", description: "Diagnosis names the mobile landing/LCP regression", kind: "regex", target: "diagnosis", pattern: "LCP|landing|5\\.4" },
  { id: "h-perf01-window", description: "Diagnosis cites data windows", kind: "regex", target: "diagnosis", pattern: "W-1|W-2|W-3|week" },
  { id: "h-perf01-budget-total", description: "Budget lines total €2,400", kind: "contains", target: "budget", pattern: "2,400" },
  { id: "h-perf01-claims", description: "Fix drafts avoid prohibited claims", kind: "not_contains", target: "fix_drafts", pattern: "sharpest on the market" },
];

/** DM-GTM-02 — B2B SaaS go-to-market launch (senior). */
export const DM_GTM_02: AssessmentPack = {
  packCode: "DM-GTM-02",
  packVersion: 1,
  title: "B2B SaaS feature launch",
  targetRole: "B2B growth / GTM marketer",
  targetLevel: "senior",
  roleFamily: "digital-marketing",
  expectedDurationMinutes: 110,
  brief:
    "Your company sells compliance software to EU mid-market fintechs (ACV €18k, sales-assisted). " +
    "In four weeks you launch 'Continuous Evidence' — automated audit-evidence collection. You " +
    "have the positioning doc, ICP notes, historical campaign benchmarks, current pipeline " +
    "snapshot and the e-mail suppression policy. Produce: (1) the launch plan with channel " +
    "sequencing and owner map, (2) the landing page draft (preview only) with claims that pass " +
    "the compliance allowlist, (3) the launch e-mail draft for the correct consented segment with " +
    "suppression rules applied, and (4) the measurement plan: KPI tree, guardrail metrics, and " +
    "the week-2 decision rule for scaling or cutting spend. The copilot can draft; you own " +
    "segmentation, sequencing, claims and the decision rule.",
  jobAnalysisNote:
    "Senior GTM work sample: cross-channel launch orchestration under consent and claims " +
    "constraints, with explicit decision rules. Tests stakeholder-ready communication.",
  stages: [
    { id: "plan", title: "Launch plan", guidance: "Sequence channels against the ICP and benchmarks; name owners and dependencies; realistic volumes.", suggestedMinutes: 30, deliverableSlots: ["launch_plan"] },
    { id: "landing", title: "Landing page draft", guidance: "Draft in CMSPreview; run ClaimsChecker; state the conversion action and its qualifier.", suggestedMinutes: 25, deliverableSlots: ["landing_draft"] },
    { id: "email", title: "Launch e-mail", guidance: "Segment in EmailPreview honouring suppression policy; draft only — sending is impossible here.", suggestedMinutes: 25, deliverableSlots: ["email_draft"] },
    { id: "measure", title: "Measurement plan", guidance: "KPI tree to pipeline, guardrails (unsub rate, SQL quality), and the week-2 scale/cut rule with thresholds.", suggestedMinutes: 30, deliverableSlots: ["measurement"] },
  ],
  assets: [
    {
      path: "gtm/positioning.md",
      title: "Positioning doc (excerpt)",
      mimeType: "text/markdown",
      content: "For compliance leads at EU fintechs who lose ~6 days/quarter to audit evidence collection, Continuous Evidence collects and timestamps control evidence automatically. Unlike manual screenshots, it produces an auditor-ready trail. Proof points: 14 design partners, mean 71% evidence-time reduction (n=9, internal study), SOC2+DORA mappings.",
    },
    {
      path: "gtm/benchmarks.md",
      title: "Historical benchmarks",
      mimeType: "text/markdown",
      content: "| channel | metric | value |\n|---|---|---|\n| Launch e-mail (consented base 8,400) | open / click / SQL | 41% / 6.2% / 0.9% |\n| LinkedIn ads | CPL / SQL rate | €96 / 11% |\n| Webinar | reg→attend→SQL | 100→38→7 |\n| G2 listing refresh | monthly SQL | 3–5 |",
    },
    {
      path: "gtm/suppression-policy.md",
      title: "E-mail suppression policy",
      mimeType: "text/markdown",
      content: "Suppress: open opportunities in stage ≥3 (sales owns), churned <6 months, unsubscribed (permanent), bounced 2×, contacts in DE without double opt-in. Segment source of truth: CRMLab aggregate export only.",
    },
  ],
  deliverables: [
    { slot: "launch_plan", title: "Launch plan", kind: "document", required: true, acceptanceSummary: "Sequenced channels with owners, volumes grounded in benchmarks, dependencies named." },
    { slot: "landing_draft", title: "Landing page draft", kind: "creative", required: true, acceptanceSummary: "Preview-only; claims pass allowlist; qualified proof points (n, source)." },
    { slot: "email_draft", title: "Launch e-mail draft", kind: "creative", required: true, acceptanceSummary: "Correct consented segment, suppression rules applied and stated; draft-only." },
    { slot: "measurement", title: "Measurement plan", kind: "document", required: true, acceptanceSummary: "KPI tree to pipeline, guardrails, explicit week-2 decision rule with thresholds." },
  ],
  dimensionWeights: weightSet({
    problem_framing: 12,
    delegation_to_ai: 10,
    verification_of_ai_output: 10,
    correction_and_iteration: 6,
    tool_orchestration: 8,
    evidence_grounding: 12,
    communication_handover: 14,
    risk_and_safety_judgement: 14,
    execution_quality: 8,
    time_and_scope_management: 6,
  }),
  calibrationCases: [
    {
      id: "cal-gtm02-a",
      summary: "Beautiful landing copy but claims '71% time reduction' unqualified and 'guaranteed audit pass'; e-mail segment ignored the DE double-opt-in rule; measurement plan lists vanity metrics without a decision rule.",
      expectedAnchors: {
        problem_framing: "capable",
        delegation_to_ai: "capable",
        verification_of_ai_output: "developing",
        correction_and_iteration: "capable",
        tool_orchestration: "capable",
        evidence_grounding: "developing",
        communication_handover: "capable",
        risk_and_safety_judgement: "developing",
        execution_quality: "strong",
        time_and_scope_management: "strong",
      },
      rationale: "Polish cannot compensate for consent breach + unqualified claims — risk judgement and grounding dominate this pack.",
    },
    {
      id: "cal-gtm02-b",
      summary: "Sequenced e-mail→LinkedIn→webinar off benchmark maths, qualified every proof point, applied all suppression rules explicitly, and defined 'scale if CPL<€120 AND SQL rate ≥9% by day 14, else cut social and double webinar'.",
      expectedAnchors: {
        problem_framing: "strong",
        delegation_to_ai: "strong",
        verification_of_ai_output: "strong",
        correction_and_iteration: "capable",
        tool_orchestration: "strong",
        evidence_grounding: "strong",
        communication_handover: "exemplary",
        risk_and_safety_judgement: "strong",
        execution_quality: "strong",
        time_and_scope_management: "capable",
      },
      rationale: "Decision-ready plan with explicit thresholds is the communication exemplar for senior GTM.",
    },
  ],
  plugins: [
    { pluginId: "crmlab", pluginVersion: "1.0.0", mode: "read_only", essential: true, maxInvocations: 200 },
    { pluginId: "cmspreview", pluginVersion: "1.0.0", mode: "draft_preview", essential: true, maxInvocations: 200 },
    { pluginId: "emailpreview", pluginVersion: "1.0.0", mode: "draft_preview", essential: true, maxInvocations: 200 },
    { pluginId: "claimschecker", pluginVersion: "1.0.0", mode: "simulated", essential: true, maxInvocations: 100 },
    { pluginId: "searchlab", pluginVersion: "1.0.0", mode: "read_only", essential: false, maxInvocations: 150 },
    { pluginId: "budgetworksheet", pluginVersion: "1.0.0", mode: "session_sandbox", essential: false, maxInvocations: 300 },
  ],
  copilotPromptRef: "copilot/dm-base@2026-08-03.1",
  rubricVersion: "rubric/dm-gtm-02@1",
  accessibilityNotes: "Preview tools expose text alternatives for rendered drafts; all benchmarks are provided as tables; no timed carousel content.",
  changeLog: "1: initial publication for controlled pilot.",
};

export const DM_GTM_02_HIDDEN: HiddenCheck[] = [
  { id: "h-gtm02-qualify", description: "Landing draft qualifies the 71% proof point", kind: "regex", target: "landing_draft", pattern: "n=9|internal study|design partners" },
  { id: "h-gtm02-noguarantee", description: "No guarantee claims", kind: "not_contains", target: "landing_draft", pattern: "guarantee" },
  { id: "h-gtm02-suppression", description: "E-mail draft references suppression segments", kind: "regex", target: "email_draft", pattern: "suppress|double opt-in|unsubscribed|stage" },
  { id: "h-gtm02-rule", description: "Measurement plan has a thresholded decision rule", kind: "regex", target: "measurement", pattern: "if .*(CPL|SQL|€|%)|threshold" },
];
