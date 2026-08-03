# S10 — Sandbox plugin broker and catalogue

```yaml
id: S10
title: Sandbox plugin broker and catalogue
status: see ../project-state.yaml
depends_on: [S08]
owner: platform-lead
acceptance:
  - Capability tokens; egress deny; receipts immutable; abuse contract tests fail closed.
rollback: >
  Flags off / additive artefacts retained; forward-fix only on evidence tables.
```

Full requirements: plan §"Step 10" in
docs/status/CPF_20_Step_Integration_Execution_Plan.md. Evidence links live in
../project-state.yaml.
