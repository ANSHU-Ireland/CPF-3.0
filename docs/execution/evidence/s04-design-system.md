# S04 evidence — design system (2026-08-03)

- Package `@cpf/design-system` builds (tsc → dist ESM) with `tokens.css` export.
- Tokens: full semantic set — colour (approved palette #F7F8FA/#FFF/#172033/#526071/#D9DEE7/#2355D8/#7AA2FF + paired status colours), type scale, 4px spacing, radius, borders, elevation, motion (reduced-motion collapses to 0ms), z-index, breakpoints, content widths (candidate 680px), 24px WCAG 2.2 target minimum.
- Components shipped: StatusChip, Notice, ErrorSummary (GOV.UK pattern), IncidentBanner, AutosaveState, Timer (threshold announcements only, no flashing), AppShell, SplitPane (collapses to stacked at small widths), Tabs/TabPanel (arrow-key roving), Dialog (native `<dialog>`), Stepper, DataTable (caption + scoped headers), Timeline (semantic ol), EvidenceLink (immutable mono IDs), Receipt, EmptyState, Skeleton (aria-hidden, no CLS).
- Tests: 13/13 PASS (roles, labels, keyboard paths, live-region politeness, error-summary field links).
- Root build/typecheck/test chains include the package. No product page ships raw colours going forward (V2 surfaces consume tokens).
- Deviation noted: no Storybook workbench added (repo has no workbench infra); component semantics are enforced by tests instead. Visual regression is a follow-up in S18.
