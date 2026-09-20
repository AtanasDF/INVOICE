import http from "http";
const hits = new Map();
http.createServer((req, res) => {
  let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/auth/v1/user") {
      const who = { "Bearer good": "00000000-0000-4000-8000-000000000001", "Bearer other": "00000000-0000-4000-8000-000000000002" }[req.headers.authorization];
      res.writeHead(who ? 200 : 401, { "content-type": "application/json" });
      return res.end(JSON.stringify(who ? { id: who, aud: "authenticated", role: "authenticated", email: "t@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } : { code: 401, msg: "bad jwt" }));
    }
    if (u.pathname === "/rest/v1/rpc/hit_rate_limit") {
      const b = JSON.parse(raw || "{}"); const n = (hits.get(b.p_key) ?? 0) + 1; hits.set(b.p_key, n);
      res.writeHead(200, { "content-type": "application/json" }); return res.end(n <= b.p_limit ? "true" : "false");
    }
    res.writeHead(404); res.end("{}");
  });
}).listen(5556);
