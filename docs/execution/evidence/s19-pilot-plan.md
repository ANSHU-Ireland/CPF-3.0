# S19 — shadow pilot plan and pre-registered gates

**Status: blocked on real-world execution** (200–500 shadow sessions with real
candidates + ≥2 trained human reviewers per calibration sample). The plumbing
is proven by `scripts/pilot/shadow-pilot-harness.mjs` against the live API.

## Pre-registered gates (set BEFORE analysis; changing them post-hoc voids the pilot)

| Gate | Threshold | Measured from |
|---|---|---|
| Completion rate | ≥90% of started sessions reach a receipt | session_manifests + shutdown_receipts |
| Lost/ambiguous submissions | 0 | receipts vs submitting-stuck sessions |
| Receipt integrity | 100% replay-consistent, signature-verifiable | harness + spot audit |
| Technical incident rate | <10% of sessions; 100% get support resolution | technical_incidents |
| Candidate comprehension | ≥85% correct on AI/monitoring/review/appeal questions | S11 comprehension instrument |
| Inter-rater reliability | ≥0.70 per dimension (investigate below, never hide in aggregate) | review_dimensions_v2 rounds 1+2 |
| Reviewer time | median review ≤45 min without evidence-coverage loss | assignment timestamps |
| Blind-review integrity | 0 blindness breaches | server logs (round-visibility rule) |
| Integrity false-positive/appeal | appeals <5%; zero automated verdicts | appeal_cases + design (no verdict path exists) |
| Accessibility | 0 blocking defects for AT users; alternative route equivalent | assisted UAT sessions |
| Subgroup monitoring | no unexplained disparity beyond pre-agreed bounds (lawful basis per S03) | pilot analysis plan |

## Journeys to cover (all four packs)

invitation→receipt; accommodations/alternative route; AI/plugin failure
mid-session; network loss + crash recovery; time-limit expiry; ambiguous
submit; blind second review; adjudication; appeal; data access/deletion;
pack/model suspension drill.

## Rules

- Synthetic/consented pilot data only; no candidate is disadvantaged.
- No automatic integrity or hiring decision occurs anywhere in the pilot.
- Dimension/task changes during the pilot create a new pack version.
- Outcome: independent review returns READY FOR CONTROLLED PILOT or the
  project returns to the relevant node.
