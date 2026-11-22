import { createServer } from "node:http";

const port = Number(process.env.E2E_AGENT_PORT ?? "3919");
const seen = [];

function events(input, text) {
  return [
    { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId },
    { type: "TEXT_MESSAGE_START", messageId: `${input.runId}-a`, role: "assistant" },
    { type: "TEXT_MESSAGE_CONTENT", messageId: `${input.runId}-a`, delta: text },
    { type: "TEXT_MESSAGE_END", messageId: `${input.runId}-a` },
    { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId },
  ];
}

function lastUserText(input) {
  const users = (input.messages ?? []).filter((m) => m.role === "user");
  const content = users.at(-1)?.content;
  return typeof content === "string" ? content : "";
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200).end("ok");
    return;
  }
  if (req.method === "GET" && url.pathname === "/_seen") {
    const user = url.searchParams.get("user");
    const rows = user ? seen.filter((row) => row["x-ms-client-principal-id"] === user) : seen;
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(rows));
    return;
  }
  if (req.method !== "POST" || url.pathname !== "/agent/restaurant_researcher") {
    res.writeHead(404).end();
    return;
  }
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    seen.push({ ...req.headers });
    const input = JSON.parse(body || "{}");
    const question = lastUserText(input);
    if (question.includes("fail")) {
      res.writeHead(500).end("boom");
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    for (const event of events(input, `You asked: ${question}`)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    res.end();
  });
});

server.listen(port, "127.0.0.1");
process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
