# Runbook — plugin outage

**Detection:** tool-broker circuit breaker open; plugin p95/timeout alert; candidate incident reports.

1. Identify plugin + version from `tool_receipts` failure receipts (status `failed`/`timeout`).
2. Broker auto-circuit-breaks a failing plugin; verify degraded state is shown in the plugin drawer.
3. If the plugin is **non-essential** for the pack: leave session running; candidate continues.
4. If **essential** (e.g. TestRunner for SWE packs): pause affected sessions (`paused_tech`), record technical incidents, offer reschedule/support per policy.
5. Disable the plugin version in the manifest registry (kill switch) — new manifests exclude it; active manifests keep the pinned version but circuit-broken.
6. One plugin outage must not corrupt the session or other plugins (S10 gate). If it does, that is a P0.
7. Recovery: contract tests green on the plugin version before re-enable; suspend the pack if the tool cannot be restored.
