// A local stand-in for Supabase (REST, the auth user lookup and storage), for
// a dev server started with NEXT_PUBLIC_SUPABASE_URL pointing here: the
// server routes (service role and the owner's token) and the browser both
// talk to this, never to the real database. Copied from mock-server.mjs.
import http from "http";
import { callerOf, handle, makeDb } from "./qr-mockdb.mjs";

export function startMockServer(port, db = makeDb(), users = {}) {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Expose-Headers": "*" };
  db.uploads ??= [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      const u = new URL(req.url, `http://localhost:${port}`);
      const send = (status, json) => { res.writeHead(status, { ...cors, "content-type": "application/json" }); res.end(json === null ? "" : JSON.stringify(json)); };
      if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
      if (u.pathname.startsWith("/rest/v1/")) {
        let body = null;
        try { body = raw.length ? JSON.parse(raw.toString()) : null; } catch { body = null; }
        const r = handle(db, req.method, u.pathname, u.search, req.headers, body);
        return send(r.status, r.json);
      }
      if (u.pathname === "/auth/v1/user") {
        const user = users[callerOf(req.headers)];
        db.log.push({ key: `AUTH user ${user ? user.id : "none"}` });
        return user ? send(200, user) : send(401, { message: "invalid JWT" });
      }
      const up = /^\/storage\/v1\/object\/(receipts)\/(.+)$/.exec(u.pathname);
      if (up && req.method === "POST") {
        const path = decodeURIComponent(up[2]);
        db.uploads.push({ path, bytes: raw.length, type: req.headers["content-type"], caller: callerOf(req.headers) });
        return send(200, { Key: `receipts/${path}`, Id: "upload-id" });
      }
      const sign = /^\/storage\/v1\/object\/sign\/(receipts)\/(.+)$/.exec(u.pathname);
      if (sign && req.method === "POST") return send(200, { signedURL: `/object/sign/receipts/${sign[2]}?token=mock` });
      db.log.push({ key: `UNHANDLED ${req.method} ${u.pathname}` });
      send(404, {});
    });
  });
  server.listen(port);
  return { server, db };
}
