// The customer's /i/, /q/ and /r/ pages, when the database answers with an
// error rather than a row (notes/audit-components.md, worst finding 6).
//
// These loaders read with the service role on the server, so the browser
// suites' mocked PostgREST never sees them; a stand-in client is handed in
// instead. The bug was that every `error` was thrown away: a failed
// credit-note or payment read became "none", and the customer was shown the
// whole invoice as still owed. A read that fails must now throw, so the page
// says it couldn't load -- while a link that simply doesn't exist is still
// null, which is the "this link isn't working" page.
const { loadPublicInvoice } = await import("./gen/lib/publicInvoice.js");
const { loadPublicQuote } = await import("./gen/lib/publicQuote.js");
const { loadPublicQuoteRequest } = await import("./gen/lib/publicQuoteRequest.js");
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const TOKEN = "t".repeat(43);
const fail = { data: null, error: { message: "connection reset", code: "" } };
// One answer per table; a function picks by the columns asked for.
function client(answers) {
  return {
    from(table) {
      let cols = "";
      const answer = () => {
        const a = answers[table];
        const r = typeof a === "function" ? a(cols) : a;
        return Promise.resolve(r ?? { data: null, error: null });
      };
      const q = {
        select(c) { cols = c; return q; },
        eq() { return q; },
        order() { return q; },
        maybeSingle: answer,
        then: (res, rej) => answer().then(res, rej),
      };
      return q;
    },
    storage: { from: () => ({ download: async () => ({ data: null, error: null }) }) },
  };
}
const ok = (data) => ({ data, error: null });
const outcome = (p) => p.then((v) => ({ value: v }), (e) => ({ threw: e }));

const INVOICE = {
  invoice_links: ok({ invoice_id: "i1", user_id: "u1" }),
  invoices: ok({ id: "i1", client_id: "c1", date: "2026-10-01", number: "INV-7", items: [{ description: "Work", quantity: 1, unitPrice: 1000, vatRate: "standard" }], notes: "", due_date: "2026-10-31", payment_terms: "", status: "partial", vat_registered: true, cis_rate: null }),
  clients: ok({ name: "Acme Ltd", email: "", address: "", vat_number: "", is_company: true }),
  business_profile: ok({ business_name: "Harness Ltd", bank_details: "20-00-00 12345678", vat_registered: true }),
  credit_notes: ok([{ date: "2026-10-02", amount: 200, reason: "" }]),
  invoice_payments: ok([{ date: "2026-10-03", amount: 500 }]),
};

let r = await outcome(loadPublicInvoice(TOKEN, client(INVOICE)));
check("an invoice that reads cleanly comes back with its credit and payment", r.value?.creditNotes.length === 1 && r.value?.payments.length === 1 && r.value?.profile.bankDetails === "20-00-00 12345678", JSON.stringify(r));
for (const table of ["credit_notes", "invoice_payments", "business_profile", "clients", "invoices", "invoice_links"]) {
  r = await outcome(loadPublicInvoice(TOKEN, client({ ...INVOICE, [table]: fail })));
  check(`invoice: a failed ${table} read throws instead of showing a page`, !!r.threw, JSON.stringify(r.value ?? null).slice(0, 160));
}
r = await outcome(loadPublicInvoice(TOKEN, client({ ...INVOICE, invoice_links: ok(null) })));
check("invoice: a link that doesn't exist is still null, the not-found page", r.value === null && !r.threw);
r = await outcome(loadPublicInvoice(TOKEN, client({ ...INVOICE, invoices: ok({ ...INVOICE.invoices.data, status: "draft" }) })));
check("invoice: a draft is still null", r.value === null && !r.threw);

const QUOTE = {
  quote_links: ok({ quote_id: "q1", user_id: "u1", response: null, responded_at: null, responder_name: null }),
  quotes: ok({ client_id: "c1", number: "Q-3", date: "2026-10-01", valid_until: null, items: [], notes: "", status: "sent", deposit_percent: null, deposit_amount: null, vat_registered: null }),
  clients: ok({ name: "Acme Ltd", email: "", address: "", vat_number: "", is_company: true, contact_person: "" }),
  business_profile: ok({ business_name: "Harness Ltd", vat_registered: true }),
};
r = await outcome(loadPublicQuote(TOKEN, client(QUOTE)));
check("a quote with no VAT snapshot is priced by the account's setting", r.value?.profile.vatRegistered === true, JSON.stringify(r).slice(0, 200));
r = await outcome(loadPublicQuote(TOKEN, client({ ...QUOTE, business_profile: fail })));
check("quote: a failed profile read throws, rather than pricing it ex VAT", !!r.threw, JSON.stringify(r.value?.profile ?? null));
for (const table of ["clients", "quote_links"]) {
  r = await outcome(loadPublicQuote(TOKEN, client({ ...QUOTE, [table]: fail })));
  check(`quote: a failed ${table} read throws`, !!r.threw);
}
// A database without migration-033: the first select names a column that
// isn't there and errors; the old column list must still find the quote.
r = await outcome(loadPublicQuote(TOKEN, client({ ...QUOTE, quotes: (cols) => (/vat_registered/.test(cols) ? fail : ok({ ...QUOTE.quotes.data, vat_registered: undefined })) })));
check("quote: without the snapshot column it falls back and still loads", r.value?.quote.number === "Q-3", JSON.stringify(r).slice(0, 200));
r = await outcome(loadPublicQuote(TOKEN, client({ ...QUOTE, quotes: fail })));
check("quote: both quote reads failing throws", !!r.threw);
r = await outcome(loadPublicQuote(TOKEN, client({ ...QUOTE, quotes: ok(null) })));
check("quote: a quote that isn't there is null", r.value === null && !r.threw);

const REQUEST = {
  quote_request_suppliers: ok({ request_id: "r1", supplier_id: "s1", user_id: "u1", status: "waiting", responded_at: null, source: null, responder_name: null, prices: null, delivery: null, vat_included: false, valid_until: null, note: null }),
  quote_requests: ok({ title: "Kitchen", items: [], notes: "", needed_by: null, site_address: "", status: "open" }),
  clients: ok({ name: "Jewson", contact_person: "" }),
  business_profile: ok({ business_name: "Harness Ltd" }),
};
r = await outcome(loadPublicQuoteRequest(TOKEN, client(REQUEST)));
check("a supplier's request reads cleanly", r.value?.title === "Kitchen" && r.value?.from === "Harness Ltd", JSON.stringify(r).slice(0, 200));
for (const table of ["quote_request_suppliers", "quote_requests", "clients", "business_profile"]) {
  r = await outcome(loadPublicQuoteRequest(TOKEN, client({ ...REQUEST, [table]: fail })));
  check(`request: a failed ${table} read throws`, !!r.threw);
}

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
