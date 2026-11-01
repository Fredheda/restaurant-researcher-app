import { defineConfig } from "@playwright/test";

const port = process.env.E2E_PORT ?? "3917";
const apiPort = process.env.E2E_API_PORT ?? "3918";
const ci = !!process.env.CI;

const server = {
  reuseExistingServer: false,
  timeout: 60_000,
  stdout: "pipe",
  stderr: "pipe",
  gracefulShutdown: { signal: "SIGTERM", timeout: 2000 },
} as const;

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: ci,
  // No retries: a test that needs one is flaky, and a flaky test fails the run.
  retries: 0,
  failOnFlakyTests: ci,
  reporter: ci ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 720 },
    // Stands in for Easy Auth, which sets this header on every request it
    // lets into the web app.
    extraHTTPHeaders: { "x-ms-client-principal-id": "e2e-user" },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      ...server,
      command: "node e2e/fake-api/server.mjs",
      url: `http://127.0.0.1:${apiPort}/health`,
      env: { E2E_API_PORT: apiPort },
    },
    {
      ...server,
      command: "node e2e/serve.mjs",
      url: `http://127.0.0.1:${port}`,
      env: { E2E_PORT: port, API_URL: `http://127.0.0.1:${apiPort}` },
    },
  ],
});
