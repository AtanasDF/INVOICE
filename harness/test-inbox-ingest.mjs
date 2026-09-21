// The email import route, /api/inbox/ingest, run for real: its own Next
// dev server pointed at the harness's PostgREST stand-in (mock-server.mjs)
// and at a stand-in Claude API on this machine, so the route, the reader's
// client, the storage upload and every row it writes are the app's own --
// and nothing reaches the live database or the real reader.
//
// What matters here is what happens when things go wrong, because there is
// nobody watching an email come in: a document the reader refuses (429,
// 529, cut off) must still be filed for review with the document attached,
// a row the database refuses must not lose the attachments behind it, and
// a storage outage must leave the document inline rather than gone.
import http from "node:http";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { startMockServer } from "./mock-server.mjs";
import { makeDb, UID } from "./mockdb.mjs";
const require = createRequire(import.meta.url);
const { PDFDocument } = require("/Users/nasko/Desktop/INVOICE/web/node_modules/pdf-lib");

const WEB = "/Users/nasko/Desktop/INVOICE/web";
const PORT = 3308;
const MOCK = 3556;
const STUB = 3397;
const SECRET = "hook-secret-for-the-harness";
const TOKEN = "8f3a91c2e6b4d0a17f2c9e4b1a6d3f08";
const base = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// A stand-in for api.anthropic.com: answers /v1/messages from a script of
// canned replies, one per call, and records what it was asked.
const stub = { script: [], calls: [] };
const reply = (documents) => ({ status: 200, body: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5", stop_reason: "tool_use", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: "tool_use", id: "toolu_1", name: "record_documents", input: { documents } }] } });
const overloaded = { status: 529, body: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } };
const cutOff = { status: 200, body: { id: "msg_2", type: "message", role: "assistant", model: "claude-opus-5", stop_reason: "max_tokens", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 16000 }, content: [] } };
const stubServer = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    let body = null;
    try { body = JSON.parse(raw); } catch {}
    const blocks = body?.messages?.[0]?.content ?? [];
    stub.calls.push({ tool: body?.tools?.[0]?.name, documents: blocks.filter((b) => b.type === "document").length, images: blocks.filter((b) => b.type === "image").length });
    const r = stub.script.shift() ?? reply([]);
    res.writeHead(r.status, { "content-type": "application/json" });
    res.end(JSON.stringify(r.body));
  });
});
stubServer.listen(STUB);

const db = makeDb();
db.tables.business_profile = [{ user_id: UID, business_name: "Harness Ltd", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1, custom_categories: null, inbox_token: TOKEN }];
db.tables.receipts = [];
const { server: mock } = startMockServer(MOCK, db);

const env = {
  ...process.env,
  INBOX_WEBHOOK_SECRET: SECRET,
  NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${MOCK}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "fake-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key",
  ANTHROPIC_API_KEY: "fake-anthropic-key",
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${STUB}`,
};
const app = spawn("npx", ["next", "dev", "--webpack", "-p", String(PORT)], { cwd: WEB, env, stdio: ["ignore", "pipe", "pipe"] });
app.stderr.on("data", (d) => process.env.VERBOSE && console.log("dev:", String(d).trim()));

const post = (body, secret = SECRET) =>
  fetch(`${base}/api/inbox/ingest`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${secret}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });

async function pdf(pages, text) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([300, 400]);
    page.drawText(`${text} page ${i + 1}`, { x: 20, y: 360, size: 14 });
  }
  return Buffer.from(await doc.save()).toString("base64");
}
const INVOICE = { documentType: "invoice", vendor: "Brightwork Ltd", date: "2026-09-14", dateAsPrinted: "14/09/2026", totalAmount: 1193.88, vatAmount: 198.98, invoiceNumber: "INV-1043", dueDate: "2026-09-28", dueDateAsPrinted: "28/09/2026", pages: [1], paidOnDocument: false, category: "Materials", lineItems: [{ description: "Plastering, ground floor", quantity: 12.5, unitPrice: 38.4 }] };
const RECEIPT = { documentType: "receipt", vendor: "Toolstation", date: "2026-09-20", dateAsPrinted: "20/09/2026", totalAmount: 84.2, vatAmount: 14.03, pages: [2], paidOnDocument: true };
const rows = () => db.tables.receipts;
const reset = () => { db.tables.receipts = []; db.log.length = 0; stub.calls.length = 0; stub.script.length = 0; db.fail = {}; db.storageFails = false; };
const stored = () => db.log.filter((l) => String(l.key).startsWith("STORAGE "));

try {
  for (let i = 0; i < 180; i++) {
    const res = await post({}, "wrong").catch(() => null);
    if (res) { await res.text(); break; }
    await sleep(1000);
  }
  const one = await pdf(1, "Invoice 1043");
  const two = await pdf(2, "Two documents");

  // The door.
  let res = await post({ token: TOKEN, attachments: [] }, "wrong");
  check("the wrong secret is refused", res.status === 401, String(res.status));
  res = await post({ attachments: [] });
  check("no token is a bad request", res.status === 400, String(res.status));
  res = await post({ token: "0".repeat(32), attachments: [] });
  check("an unknown token is not found, and says nothing more", res.status === 404 && rows().length === 0, `${res.status} rows=${rows().length}`);

  // Nothing usable: the email itself is filed, so it is at least visible.
  reset();
  res = await post({ token: TOKEN, from: "ap@supplier.example", subject: "Your statement", textBody: "Please see the figures below.\nTotal £120.00", attachments: [{ filename: "notes.csv", mimeType: "text/csv", base64: Buffer.from("a,b").toString("base64") }] });
  let r = rows()[0];
  check("an email with no usable attachment files the email itself for review", res.status === 200 && rows().length === 1 && r?.needs_review === true, JSON.stringify({ status: res.status, rows: rows().length }));
  check("...named by its subject, with the sender and text in the notes", r?.vendor === "Your statement" && /From: ap@supplier.example/.test(r?.notes) && /Total £120.00/.test(r?.notes) && r?.image_data_url === null, JSON.stringify({ vendor: r?.vendor, notes: r?.notes?.slice(0, 80) }));
  check("...and the reader was never called for it", stub.calls.length === 0, String(stub.calls.length));

  // A readable invoice.
  reset();
  stub.script.push(reply([INVOICE]));
  res = await post({ token: TOKEN, from: "ap@supplier.example", subject: "Invoice 1043", attachments: [{ filename: "invoice-1043.pdf", mimeType: "application/pdf", base64: one }] });
  r = rows()[0];
  check("a readable invoice becomes one row, waiting for review", res.status === 200 && rows().length === 1 && r?.needs_review === true && r?.document_type === "invoice", JSON.stringify({ status: res.status, rows: rows().length, type: r?.document_type }));
  check("...net of VAT, with the VAT, number, dates and lines from the read", Math.abs(r?.amount - 994.9) < 0.001 && r?.vat_amount === 198.98 && r?.invoice_number === "INV-1043" && r?.date === "2026-09-14" && r?.due_date === "2026-09-28" && r?.paid === false && r?.line_items?.length === 1 && r?.line_items[0].category === null, JSON.stringify({ amount: r?.amount, vat: r?.vat_amount, n: r?.invoice_number, date: r?.date, due: r?.due_date, paid: r?.paid, lines: r?.line_items }));
  check("...the PDF in the owner's own storage folder", /^storage:/.test(r?.image_data_url ?? "") && r.image_data_url.startsWith(`storage:${UID}/`) && r.image_data_url.endsWith(".pdf") && stored().length === 1 && stored()[0].contentType === "application/pdf", JSON.stringify({ image: r?.image_data_url, stored: stored() }));
  check("...read once, as a PDF document block", stub.calls.length === 1 && stub.calls[0].tool === "record_documents" && stub.calls[0].documents === 1, JSON.stringify(stub.calls));

  // The reader refuses: the document must not vanish.
  reset();
  stub.script.push(overloaded, overloaded, overloaded, overloaded);
  res = await post({ token: TOKEN, from: "ap@supplier.example", subject: "Invoice 1043", attachments: [{ filename: "invoice-1043.pdf", mimeType: "application/pdf", base64: one }] });
  r = rows()[0];
  check("a document the reader refuses (529) is still filed for review", res.status === 200 && rows().length === 1 && r?.needs_review === true, JSON.stringify({ status: res.status, rows: rows().length }));
  check("...marked unread, with nothing invented for the figures", (r?.tags ?? []).includes("unread") && r?.amount === 0 && r?.vat_amount === 0 && /could not be read automatically/.test(r?.notes ?? "") && r?.vendor === "invoice-1043.pdf", JSON.stringify({ tags: r?.tags, amount: r?.amount, notes: r?.notes?.slice(0, 90), vendor: r?.vendor }));
  check("...with the document attached", r?.image_data_url?.startsWith(`storage:${UID}/`) && stored().length === 1, JSON.stringify({ image: r?.image_data_url }));

  reset();
  stub.script.push(cutOff);
  res = await post({ token: TOKEN, subject: "Long invoice", attachments: [{ filename: "long.pdf", mimeType: "application/pdf", base64: one }] });
  r = rows()[0];
  check("a read cut off by its token budget is filed unread too, saying so", rows().length === 1 && (r?.tags ?? []).includes("unread") && /could not be read automatically \(/.test(r?.notes ?? ""), JSON.stringify({ rows: rows().length, notes: r?.notes?.slice(0, 120) }));

  // One refused must not take the others with it.
  reset();
  stub.script.push(reply([INVOICE]), overloaded, overloaded, overloaded, overloaded);
  res = await post({ token: TOKEN, subject: "Two files", attachments: [{ filename: "invoice-1043.pdf", mimeType: "application/pdf", base64: one }, { filename: "statement.pdf", mimeType: "application/pdf", base64: one }] });
  const tagsOf = (row) => (row.tags ?? []).join(",");
  check("one attachment read and one refused gives two rows, one of each", res.status === 200 && rows().length === 2 && rows().filter((x) => tagsOf(x) === "via-email").length === 1 && rows().filter((x) => tagsOf(x) === "via-email,unread").length === 1, JSON.stringify(rows().map((x) => ({ vendor: x.vendor, tags: x.tags }))));

  // The database refuses the row: filed unread rather than lost.
  reset();
  stub.script.push(reply([INVOICE]));
  db.fail = { "POST receipts": 1 };
  res = await post({ token: TOKEN, subject: "Invoice 1043", attachments: [{ filename: "invoice-1043.pdf", mimeType: "application/pdf", base64: one }] });
  r = rows()[0];
  check("a row the database refuses is filed unread with the reason, not dropped", res.status === 200 && rows().length === 1 && (r?.tags ?? []).includes("unread") && /could not be saved/.test(r?.notes ?? ""), JSON.stringify({ status: res.status, rows: rows().length, notes: r?.notes?.slice(0, 100) }));

  // Storage down: the document stays inline.
  reset();
  stub.script.push(reply([INVOICE]));
  db.storageFails = true;
  res = await post({ token: TOKEN, subject: "Invoice 1043", attachments: [{ filename: "invoice-1043.pdf", mimeType: "application/pdf", base64: one }] });
  r = rows()[0];
  check("with storage down the document is kept inline rather than lost", rows().length === 1 && r?.image_data_url?.startsWith("data:application/pdf;base64,") && r?.document_type === "invoice", JSON.stringify({ image: r?.image_data_url?.slice(0, 40) }));

  // Two documents in one PDF.
  reset();
  stub.script.push(reply([INVOICE, RECEIPT]));
  res = await post({ token: TOKEN, subject: "Two in one", attachments: [{ filename: "bundle.pdf", mimeType: "application/pdf", base64: two }] });
  check("two documents in one PDF give two rows, each saying which it is", rows().length === 2 && rows().every((x, i) => new RegExp(`Document ${i + 1} of 2 in bundle.pdf`).test(x.notes ?? "")) && rows()[0].document_type === "invoice" && rows()[1].document_type === "receipt", JSON.stringify(rows().map((x) => ({ type: x.document_type, notes: x.notes?.slice(0, 40) }))));
  check("...each with its own pages cut out and stored", stored().length === 2 && stored().every((s) => s.bytes > 0) && rows().every((x) => x.image_data_url?.startsWith(`storage:${UID}/`)), JSON.stringify(stored()));

  // Five attachments at most, and only the types the reader takes.
  reset();
  for (let i = 0; i < 5; i++) stub.script.push(reply([{ ...INVOICE, invoiceNumber: `INV-${i}` }]));
  const six = [...Array(6)].map((_, i) => ({ filename: `inv-${i}.pdf`, mimeType: "application/pdf", base64: one }));
  res = await post({ token: TOKEN, subject: "Bulk", attachments: [{ filename: "notes.csv", mimeType: "text/csv", base64: "YSxi" }, ...six] });
  check("a spreadsheet is skipped and only the first five documents are read", stub.calls.length === 5 && rows().length === 5, JSON.stringify({ calls: stub.calls.length, rows: rows().length }));

  // A PDF a gateway labelled application/octet-stream is still a PDF.
  reset();
  stub.script.push(reply([INVOICE]));
  res = await post({ token: TOKEN, subject: "Invoice 1043", attachments: [{ filename: "invoice-1043.pdf", mimeType: "application/octet-stream", base64: one }] });
  r = rows()[0];
  check("an octet-stream PDF is read as a PDF, not filed as 'no usable attachment'", res.status === 200 && stub.calls.length === 1 && r?.document_type === "invoice" && r?.image_data_url?.endsWith(".pdf"), JSON.stringify({ calls: stub.calls.length, type: r?.document_type, image: r?.image_data_url }));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  app.kill("SIGTERM");
  await new Promise((r) => app.once("exit", r));
  mock.close();
  stubServer.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
