import "./telemetry-off";
import { HttpAgent } from "@ag-ui/client";
import {
  CopilotRuntime,
  InMemoryAgentRunner,
  createCopilotRuntimeHandler,
} from "@copilotkit/runtime/v2";
import { AGENT_ID } from "../../agent";
import { PRINCIPAL_HEADER_NAMES } from "../principal";

export type RuntimeHandler = (request: Request) => Promise<Response>;

export function createRuntimeHandler(agentOrigin: URL): RuntimeHandler {
  const runtime = new CopilotRuntime({
    agents: {
      [AGENT_ID]: new HttpAgent({ url: new URL(`/agent/${AGENT_ID}`, agentOrigin).toString() }),
    },
    runner: new InMemoryAgentRunner({
      maxThreads: 200,
      maxRunsPerThread: 20,
      maxBytes: 64 * 1024 ** 2,
    }),
    forwardHeaders: { allow: PRINCIPAL_HEADER_NAMES },
    identifyUser: (request) => {
      const id = request.headers.get("x-ms-client-principal-id") ?? "";
      return { id, name: request.headers.get("x-ms-client-principal-name") ?? id };
    },
  });
  return createCopilotRuntimeHandler({
    runtime,
    basePath: "/api/copilotkit",
    mode: "single-route",
  });
}
