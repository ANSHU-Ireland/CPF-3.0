# S09 — Controlled assessment copilot

```yaml
id: S09
title: Controlled assessment copilot
status: see ../project-state.yaml
depends_on: [S08]
owner: platform-lead
acceptance:
  - Server-built prompts; displayed-messages-only storage; forbidden-output guards; budgets; kill switch.
rollback: >
  Flags off / additive artefacts retained; forward-fix only on evidence tables.
```

Full requirements: plan §"Step 9" in
docs/status/CPF_20_Step_Integration_Execution_Plan.md. Evidence links live in
../project-state.yaml.
