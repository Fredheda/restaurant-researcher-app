import { defineConfig } from "@playwright/test";

const port = process.env.E2E_PORT ?? "3917";
const apiPort = process.env.E2E_API_PORT ?? "3918";
const agentPort = process.env.E2E_AGENT_PORT ?? "3919";
const ci = !!process.env.CI;

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
    // The tests act as a signed-in user: the proxy forwards the platform's
    // sign-in header, and the fake api answers 401 without it.
    extraHTTPHeaders: { "x-ms-client-principal-id": "e2e-user" },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      command: "node e2e/fake-api.mjs",
      url: `http://127.0.0.1:${apiPort}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: "pipe",
      stderr: "pipe",
      gracefulShutdown: { signal: "SIGTERM", timeout: 2000 },
    },
    {
      command: "node e2e/fake-agent.mjs",
      url: `http://127.0.0.1:${agentPort}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: "pipe",
      stderr: "pipe",
      gracefulShutdown: { signal: "SIGTERM", timeout: 2000 },
    },
    {
      command: "node e2e/serve.mjs",
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
      gracefulShutdown: { signal: "SIGTERM", timeout: 2000 },
    },
  ],
});
