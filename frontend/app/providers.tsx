"use client";

import { CopilotKit } from "@copilotkit/react-core/v2";
import type { ReactNode } from "react";
import { AGENT_ID } from "./agent-id";

// Keeping <CopilotKit> in a client component stops its internal config
// from being serialised across the server-to-client boundary of the layout.
// No CopilotKit stylesheet: the assistant panel is our own UI.
export function Providers({ children }: { children: ReactNode }) {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" agent={AGENT_ID} useSingleEndpoint>
      {children}
    </CopilotKit>
  );
}
