// Serves the production build the way the image does: .next/standalone with
// .next/static and public copied beside server.js (see frontend/Dockerfile).
// Copies into a temp dir so the build output stays untouched.
// Run `npm run build` first. Port: E2E_PORT (default 3917).
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = process.env.E2E_PORT ?? "3917";

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
  env: {
    ...process.env,
    PORT: port,
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    // As in the Docker image.
    COPILOTKIT_TELEMETRY_DISABLED: "true",
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
