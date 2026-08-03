# S12 — Preflight, installer handoff, tutorial

```yaml
id: S12
title: Preflight, installer handoff, tutorial
status: see ../project-state.yaml
depends_on: [S11]
owner: platform-lead
acceptance:
  - Clean+failure preflight paths; tutorial unscored and excluded from evidence; clock starts on explicit check-in.
rollback: >
  Flags off / additive artefacts retained; forward-fix only on evidence tables.
```

Full requirements: plan §"Step 12" in
docs/status/CPF_20_Step_Integration_Execution_Plan.md. Evidence links live in
../project-state.yaml.
