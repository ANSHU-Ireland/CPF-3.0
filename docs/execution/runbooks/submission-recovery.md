# Runbook — submission recovery

**Detection:** session stuck in `submitting`; `receipt_pending` recovery bundle present; candidate reports "did it submit?".

1. Look up the session's finalisation attempts by idempotency key in `shutdown_receipts` / finalisation log.
2. **Receipt exists:** submission is complete. Resend receipt to candidate; close incident.
3. **No receipt, recovery bundle exists:** operations triggers the bounded retry (`receipt_pending` policy). The bundle contains artifact/event hash heads only — never mutate candidate artifacts.
4. **Concurrent duplicate attempts:** the unique manifest nonce guarantees one receipt; the loser gets the winner's receipt, never an error page.
5. Ambiguous cases go to support review with full audit; operations may resolve state but cannot edit artifacts (append-only).
6. Candidate always leaves with a durable status + support code.
7. Weekly: alert on any session >24h in `submitting`/`receipt_pending`.
