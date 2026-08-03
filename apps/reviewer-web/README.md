# @cpf/reviewer-web

Independent Reviewer web application.

## Ownership boundary

This app is the **only** home for the employer reviewer experience. Reviewer
features must not be added to `@cpf/admin-web` (`apps/admin-web/`) or `@cpf/web`
(`apps/web`). See [docs/architecture/application-boundaries.md](../../docs/architecture/application-boundaries.md).

## Status

Scaffold only. The full reviewer workspace is delivered in module **M09**.

## Commands

```bash
npm run reviewer:dev        # from repo root — Vite dev server on :5175
npm run reviewer:build      # typecheck + production build
npm run reviewer:test       # vitest
npm run reviewer:typecheck  # tsc --noEmit
```
