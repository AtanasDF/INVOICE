// A local stand-in for Supabase's REST API, for a dev server started with
// NEXT_PUBLIC_SUPABASE_URL pointing here: server-side code (service role)
// and the browser both talk to this, never to the real database.
import http from "http";
import { fakeUser, handle, makeDb } from "./mockdb.mjs";

export function startMockServer(port, db = makeDb()) {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Expose-Headers": "*" };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const u = new URL(req.url, `http://localhost:${port}`);
      if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
      // Storage uploads (the inbox import's storeImageForUser): the path is
      // kept in the log, and db.storageFails makes it behave like an outage.
      if (req.method === "POST" && u.pathname.startsWith("/storage/v1/object/")) {
        const path = u.pathname.slice("/storage/v1/object/".length);
        db.log.push({ key: `STORAGE ${path}`, bytes: raw.length, contentType: req.headers["content-type"] ?? "" });
        if (db.storageFails) { res.writeHead(500, { ...cors, "content-type": "application/json" }); return res.end(JSON.stringify({ statusCode: "500", error: "outage", message: "storage is down" })); }
        res.writeHead(200, { ...cors, "content-type": "application/json" });
        return res.end(JSON.stringify({ Key: path }));
      }
      // A server-side route checking who is asking (auth.getUser with the
      // bearer token): any token is the harness user, no token is nobody.
      if (u.pathname === "/auth/v1/user") {
        const bearer = /^Bearer\s+\S+/.test(req.headers.authorization ?? "");
        res.writeHead(bearer ? 200 : 401, { ...cors, "content-type": "application/json" });
        return res.end(JSON.stringify(bearer ? fakeUser() : { message: "no token" }));
      }
      if (u.pathname.startsWith("/rest/v1/")) {
        let body = null;
        try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
        const r = handle(db, req.method, u.pathname, u.search, req.headers, body);
        res.writeHead(r.status, { ...cors, "content-type": "application/json" });
        return res.end(r.json === null ? "" : JSON.stringify(r.json));
      }
      db.log.push({ key: `UNHANDLED ${req.method} ${u.pathname}` });
      res.writeHead(404, cors);
      res.end("{}");
    });
  });
  server.listen(port);
  return { server, db };
}
