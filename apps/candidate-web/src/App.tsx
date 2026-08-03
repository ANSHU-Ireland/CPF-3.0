import type { ReactNode } from "react";

/**
 * Candidate portal shell (scaffold).
 *
 * This is the ownership boundary for the candidate assessment experience.
 * The full implementation (invitation resolution, assessment runtime, autosave,
 * outage-safe continuation) lands in M07. Until then this renders a scaffold
 * landing so the app is independently installable, buildable and testable.
 */
export function App(): ReactNode {
  return (
    <main>
      <h1>CPF Candidate</h1>
      <p>Candidate portal scaffold. Full experience arrives in M07.</p>
    </main>
  );
}
