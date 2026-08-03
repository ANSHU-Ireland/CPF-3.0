# S01 — Baseline and execution memory

```yaml
id: S01
title: Baseline and execution memory
status: see ../project-state.yaml
depends_on: []
owner: platform-lead
acceptance:
  - Green V1 contracts/tests; graph+nodes validate; owners named; no production behaviour changed.
rollback: >
  Flags off / additive artefacts retained; forward-fix only on evidence tables.
```

Full requirements: plan §"Step 1" in
docs/status/CPF_20_Step_Integration_Execution_Plan.md. Evidence links live in
../project-state.yaml.
