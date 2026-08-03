# S08 — Assessment runtime and artifact engine

```yaml
id: S08
title: Assessment runtime and artifact engine
status: see ../project-state.yaml
depends_on: [S06, S07]
owner: platform-lead
acceptance:
  - Illegal transitions rejected; concurrent autosave+submit → one receipt; quotas enforced.
rollback: >
  Flags off / additive artefacts retained; forward-fix only on evidence tables.
```

Full requirements: plan §"Step 8" in
docs/status/CPF_20_Step_Integration_Execution_Plan.md. Evidence links live in
../project-state.yaml.
