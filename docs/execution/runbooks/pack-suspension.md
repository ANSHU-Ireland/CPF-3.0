# Runbook — assessment pack suspension

**Trigger:** validity defect, security issue in seed assets, legal/DPO instruction, or SME withdrawal of approval.

1. Suspend the pack **version** for new invitations in the pack registry (flag, no deploy).
2. Existing invitations/sessions keep their exact pinned version — an invited version is immutable (plan invariant).
3. Decide per policy whether in-flight sessions continue (defect does not affect fairness) or pause to support review (it does).
4. Fixing content = clone → new version → SME/I-O re-approval → new content hash. Never edit in place.
5. Notify affected employers; record decision + evidence in the pack change log.
6. Reviewer guidance: reviews of suspended-version sessions note the limitation in the review record.
