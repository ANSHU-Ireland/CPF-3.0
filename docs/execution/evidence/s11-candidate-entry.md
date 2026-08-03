# S11/S12/S13/S14 evidence — candidate V2 UI (2026-08-03)

- Entry flow [apps/web/src/features/candidate-v2/entry/CandidateV2EntryPage.tsx]: invitation summary, notice centre (versions displayed + recorded server-side at disclose), 4-item comprehension gate with GOV.UK-style error summary linking each unchecked field, accommodations/alternative-route copy, single-column 680px service flow, stepper.
- Preflight [S12]: live network/storage/clock checks with ready/action-needed states (no red failure language), tutorial-not-scored notice, clock starts only on explicit check-in.
- Workspace [S13, apps/web/src/features/candidate-v2/runtime/WorkspacePage.tsx]: top bar (title, state chip, threshold-announcing Timer, AutosaveState, pause/report, submit), left rail (brief/stages/assets), tabbed deliverable editors with debounced immutable-version autosave + REVISION_CONFLICT recovery, right dock (copilot chat + tools + receipts), offline IncidentBanner with retry, paused_tech banner with resume; copilot/tool failure never blocks editing or submitting.
- Submit [S14]: review-before-submit dialog (deliverable checklist, declared limitations), atomic finalise via manifest nonce, signed Receipt (support code, artifact head, signature) rendering, safe-retry messaging.
- Tests: apps/web/test/CandidateV2EntryPage.test.tsx 5/5 PASS; full web suite 105/105 PASS (V1 untouched).
