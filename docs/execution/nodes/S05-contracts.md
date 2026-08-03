# S05 — V2 domain, API, event and manifest contracts

```yaml
id: S05
title: V2 domain, API, event and manifest contracts
status: see ../project-state.yaml
depends_on: [S03]
owner: platform-lead
acceptance:
  - Zod contracts versioned; unknown fields rejected at boundaries; replay/idempotency tests.
rollback: >
  Flags off / additive artefacts retained; forward-fix only on evidence tables.
```

Full requirements: plan §"Step 5" in
docs/status/CPF_20_Step_Integration_Execution_Plan.md. Evidence links live in
../project-state.yaml.
