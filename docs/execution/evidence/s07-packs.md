# S07 evidence — four assessment packs (2026-08-03)

- Package `@cpf/assessment-packs` v1.0.0 with SWE-FS-01 (tenant-safe product
  change), SWE-PLAT-02 (production incident), DM-PERF-01 (performance
  marketing recovery), DM-GTM-02 (B2B SaaS launch). All 110-minute format.
- Schema enforces: weights total exactly 100 across the ten fixed dimensions;
  ≥2 calibration cases; strict shapes; job-analysis note per pack.
- Immutability: `packContentHash()` (canonical JSON SHA-256) + DB trigger from
  0028 (published versions reject content mutation; suspension allowed).
- Hidden checks are a **separate export** (`loadHiddenChecks`) — structurally
  impossible to leak via pack/candidate serialisation; test asserts absence.
- `candidateView()` strips weights/anchors/calibration/job-analysis while
  keeping dimension transparency (candidates see what is assessed, not how
  it is weighted).
- Reviewer anchors: shared standard anchor library (consistent calibration
  language) with per-pack weighting.
- Marketing packs are day-to-day work (analytics, budget, claims/consent,
  stakeholder memo) — no algorithms; SWE packs are production-shaped (tenancy,
  incident evidence) — not puzzle-first.
- Tests 7/7 PASS incl. determinism, leak-absence, claims/credential hygiene.
- External gates recorded as pending: SME ×2 + I-O psychologist approval per
  pack (risk register R-pack); calibration threshold study runs in S19.
