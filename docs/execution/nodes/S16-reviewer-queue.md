# S16 — Reviewer V2 queue, assignment, calibration

```yaml
id: S16
title: Reviewer V2 queue, assignment, calibration
status: see ../project-state.yaml
depends_on: [S04, S14]
owner: platform-lead
acceptance:
  - Qualification+calibration gating; blind second review; SLA-ordered, never performance-ordered.
rollback: >
  Flags off / additive artefacts retained; forward-fix only on evidence tables.
```

Full requirements: plan §"Step 16" in
docs/status/CPF_20_Step_Integration_Execution_Plan.md. Evidence links live in
../project-state.yaml.
