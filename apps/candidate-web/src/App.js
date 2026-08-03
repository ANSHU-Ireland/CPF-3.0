import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Candidate portal shell (scaffold).
 *
 * This is the ownership boundary for the candidate assessment experience.
 * The full implementation (invitation resolution, assessment runtime, autosave,
 * outage-safe continuation) lands in M07. Until then this renders a scaffold
 * landing so the app is independently installable, buildable and testable.
 */
export function App() {
    return (_jsxs("main", { children: [_jsx("h1", { children: "CPF Candidate" }), _jsx("p", { children: "Candidate portal scaffold. Full experience arrives in M07." })] }));
}
