import { jsx as _jsx } from "react/jsx-runtime";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";
describe("Reviewer web scaffold", () => {
    it("renders the reviewer workspace heading", () => {
        render(_jsx(App, {}));
        expect(screen.getByRole("heading", { name: "CPF Reviewer" })).toBeTruthy();
    });
});
