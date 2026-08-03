# @cpf/candidate-web

Independent Candidate web application.

## Ownership boundary

This app is the **only** home for the candidate assessment experience. Candidate
features must not be added to `@cpf/admin-web` (`apps/admin-web/`) or `@cpf/web`
(`apps/web`). See [docs/architecture/application-boundaries.md](../../docs/architecture/application-boundaries.md).

## Status

Scaffold only. The full candidate runtime is delivered in module **M07**.

## Commands

```bash
npm run candidate:dev        # from repo root — Vite dev server on :5174
npm run candidate:build      # typecheck + production build
npm run candidate:test       # vitest
npm run candidate:typecheck  # tsc --noEmit
```
