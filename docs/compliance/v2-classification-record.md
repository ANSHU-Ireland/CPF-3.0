# V2 AI Act Classification Record (S03)

**Status:** adopted for engineering; requires authorised legal confirmation before live use.
**Date:** 2026-08-03. **Owner:** governance/release owner. Not legal advice.

## Classification

- CPF is an **AI system** under the EU AI Act (Regulation (EU) 2024/1689 as amended;
  employment high-risk obligations apply from **2 December 2027** per Regulation (EU) 2026/1744).
- The V2 assessment product is **Annex III high-risk** when AI evaluation of applicant
  responses materially influences recruitment/selection. Human involvement does **not**
  remove the classification where AI materially influences selection.
- Consequence for delivery: **no live candidate decisions** may depend on V2 until the
  conformity route (QMS, technical documentation, logging, human oversight, registration)
  is complete and pre-registered pilot gates (S19) pass.

## Role matrix (working assumption A3 — needs counsel confirmation)

| Party | AI Act role | GDPR role |
|---|---|---|
| CPF (platform) | Provider (builds/markets the system) | Processor for employer assessment data; controller for platform accounts/telemetry |
| Employer tenant | Deployer (uses in recruitment) | Controller for candidate personal data |
| Candidate | Affected person — rights: information, human review route, appeal | Data subject |

## Hard product rules (enforced in code, not prose)

1. No emotion, gaze, voice, personality, honesty or protected-trait inference — nowhere.
2. No biometric face matching in standard mode.
3. No autonomous recommendation, integrity verdict, or hire/reject/pass/fail/rank/fit output.
4. No hidden thresholds or post-hoc weighting; dimension weights are in the signed pack.
5. Camera/process evidence restricted to a distinct integrity role; never in performance review.
6. Equivalent supported route for candidates who cannot/will not install the companion.
7. Candidates can annotate incidents and appeal; appeal reviewers are independent.

## Data Use Register (categories)

Account/identity; assessment delivery (artifacts, drafts); AI interaction (displayed
messages only — no hidden reasoning); plugin receipts; integrity events (typed, minimised);
camera objects (pilot: **not implemented**; DPIA precondition); technical incidents; support;
analytics (aggregated, k≥8 floors reused from intelligence module); review records; appeals;
retention/deletion evidence.

## Marketing prohibitions

Never claim "100% compliant", "bias-free", "fraud-proof", or automated integrity detection.

## Sign-off state

| Gate | State |
|---|---|
| Engineering control design (this record + ADR-002/003/004) | adopted 2026-08-03 |
| DPO review | **pending — external** |
| Employment/equality counsel (Ireland) | **pending — external** |
| Security review of control design | tracked in S18 |

Unresolved A3 assumptions (see docs/execution/assumptions.md) are **not** converted into
code behaviour: camera capture is not implemented, biometric modes do not exist, and the
alternative-route policy is configurable per employer.
