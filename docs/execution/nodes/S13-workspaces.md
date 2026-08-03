# S13 — Live candidate role workspaces

```yaml
id: S13
title: Live candidate role workspaces
status: see ../project-state.yaml
depends_on: [S09, S10, S12]
owner: platform-lead
acceptance:
  - Four packs end-to-end; AI/plugin outage leaves work functional; no publish/send/spend path.
rollback: >
  Flags off / additive artefacts retained; forward-fix only on evidence tables.
```

Full requirements: plan §"Step 13" in
docs/status/CPF_20_Step_Integration_Execution_Plan.md. Evidence links live in
../project-state.yaml.
