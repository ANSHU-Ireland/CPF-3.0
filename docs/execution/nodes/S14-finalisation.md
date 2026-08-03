# S14 — Review-before-submit, atomic finalisation, recovery

```yaml
id: S14
title: Review-before-submit, atomic finalisation, recovery
status: see ../project-state.yaml
depends_on: [S13]
owner: platform-lead
acceptance:
  - Duplicate/concurrent/offline submits → exactly one signed receipt; artifacts immutable after.
rollback: >
  Flags off / additive artefacts retained; forward-fix only on evidence tables.
```

Full requirements: plan §"Step 14" in
docs/status/CPF_20_Step_Integration_Execution_Plan.md. Evidence links live in
../project-state.yaml.
