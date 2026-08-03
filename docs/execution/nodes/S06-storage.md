# S06 — V2 storage, RLS, retention

```yaml
id: S06
title: V2 storage, RLS, retention
status: see ../project-state.yaml
depends_on: [S05]
owner: platform-lead
acceptance:
  - Additive tables; forced RLS; cross-tenant negative tests fail closed; retention jobs delete with evidence.
rollback: >
  Flags off / additive artefacts retained; forward-fix only on evidence tables.
```

Full requirements: plan §"Step 6" in
docs/status/CPF_20_Step_Integration_Execution_Plan.md. Evidence links live in
../project-state.yaml.
