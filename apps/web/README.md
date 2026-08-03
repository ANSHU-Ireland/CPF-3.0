# @cpf/web — LEGACY (V1)

> **⚠️ LEGACY APPLICATION — DO NOT ADD NEW FEATURES HERE.**
>
> `apps/web` is the original combined V1 web application. It is retained only to
> keep the working V1 employer/platform/candidate/reviewer flows runnable during
> the M01–M14 recovery. It is being decomposed into role-scoped applications:
>
> | Experience | New owning app | Module |
> | ---------- | -------------- | ------ |
> | Super Admin / Employer Admin | `apps/admin-web/` → `@cpf/admin-web` | M02+ |
> | Candidate | `apps/candidate-web` → `@cpf/candidate-web` | M07 |
> | Reviewer | `apps/reviewer-web` → `@cpf/reviewer-web` | M09 |
>
> **Ownership rule:** No new Candidate or Reviewer modules may be added to this
> app. New role work belongs in the dedicated apps above. See
> [docs/architecture/application-boundaries.md](../../docs/architecture/application-boundaries.md).
>
> **Deferred cutover (tracked, not yet done):** This package is still named
> `@cpf/web` and still registers the embedded Candidate V2 and Reviewer V2 routes.
> Renaming to `@cpf/legacy-web` and removing those route registrations is
> intentionally deferred to the **M14** routing cutover, because their
> replacements (`candidate-web`, `reviewer-web`) are not yet implemented (M07/M09)
> and a live demo currently depends on them. Removing them earlier would break the
> candidate experience with no replacement. See the M02 entry in
> [docs/execution/recovery/decision-log.md](../../docs/execution/recovery/decision-log.md).

## Status

Runnable legacy V1. Preserved for continuity, not for new development.

## Commands

```bash
npm run legacy:dev    # from repo root — Vite dev server on :5173
npm run legacy:build  # tsc + production build
npm run legacy:test   # vitest
```
