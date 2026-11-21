// A fake api for the browser tests: answers POST /api/searches with a fixed
// result, but only for a request that carries the sign-in header the proxy
// forwards (401 otherwise, like the real api). A query containing "slow" waits
// 1.5 s; one containing "fail" gets 502. Port: E2E_API_PORT (default 3918).
import { createServer } from "node:http";

const port = Number(process.env.E2E_API_PORT ?? "3918");

const place = (id, name) => ({
  id,
  name,
  type: "Ramen",
  neighbourhood: "Soho",
  priceTier: "££",
  overview: {
    rating: 4.5,
    reviewCount: 120,
    address: "1 Test Street",
    openStatus: "Open now",
    reviewQuotes: [],
  },
});

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    return json(response, 200, { ok: true });
  }
  if (request.method !== "POST" || request.url !== "/api/searches") {
    return json(response, 404, { error: "not found" });
  }
  if (!request.headers["x-ms-client-principal-id"]) {
    return json(response, 401, { error: "sign-in required" });
  }
  let raw = "";
  request.on("data", (chunk) => (raw += chunk));
  request.on("end", () => {
    let query = "";
    try {
      query = String(JSON.parse(raw).query ?? "");
    } catch {
      return json(response, 422, { error: "invalid body" });
    }
    if (query.includes("fail")) return json(response, 502, { error: "search unavailable" });
    const answer = () =>
      json(response, 200, {
        id: "fake-search",
        query,
        places: [place("ramen-one", "Ramen One"), place("ramen-two", "Ramen Two")],
      });
    if (query.includes("slow")) setTimeout(answer, 1500);
    else answer();
  });
});

server.listen(port, "127.0.0.1");
process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
