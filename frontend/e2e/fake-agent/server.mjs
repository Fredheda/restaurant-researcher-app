// A stand-in for the backend agent app's AG-UI endpoint in the browser
// tests: plain node:http, scripted events, no model. The web app's CopilotKit
// runtime reaches it through AGENT_URL, so the real client and runtime run.
// Like the real app it refuses runs without the principal header. It records
// which headers arrived, so a test can check the runtime's allowlist.
// Port: E2E_AGENT_PORT (default 3919).
//
// The reply is picked from the last message:
// - a tool result (the browser ran show_places or open_place): a short answer
// - "break": RUN_ERROR
// - "open koya": an open_place call
// - "ramen": the backend search_places call with its result, then show_places
// - anything else: one text answer
import { createServer } from "node:http";

const port = Number(process.env.E2E_AGENT_PORT ?? "3919");
const PATH = "/agent/restaurant_researcher";
export const SEARCH_ID = "s-e2e-ramen";

let seen = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function text(runId, content) {
  const messageId = `msg-${runId}`;
  return [
    { type: "TEXT_MESSAGE_START", messageId, role: "assistant" },
    { type: "TEXT_MESSAGE_CONTENT", messageId, delta: content },
    { type: "TEXT_MESSAGE_END", messageId },
  ];
}

function toolCall(id, name, args) {
  return [
    { type: "TOOL_CALL_START", toolCallId: id, toolCallName: name },
    { type: "TOOL_CALL_ARGS", toolCallId: id, delta: JSON.stringify(args) },
    { type: "TOOL_CALL_END", toolCallId: id },
  ];
}

function lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user" && typeof messages[i].content === "string") {
      return messages[i].content.toLowerCase();
    }
  }
  return "";
}

function plan(input) {
  const { threadId, runId, messages } = input;
  const start = { type: "RUN_STARTED", threadId, runId };
  const end = { type: "RUN_FINISHED", threadId, runId };
  const last = messages.at(-1);
  if (last?.role === "tool") {
    const answer = last.content?.startsWith("Opened")
      ? last.content
      : "Two ramen places are on the board. Koya Soho rates highest.";
    return [start, ...text(runId, answer), end];
  }
  const said = lastUserText(messages);
  if (said.includes("break")) {
    return [start, { type: "RUN_ERROR", message: "boom", code: "agent_error" }];
  }
  if (said.includes("open koya")) {
    return [start, ...toolCall(`call-open-${runId}`, "open_place", { place_id: "koya-soho" }), end];
  }
  if (said.includes("ramen")) {
    const searchCall = `call-search-${runId}`;
    return [
      start,
      ...toolCall(searchCall, "search_places", { query: said }),
      {
        type: "TOOL_CALL_RESULT",
        messageId: `result-${runId}`,
        toolCallId: searchCall,
        role: "tool",
        content: JSON.stringify({
          search_id: SEARCH_ID,
          places: [
            { id: "koya-soho", name: "Koya Soho", rating: 4.6, price: "££", area: "Soho" },
            { id: "kanada-ya", name: "Kanada-Ya", rating: 4.5, price: null, area: "St Giles" },
          ],
        }),
      },
      ...toolCall(`call-show-${runId}`, "show_places", { search_id: SEARCH_ID }),
      end,
    ];
  }
  return [start, ...text(runId, "I only answer scripted prompts."), end];
}

async function run(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;
  const headers = Object.keys(req.headers);
  seen.push({
    principalId: req.headers["x-ms-client-principal-id"] ?? null,
    forwardedSecrets: headers.filter((h) => h.startsWith("x-ms-token-") || h === "authorization" || h === "cookie"),
  });
  if (!req.headers["x-ms-client-principal-id"]) return json(res, 401, { error: "sign-in required" });
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (const event of plan(JSON.parse(body))) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    await sleep(15);
  }
  res.end();
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") return json(res, 200, { status: "ok" });
  if (req.method === "GET" && req.url === "/__seen") return json(res, 200, seen);
  if (req.method === "POST" && req.url === "/__reset") {
    seen = [];
    return json(res, 200, { status: "reset" });
  }
  if (req.method === "POST" && req.url === PATH) return void run(req, res);
  json(res, 404, { error: "not found" });
});

server.listen(port, "127.0.0.1");
process.on("SIGTERM", () => server.close(() => process.exit(0)));
