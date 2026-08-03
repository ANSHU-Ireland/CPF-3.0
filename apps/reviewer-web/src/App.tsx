import type { ReactNode } from "react";

/**
 * Reviewer workspace shell (scaffold).
 *
 * This is the ownership boundary for the employer reviewer experience.
 * The full implementation (review queue, evidence workspace, calibrated
 * scoring, decision capture) lands in M09. Until then this renders a scaffold
 * landing so the app is independently installable, buildable and testable.
 */
export function App(): ReactNode {
  return (
    <main>
      <h1>CPF Reviewer</h1>
      <p>Reviewer workspace scaffold. Full experience arrives in M09.</p>
    </main>
  );
}
