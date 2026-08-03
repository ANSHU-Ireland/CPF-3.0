# Application Boundaries & Ownership Rules

Status: **normative** (established in module M02).

CPF 3.0 splits the web surface by user role. Each role has exactly one owning
application. This document is the authoritative ownership contract; CODEOWNERS
(`.github/CODEOWNERS`) enforces review routing against it.

## Role → Application map

| Role(s) | Owning application | Package | Physical path | Status |
| ------- | ------------------ | ------- | ------------- | ------ |
| Super Admin, Employer Admin | Admin web | `@cpf/admin-web` | `apps/admin-web/` | Active (M02) |
| Candidate | Candidate web | `@cpf/candidate-web` | `apps/candidate-web/` | Scaffold → M07 |
| Employer Reviewer | Reviewer web | `@cpf/reviewer-web` | `apps/reviewer-web/` | Scaffold → M09 |
| — (all V1, legacy) | Legacy web | `@cpf/web` | `apps/web/` | Legacy, frozen |

## Ownership rules (MUST)

1. **Candidate experience** lives only in `apps/candidate-web`. No Candidate
   modules, routes, or components may be added to `apps/admin-web` (`@cpf/admin-web`)
   or `apps/web` (`@cpf/web`).
2. **Reviewer experience** lives only in `apps/reviewer-web`. No Reviewer
   modules, routes, or components may be added to `apps/admin-web` or `apps/web`.
3. **Admin experience** (platform + employer administration) lives only in
   `apps/admin-web` (`@cpf/admin-web`).
4. `apps/web` (`@cpf/web`) is **frozen legacy**. No new features of any role may
   be added. It exists solely to keep V1 runnable until the M14 cutover.
5. Every web application MUST be independently installable, buildable, testable,
   and typecheckable via root workspace scripts (`admin:*`, `candidate:*`,
   `reviewer:*`, `legacy:*`).

## Deferred M02 items (tracked)

The following two M02 checklist items are intentionally deferred to **M14**
(routing cutover), recorded in `docs/execution/recovery/decision-log.md`:

- Renaming `@cpf/web` → `@cpf/legacy-web`.
- Removing the embedded Candidate V2 / Reviewer V2 route registrations from
  `apps/web/src/main.tsx`.

Rationale: their replacements (`candidate-web` M07, `reviewer-web` M09) do not
yet exist, and a live demo depends on the current `@cpf/web` routes. Removing
them now would break the candidate/reviewer experience with no replacement,
violating the "legacy V1 remains runnable" acceptance criterion. The ownership
rules above already prevent *new* role code from entering the legacy app, which
is the substantive guarantee M02 requires.
