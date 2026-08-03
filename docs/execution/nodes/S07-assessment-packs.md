# S07 — Four signed assessment packs

```yaml
id: S07
title: Four signed assessment packs
status: see ../project-state.yaml
depends_on: [S05]
owner: platform-lead
acceptance:
  - Immutable versions + content hash; weights total 100; hidden tests never in candidate/model context.
rollback: >
  Flags off / additive artefacts retained; forward-fix only on evidence tables.
```

Full requirements: plan §"Step 7" in
docs/status/CPF_20_Step_Integration_Execution_Plan.md. Evidence links live in
../project-state.yaml.
