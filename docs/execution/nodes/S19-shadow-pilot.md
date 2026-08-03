# S19 — Shadow-mode UAT and validation

```yaml
id: S19
title: Shadow-mode UAT and validation
status: see ../project-state.yaml
depends_on: [S18]
owner: platform-lead
acceptance:
  - Pre-registered gates pass on 200–500 shadow sessions; IRR ≥ 0.70 per dimension investigated.
rollback: >
  Flags off / additive artefacts retained; forward-fix only on evidence tables.
```

Full requirements: plan §"Step 19" in
docs/status/CPF_20_Step_Integration_Execution_Plan.md. Evidence links live in
../project-state.yaml.
