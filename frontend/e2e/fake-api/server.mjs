// A stand-in for the backend api app in the browser tests: plain node:http,
// no Python. Like the real app it refuses requests without the Easy Auth
// principal header, so a test that renders cards proves the web app's proxy
// forwarded it. Port: E2E_API_PORT (default 3918).
//
// - POST /api/searches: a query containing "fail" answers 502; any other
//   query answers the fixed search below.
// - GET /api/searches/<id>: the fixed search for its id, else 404.
import { createServer } from "node:http";

const port = Number(process.env.E2E_API_PORT ?? "3918");

export const SEARCH = {
  id: "s-e2e-ramen",
  query: "ramen",
  places: [
    {
      id: "koya-soho",
      name: "Koya Soho",
      type: "Udon restaurant",
      neighbourhood: "Soho",
      priceTier: "££",
      hygieneRating: 5,
      overview: {
        rating: 4.6,
        reviewCount: 3120,
        address: "50 Frith St, London W1D 4SQ",
        openStatus: "Open now",
        reviewQuotes: [],
      },
    },
    {
      id: "kanada-ya",
      name: "Kanada-Ya",
      type: "Ramen restaurant",
      neighbourhood: "St Giles",
      priceTier: null,
      hygieneRating: null,
      overview: {
        rating: 4.5,
        reviewCount: 2050,
        address: "64 St Giles High St, London WC2H 8LE",
        openStatus: "",
        reviewQuotes: [],
      },
    },
  ],
};

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  if (req.url === "/health") return send(res, 200, { status: "ok" });
  if (!req.headers["x-ms-client-principal-id"]) {
    return send(res, 401, { error: "sign-in required" });
  }
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    if (req.method === "POST" && req.url === "/api/searches") {
      const { query = "" } = JSON.parse(body || "{}");
      if (query.includes("fail")) return send(res, 502, { error: "search unavailable" });
      return send(res, 200, { ...SEARCH, query });
    }
    const match = req.url?.match(/^\/api\/searches\/([^/?]+)$/);
    if (req.method === "GET" && match) {
      return match[1] === SEARCH.id ? send(res, 200, SEARCH) : send(res, 404, { error: "not found" });
    }
    send(res, 404, { error: "not found" });
  });
});

server.listen(port, "127.0.0.1");
process.on("SIGTERM", () => server.close(() => process.exit(0)));
