/**
 * @cpf/design-system — CPF V2 design system (S04).
 *
 * Semantic tokens live in ./tokens.css (import once per app entry). Every
 * component here targets WCAG 2.2 AA: visible focus, text-paired status,
 * ≥24px targets, no motion without prefers-reduced-motion fallback.
 */
export { StatusChip, Notice, ErrorSummary, IncidentBanner, AutosaveState, Timer, type StatusTone } from "./status.js";
export { AppShell, SplitPane, Tabs, TabPanel, Dialog, Stepper } from "./layout.js";
export { DataTable, Timeline, EvidenceLink, Receipt, EmptyState, Skeleton } from "./data.js";
