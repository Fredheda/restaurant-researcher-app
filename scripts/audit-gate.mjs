import { readFileSync } from "node:fs";

const ADVISORY = "https://github.com/advisories/GHSA-mrhx-c7xc-m3w5";
const ZOD_PATHS = [
  "node_modules/@a2ui/web_core/node_modules/zod",
  "node_modules/@copilotkit/a2ui-renderer/node_modules/zod",
];
const PROPAGATED = [
  "@a2ui/web_core",
  "@copilotkit/a2ui-renderer",
  "@copilotkit/core",
  "@copilotkit/react-core",
  "@copilotkit/web-inspector",
];
const BLOCKING = new Set(["high", "critical"]);
const STALE = "exception no longer needed: remove it from scripts/audit-gate.mjs";

const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

const stop = (problems) => {
  for (const problem of problems) console.error(`audit-gate: ${problem}`);
  process.exit(1);
};

let report;
try {
  report = JSON.parse(readFileSync(process.argv[2], "utf8"));
} catch {
  stop(["audit input is unreadable or not JSON"]);
}
if (!isObject(report)) stop(["audit input is not a JSON object"]);
if (!isObject(report.vulnerabilities) || !isObject(report.metadata)) {
  stop(["audit report lacks vulnerabilities or metadata"]);
}

const entries = report.vulnerabilities;
const blocking = Object.keys(entries).filter((name) => BLOCKING.has(entries[name]?.severity));
const accepted = new Set(["zod", ...PROPAGATED]);
const problems = blocking
  .filter((name) => !accepted.has(name))
  .map((name) => `unexpected high or critical advisory on ${name}`);

const advisories = Array.isArray(entries.zod?.via) ? entries.zod.via.filter(isObject) : [];
const nodes = Array.isArray(entries.zod?.nodes) ? entries.zod.nodes : [];
for (const advisory of advisories) {
  if (advisory.url !== ADVISORY) problems.push(`zod: unexpected advisory ${advisory.url}`);
}
for (const path of nodes) {
  if (!ZOD_PATHS.includes(path)) problems.push(`zod: unexpected path ${path}`);
}
for (const name of PROPAGATED) {
  const via = Array.isArray(entries[name]?.via) ? entries[name].via : [];
  for (const advisory of via.filter(isObject)) {
    if (BLOCKING.has(advisory.severity)) problems.push(`${name}: unexpected advisory ${advisory.url}`);
  }
}

const stale =
  !blocking.includes("zod") ||
  !advisories.some((advisory) => advisory.url === ADVISORY) ||
  !ZOD_PATHS.every((path) => nodes.includes(path)) ||
  !PROPAGATED.every((name) => blocking.includes(name));
if (stale) problems.push(STALE);

if (problems.length > 0) stop(problems);
console.log(`audit-gate: ok (accepted ${ADVISORY} on ${ZOD_PATHS.length} paths)`);
