# S16 evidence — reviewer V2 queue (2026-08-03)

- API [apps/api/src/modules/v2/review.ts] + migration 0030 (assignments,
  second-review policy default TRUE for pilot).
- Queue: pseudonymous (`P-XXXXXX`), SLA-ordered (72h SLO), statuses
  awaiting_review/in_review/second_review/adjudication/finalising — never a
  candidate-performance or integrity ordering; no name/image/camera state
  (test asserts absence).
- Gating: reviewer role + current calibration record (REVIEWER_NOT_CALIBRATED
  422); blind second review — same reviewer cannot take both rounds
  (BLIND_REVIEW_CONFLICT); assignment races resolve deterministically via
  UNIQUE(session, round) → 409 ALREADY_ASSIGNED; manual assignment carries a
  reason code and is audited.
- UI [apps/web/src/features/reviewer-v2/queue/ReviewerV2QueuePage.tsx]:
  high-density DataTable, SLA chips, assigned-to-me filter, V1 escape hatch.

# S17 evidence — evidence review, adjudication, appeal (same date)

- Bundle endpoint is artifact-first: final artifacts + handover open first;
  version history, displayed-AI transcript (volume ≠ quality), tool receipts,
  technical incidents, hidden-check signals (context, not verdicts); rubric
  anchors WITHOUT weights; **no integrity data in the bundle** (test asserts).
- Blindness enforced server-side: an incomplete round-2 reviewer receives no
  round-1 rows.
- Dimension review: human-selected anchor + rationale (≥20 chars) +
  confidence + limitations + citations + probe; `violatesForbiddenOutput`
  rejects hiring-judgement language (422 FORBIDDEN_LANGUAGE).
- Finalisation: all 10 dimensions required (422 DIMENSIONS_INCOMPLETE);
  round 1 → awaiting_second_review; round 2 disagreement ≥2 anchor steps →
  automatic `material_disagreement` adjudication; adjudication close (admin,
  audited) finalises the session.
- Appeals: independent reviewer enforced (APPEAL_REVIEWER_NOT_INDEPENDENT).
- Integrity endpoint separate + role-gated (org_admin as pilot integrity
  stand-in, documented deviation) + access audited; response carries no
  automated verdict.
- UI [apps/web/src/features/reviewer-v2/workspace/ReviewerV2WorkspacePage.tsx]:
  four panes as accessible tabs; anchor radio groups with anchor guide text;
  rationale/confidence/probe per dimension; finalise with outcome banners.
- Tests `apps/api/test/v2-review.test.ts`: 9/9 PASS.
