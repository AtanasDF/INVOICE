// A half-typed receipt or invoice is kept on the device as it is typed.
//
// The leave guard ("Leave this page?") does nothing on iPhone Safari, which
// ignores beforeunload -- and an iPhone is what Atanas uses. A link tapped
// with no signal became a full page load and the form was gone. The Free page
// never lost anything because it keeps free-invoice-draft as it goes; this
// pins the same for /receipts/new and /invoices/new.
//
// What matters, in order: a photograph is never stored (localStorage is about
// five megabytes for everything), a different account never sees the draft,
// an untouched form never deletes the draft it is offering back, and saving
// for real clears it.
import fs from "node:fs";
import path from "node:path";
import { REPO } from "./repo.mjs";
import {
  DRAFT_MAX_AGE_DAYS,
  INVOICE_DRAFT_KEY,
  RECEIPT_DRAFT_KEY,
  autosaveStep,
  clearFormDraft,
  decodeDraft,
  draftWhen,
  encodeDraft,
  hasWork,
  invoiceDraftFields,
  readFormDraft,
  receiptDraftFields,
  restoreContact,
  writeFormDraft,
} from "./gen/lib/formDraft.js";
import { PERSONAL_LOCAL_KEYS, accountBoot, keysToClear } from "./gen/lib/accountSwitch.js";

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const NOW = new Date("2026-10-20T12:00:00Z");
const PHOTO = "data:image/jpeg;base64," + "A".repeat(200_000);

const receipt = {
  clientId: "s1", clientName: "Travis Perkins", supplierText: "", date: "2026-10-19", vendor: "Travis Perkins",
  category: "Materials", totalAmount: "120.00", vatAmount: "20.00", currency: "GBP", fxRateInput: "", notes: "screws",
  lineItems: [{ description: "Screws", quantity: 2, unitPrice: 50, category: null }], warrantyMonths: "", tagsInput: "job-12", hadPhoto: true,
};
const invoice = {
  clientId: "c1", clientName: "Smith Ltd", customerText: "", date: "2026-10-20", dueDate: "2026-11-19", dueDateManual: false,
  paymentTerms: "30 days", termsLength: 30, items: [{ description: "Plastering", quantity: 3, unitPrice: 250, vatRate: "standard", kind: "labour" }],
  cisRate: 20, notes: "", tagsInput: "", imported: false,
};

// --- photographs never reach storage ---
const withPhoto = encodeDraft("receipt", { ...receipt, imageDataUrl: PHOTO }, NOW);
check("a photograph handed in with the form is not stored", !withPhoto.includes("data:image") && withPhoto.length < 2000,
  `stored ${withPhoto.length} characters`);
check("...but the draft remembers there was one, so it can ask again", JSON.parse(withPhoto).fields.hadPhoto === true);
const sneaky = encodeDraft("receipt", { ...receipt, notes: "fine", lineItems: [{ ...receipt.lineItems[0], image: PHOTO }] }, NOW);
check("nor one tucked inside a line", !sneaky.includes("data:image"));

// --- round trips ---
const r = decodeDraft("receipt", encodeDraft("receipt", receipt, NOW), NOW);
check("a receipt comes back as it was typed", r && JSON.stringify(r.fields) === JSON.stringify(receipt), JSON.stringify(r?.fields));
const i = decodeDraft("invoice", encodeDraft("invoice", invoice, NOW), NOW);
check("an invoice comes back as it was typed", i && JSON.stringify(i.fields) === JSON.stringify(invoice), JSON.stringify(i?.fields));
check("...with when it was saved", i?.savedAt === NOW.toISOString());

// --- what is treated as no draft ---
check("nothing stored is no draft", decodeDraft("receipt", null, NOW) === null);
check("garbage is no draft, not a crash", decodeDraft("receipt", "{not json", NOW) === null);
check("another version is no draft", decodeDraft("receipt", JSON.stringify({ version: 2, savedAt: NOW.toISOString(), fields: receipt }), NOW) === null);
const aged = (days) => new Date(NOW.getTime() + days * 86_400_000);
const stored = encodeDraft("invoice", invoice, NOW);
check(`a draft ${DRAFT_MAX_AGE_DAYS - 1} days old is still offered`, decodeDraft("invoice", stored, aged(DRAFT_MAX_AGE_DAYS - 1)) !== null);
check(`one over ${DRAFT_MAX_AGE_DAYS} days old is not`, decodeDraft("invoice", stored, aged(DRAFT_MAX_AGE_DAYS + 1)) === null);
check("one dated in the future is not", decodeDraft("invoice", stored, aged(-1)) === null);
check("an empty form kept by mistake is not offered", decodeDraft("receipt", encodeDraft("receipt", { ...receipt, vendor: "", totalAmount: "", vatAmount: "", notes: "", lineItems: [], tagsInput: "" }, NOW), NOW) === null);
check("a receipt draft is not read as an invoice", decodeDraft("invoice", encodeDraft("receipt", { vendor: "x" }, NOW), NOW) === null);

// --- repaired, not trusted ---
const bad = invoiceDraftFields({ items: [{ description: 5, quantity: "x", unitPrice: null, vatRate: "lots", kind: "plant" }, "junk"], cisRate: 25, date: "tomorrow", termsLength: "30" });
check("a broken line is repaired rather than costing the draft",
  bad.items.length === 1 && bad.items[0].description === "" && bad.items[0].quantity === 1 && bad.items[0].unitPrice === 0 && bad.items[0].vatRate === "standard" && !("kind" in bad.items[0]),
  JSON.stringify(bad.items));
check("a CIS rate that isn't 20 or 30 is dropped", bad.cisRate === null);
check("a date that isn't a date is left blank for today", bad.date === "");
check("a terms length that isn't a number is dropped", bad.termsLength === null);
check("an invoice always has at least one line", invoiceDraftFields({ items: [] }).items.length === 1);
check("a currency that isn't a code goes back to pounds", receiptDraftFields({ currency: "<script>" }).currency === "GBP");
check("a non-object is no fields at all", receiptDraftFields("x") === null && invoiceDraftFields(null) === null);

// --- what counts as work ---
const blankR = receiptDraftFields({});
const blankI = invoiceDraftFields({});
check("an empty receipt is not work", !hasWork("receipt", blankR));
check("a supplier picked alone is not work", !hasWork("receipt", { ...blankR, clientId: "s1", clientName: "X" }));
check("a date or category changed alone is not work", !hasWork("receipt", { ...blankR, date: "2026-01-01", category: "Fuel" }));
check("a total typed is work", hasWork("receipt", { ...blankR, totalAmount: "9.99" }));
check("an empty invoice is not work", !hasWork("invoice", blankI));
check("a customer arriving from the dashboard is not work",
  !hasWork("invoice", { ...blankI, clientId: "c1" }),
  "the dashboard link would overwrite a real draft before a key was pressed");
check("a price typed on a line is work", hasWork("invoice", { ...blankI, items: [{ ...blankI.items[0], unitPrice: 40 }] }));
check("a customer typed but not picked is work", hasWork("invoice", { ...blankI, customerText: "Mrs Jones" }));

// --- the autosave's decision ---
const step = (o) => autosaveStep({ work: false, changed: false, offerPending: false, paused: false, ...o });
check("an untouched form never removes the draft it is offering back", step({ offerPending: true }) === "hold");
check("...even when something loaded into it after it opened", step({ offerPending: true, changed: true }) === "hold",
  "the usual category arrives after the form opens");
check("typing writes", step({ work: true, changed: true }) === "write");
check("typing over the offer writes, so the newest work is kept", step({ work: true, changed: true, offerPending: true }) === "write");
check("an imported Free-page invoice is not copied until it is changed", step({ work: true }) === "hold");
check("an emptied form clears its draft", step({ changed: true }) === "clear");
check("nothing is written while saving", step({ work: true, changed: true, paused: true }) === "hold");

// --- contacts ---
check("a live supplier comes back picked", JSON.stringify(restoreContact("s1", "TP", "", ["s1"])) === JSON.stringify({ clientId: "s1", text: "" }));
check("one archived meanwhile comes back as typed text", JSON.stringify(restoreContact("s1", "TP", "", ["s2"])) === JSON.stringify({ clientId: "", text: "TP" }));
check("before the list loads, the id is trusted", restoreContact("s1", "TP", "", null).clientId === "s1");
check("typed text is kept when nothing was picked", restoreContact("", "", "Mrs Jones", ["s1"]).text === "Mrs Jones");

// --- when, in London ---
check("this morning reads as today", draftWhen("2026-10-20T08:05:00Z", "2026-10-20") === "today at 09:05", draftWhen("2026-10-20T08:05:00Z", "2026-10-20"));
check("half past midnight in July is today in London, not yesterday in UTC",
  draftWhen("2026-07-01T23:30:00Z", "2026-07-02") === "today at 00:30", draftWhen("2026-07-01T23:30:00Z", "2026-07-02"));
check("yesterday reads as yesterday", draftWhen("2026-10-19T17:00:00Z", "2026-10-20").startsWith("yesterday at"));
check("older reads as a date", draftWhen("2026-10-03T12:00:00Z", "2026-10-20") === "on 3 October", draftWhen("2026-10-03T12:00:00Z", "2026-10-20"));

// --- storage, with a stand-in that can fail ---
const box = new Map();
let broken = false;
globalThis.localStorage = {
  getItem: (k) => { if (broken) throw new Error("blocked"); return box.has(k) ? box.get(k) : null; },
  setItem: (k, v) => { if (broken) throw new Error("QuotaExceededError"); box.set(k, String(v)); },
  removeItem: (k) => { if (broken) throw new Error("blocked"); box.delete(k); },
};
writeFormDraft("receipt", receipt);
check("written under its own key", box.has(RECEIPT_DRAFT_KEY) && !box.has(INVOICE_DRAFT_KEY));
check("read back", readFormDraft("receipt")?.fields.vendor === "Travis Perkins");
clearFormDraft("receipt");
check("cleared", !box.has(RECEIPT_DRAFT_KEY) && readFormDraft("receipt") === null);
broken = true;
let threw = false;
try { writeFormDraft("invoice", invoice); readFormDraft("invoice"); clearFormDraft("invoice"); } catch { threw = true; }
check("a full or blocked store never stops somebody typing", !threw);
check("...and reads as no draft", readFormDraft("invoice") === null);
broken = false;

// --- a different account never sees it ---
for (const k of [RECEIPT_DRAFT_KEY, INVOICE_DRAFT_KEY]) {
  check(`"${k}" is classified personal`, PERSONAL_LOCAL_KEYS.includes(k), "test-account-switch's drift check cannot see it: the key is reached through a table");
  check(`...so a different account signing in clears it`, keysToClear("a", "b").local.includes(k));
  check(`...before the first paint`, accountBoot("sb-x").includes(k));
  check(`...and the same account signing back in keeps it`, !keysToClear("a", "a").local.includes(k));
}

// --- wired into both forms ---
for (const [page, kind, done] of [["receipts/new", "receipt", 'router.push("/receipts")'], ["invoices/new", "invoice", "router.push(`/invoices/${inv.id}`)"]]) {
  const src = fs.readFileSync(path.join(REPO, `web/src/app/${page}/page.tsx`), "utf8");
  const hook = src.match(/useFormDraft\(\s*"(\w+)",\s*(\{[^}]*\})/);
  check(`/${page} keeps its draft as it is typed`, hook?.[1] === kind);
  check(`/${page} hands the hook no photograph`, hook && !/(^|[{,]\s*)imageDataUrl\s*[,}]|:\s*imageDataUrl\b/.test(hook[2]), hook?.[2]);
  check(`/${page} pauses the autosave while saving`, /useFormDraft\([\s\S]{0,600}?\},\s*saving\s*\)/.test(src));
  const finish = src.indexOf("kept.finish()");
  check(`/${page} clears the draft once saved, before leaving`, finish > 0 && finish < src.indexOf(done), "a draft left behind is offered again next time, as if never saved");
  check(`/${page} offers a kept draft back`, /<DraftOffer[\s\S]{0,200}onRestore=\{restoreDraft\}/.test(src));
}

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
