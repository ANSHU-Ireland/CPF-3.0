import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Reviewer workspace shell (scaffold).
 *
 * This is the ownership boundary for the employer reviewer experience.
 * The full implementation (review queue, evidence workspace, calibrated
 * scoring, decision capture) lands in M09. Until then this renders a scaffold
 * landing so the app is independently installable, buildable and testable.
 */
export function App() {
    return (_jsxs("main", { children: [_jsx("h1", { children: "CPF Reviewer" }), _jsx("p", { children: "Reviewer workspace scaffold. Full experience arrives in M09." })] }));
}
