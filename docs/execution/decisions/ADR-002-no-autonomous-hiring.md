# ADR-002 — No autonomous hiring decisions

**Status:** accepted (2026-08-03)

## Decision
No AI component in CPF produces `hire`, `reject`, `pass`, `fail`, `rank`, `fit`
or a universal candidate score. The copilot assists the candidate; the reviewer
assistant maps evidence but cannot select final anchors; employer decision
logic stays outside AI output. Deterministic guards live in code
(`packages/v2-contracts` forbidden-output list + AI gateway output validation),
never only in prompts.

## Consequences
- Review finalisation requires human rationale, confidence and limitations per dimension.
- "Critical concern" escalates to humans; it is never an automatic failure.
- Any aggregation into a single ranking is a contract violation and a release stop condition.
