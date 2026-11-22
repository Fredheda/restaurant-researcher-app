// Serves the production build the way the image does: .next/standalone with
// .next/static and public copied beside server.js (see frontend/Dockerfile).
// Copies into a temp dir so the build output stays untouched.
// Run `npm run build` first. Port: E2E_PORT (default 3917).
// This server always points at the fake api (e2e/fake-api.mjs, E2E_API_PORT,
// default 3918) and the fake agent (e2e/fake-agent.mjs, E2E_AGENT_PORT, default
// 3919) and is for the browser tests only; a local run uses `npm start`.
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = process.env.E2E_PORT ?? "3917";
const apiPort = process.env.E2E_API_PORT ?? "3918";
const agentPort = process.env.E2E_AGENT_PORT ?? "3919";

if (!existsSync(".next/standalone/server.js")) {
  console.error("No .next/standalone/server.js: run `npm run build` first.");
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), "rr-e2e-"));
cpSync(".next/standalone", dir, { recursive: true });
cpSync(".next/static", join(dir, ".next", "static"), { recursive: true });
cpSync("public", join(dir, "public"), { recursive: true });

const server = spawn("node", ["server.js"], {
  cwd: dir,
  stdio: "inherit",
  // API_URL and AGENT_URL come after ...process.env so real ones in the shell cannot reach the tests.
  env: {
    ...process.env,
    PORT: port,
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    API_URL: `http://127.0.0.1:${apiPort}`,
    AGENT_URL: `http://127.0.0.1:${agentPort}`,
  },
});

function stop() {
  server.kill("SIGTERM");
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("exit", (code) => {
  rmSync(dir, { recursive: true, force: true });
  process.exit(code ?? 0);
});
