# V2 DPIA Scope and Control Design (S03)

**Status:** engineering scope adopted 2026-08-03; formal DPIA sign-off is an external
DPO/counsel gate before any live pilot. Not legal advice.

## Processing in scope

| Processing | Lawful-basis note | Minimisation control |
|---|---|---|
| Systematic monitoring during assessment (heartbeats, focus/clipboard/network events) | Documented separately per controller; opening a disclosure is **not** consent | Typed events only; rule ID + state, never content; no process lists; hash-chained for integrity |
| AI interaction storage | Assessment delivery | Displayed messages only; no hidden chain-of-thought; redaction before provider |
| Artifact/version storage | Assessment delivery | Content-addressed; tenant+session scoped; append-only |
| Camera capture | **Not implemented.** Blocked until DPIA sign-off (A4) | N/A — no code path exists |
| Device/process signals via companion | Proportionality gate at S15 | Category rules only (rule id/state); no raw telemetry |
| Accommodation records | Equality duty | Restricted from performance reviewers by role + projection |

## Retention starting points (S06 enforces; subject to DPIA confirmation)

camera object 14 days post-decision · integrity metadata 90 days · artifacts/AI/tool/review
evidence 365 days · operational logs 30–90 days · decision audit 730 days. Legal hold is
explicit, access-restricted, auditable.

## Candidate rights routes

Access/export, correction, deletion (subject to legal hold), technical-incident annotation,
human review of any material decision, independent appeal. All notice versions are stored
with timestamp against invitation/session; employer cannot edit notices after issue.

## Alternative route (A5)

Declining the companion or camera does not withdraw the candidate. The employer configures
one of: browser-only supervised session, live supervised assessment, or equivalent
structured exercise — with equivalent scoring conditions and the same rubric.

## Residual risks / open items for the DPO

1. Necessity/proportionality of process-category checks (S15) — evidence pack required.
2. Cross-border transfer analysis for AI provider (EU-hosted endpoint pinned by config).
3. Employer-specific lawful-basis wording for monitoring notice (template provided).
4. Retention override interaction with legal hold (deletion evidence format agreed).
