# Risk register

| ID | Risk | Severity | Mitigation | Status | Owner |
|---|---|---|---|---|---|
| R1 | AI hiring use is Annex III high-risk; obligations apply 2027-12-02 | P0 (legal) | S03 classification record; no live decisions until conformity route done | open | DPO/counsel |
| R2 | Companion app is unsigned in dev; signing/notarisation not set up | P1 | S15 gate blocks pilot until signed + pen-tested | open | Desktop lead |
| R3 | Shadow pilot needs real candidates/reviewers — cannot be simulated by CI | P1 | S19 pre-registered gates; synthetic harness only proves plumbing | open | Release owner |
| R4 | Single local Postgres instance for dev; prod topology undecided | P2 | docker-compose parity; managed PG for pilot | open | Platform |
| R5 | RLS bootstrap paths (invitation_lookup) must never widen | P1 | Cross-tenant negative tests in CI; security review each migration | mitigated (tests) | API lead |
| R6 | Model provider unavailability breaks copilot mid-session | P2 | S08 rule: no AI required to view/save/submit; incident + time-credit path | mitigated (design) | AI lead |
| R7 | V1/V2 divergence confuses support and reviewers | P2 | experience_version on invitation; explicit V2 badges in UI | mitigated | Product |
