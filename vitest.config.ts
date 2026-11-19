import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    globalSetup: ["./tests/global-setup.ts"],
    fileParallelism: false,
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://rejenga:rejenga@localhost:5432/rejenga_test", AI_ENABLED: "false" },
  },
});
