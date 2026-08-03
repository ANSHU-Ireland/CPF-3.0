# S02 — Feature flags and V2 route seams

```yaml
id: S02
title: Feature flags and V2 route seams
status: see ../project-state.yaml
depends_on: [S01]
owner: platform-lead
acceptance:
  - V1 unchanged flags-off; test tenant reaches V2 shells; kill switches work without deploy.
rollback: >
  Flags off / additive artefacts retained; forward-fix only on evidence tables.
```

Full requirements: plan §"Step 2" in
docs/status/CPF_20_Step_Integration_Execution_Plan.md. Evidence links live in
../project-state.yaml.
