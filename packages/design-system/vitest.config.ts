import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["test/**/*.test.tsx", "test/**/*.test.ts"],
  },
  esbuild: {
    jsx: "automatic",
  },
});
