/**
 * The CopilotKit runtime: the browser talks to this route, and only this
 * route talks to the internal agent app at `AGENT_URL`.
 *
 * Header forwarding is an allowlist of the three Easy Auth principal
 * headers. The runtime's default would forward `authorization` and every
 * other `x-*` header, which behind Easy Auth includes the token-store
 * headers (`x-ms-token-*`). The principal headers come from the incoming
 * request, which Easy Auth sets, never from the run body.
 */
import { CopilotRuntime, createCopilotRuntimeHandler } from "@copilotkit/runtime/v2";
import { LangGraphHttpAgent } from "@copilotkit/runtime/langgraph";
import { AGENT_ID } from "../../agent-id";
import { PRINCIPAL_HEADERS } from "../principal";

export const dynamic = "force-dynamic";

const AGENT_URL = process.env.AGENT_URL ?? `http://localhost:8001/agent/${AGENT_ID}`;

const runtime = new CopilotRuntime({
  agents: { [AGENT_ID]: new LangGraphHttpAgent({ url: AGENT_URL }) },
  forwardHeaders: { allow: [...PRINCIPAL_HEADERS] },
  // Scopes the runtime's threads to the signed-in user. Without the header
  // (local dev, no Easy Auth) callers share one identity, and the agent app
  // refuses the run anyway.
  identifyUser: (request) => ({
    id: request.headers.get("x-ms-client-principal-id") || "anonymous",
    name: request.headers.get("x-ms-client-principal-name") || "",
  }),
});

const handler = createCopilotRuntimeHandler({
  runtime,
  basePath: "/api/copilotkit",
  mode: "single-route",
});

export const POST = handler;
export const GET = handler;
