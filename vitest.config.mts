import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Les tests API partagent une base : pas de parallélisme entre fichiers.
    fileParallelism: false,
    setupFiles: ["tests/setup.ts"],
    testTimeout: 20_000,
  },
});
