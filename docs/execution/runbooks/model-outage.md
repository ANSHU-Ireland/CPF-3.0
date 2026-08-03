# Runbook — model provider outage

**Detection:** AI gateway error-rate alert; copilot first-token SLO breach; provider status page.

1. Confirm scope: single pack, tenant, or global. Check `ai_interactions` failure codes.
2. Flip kill switch `AI_GATEWAY_ENABLED=false` (global) or disable copilot per pack manifest — no deploy needed.
3. Candidate impact: work surfaces stay functional (S08 rule — AI never required to view/save/submit). Banner shows degraded state.
4. Sessions in flight: candidates may file a technical incident; time-credit policy applies via `technical_incidents` (`paused_tech`).
5. Never silently substitute a different model — a model change is a material change requiring re-evaluation.
6. Recovery: re-enable behind allowlist tenant first; verify evaluation suite against the pinned model/version before full restore.
7. Postmortem: incident record with affected sessions, credits granted, and evidence links.
