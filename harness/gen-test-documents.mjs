// A pile of fake documents to print, crumple and scan (Atanas, 2026-09-23).
// Every sheet says FAKE on its face: these get photographed into an accounting
// app, and a test document that could pass for a real one has no place near it.
//
// The first version was fairly criticised — a hundred documents that were all
// the same document underneath: same header, same table, same totals block.
// Real paper differs in *layout* far more than in wording, so this version is
// built the other way round. A library of visually unrelated designs comes
// first — coloured bands, dot matrix on tractor feed, carbon copy, ledger
// paper, lined and squared pads, card terminal slips, continental forms,
// landscape, photocopies, faxes — and the content is poured into them second.
//
// Printed at the size the real thing is: a till receipt is 80mm wide and that
// narrowness is half of what makes it hard. Small ones are laid several to a
// page with dashed lines to cut along; full-page documents get a page each.
// Each carries its id in small print at the foot so a cut-out pile can still be
// matched to expected.json.
//
//   node gen-test-documents.mjs   -> test-documents/{documents.pdf,expected.json,index.md}
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const OUT = new URL("./test-documents/", import.meta.url).pathname;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const m2 = (n) => n.toFixed(2);
const pounds = (n, c = "&pound;") => `${c}${m2(n)}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const uk = (d) => `${String(d[2]).padStart(2, "0")}/${String(d[1]).padStart(2, "0")}/${d[0]}`;
const dots = (d) => `${String(d[2]).padStart(2, "0")}.${String(d[1]).padStart(2, "0")}.${d[0]}`;
const longDate = (d) => `${d[2]} ${MONTHS[d[1] - 1]} ${d[0]}`;
const shortDate = (d) => `${d[2]} ${MONTHS[d[1] - 1].slice(0, 3)} ${String(d[0]).slice(2)}`;
const iso = (d) => `${d[0]}-${String(d[1]).padStart(2, "0")}-${String(d[2]).padStart(2, "0")}`;

// Deterministic, so the same pile prints the same way every run and the answer
// key never drifts from the paper.
const seeded = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507)) >>> 0) / 4294967296; };

const barcode = (id) => {
  const r = seeded(id);
  const bars = Array.from({ length: 48 }, () => `${r() > 0.5 ? "#111" : "#fff"} ${(r() * 1.6 + 0.4).toFixed(2)}mm`);
  return `<div class="barcode" style="background:repeating-linear-gradient(90deg,${bars.join(",")})"></div>`;
};
const qr = (id) => {
  const r = seeded(id + "qr");
  return `<div class="qr">${Array.from({ length: 144 }, () => `<i class="${r() > 0.5 ? "on" : ""}"></i>`).join("")}</div>`;
};

const docs = [];
const add = (spec) => { docs.push({ id: `D-${String(docs.length + 1).padStart(3, "0")}`, ...spec }); };

// ---------------------------------------------------------------- designs
// Each takes the same content and makes something that does not look like the
// others at arm's length. That is the whole point of this file.
const STYLES = {};

// A full-width coloured band, white type, no rules in the table.
STYLES.band = (d) => `
  <div class="doc sans">
    <div class="band" style="background:${d.colour}">
      <div class="bandname">${d.vendor}</div>
      <div class="bandright"><div class="bandtype">${d.title}</div><div>${d.no}</div></div>
    </div>
    <div class="pad">
      <div class="split"><div class="s">${d.addr}<br>${d.taxLine}</div>
      <div class="r s">Date ${uk(d.date)}${d.due ? `<br>Due ${uk(d.due)}` : ""}</div></div>
      <div class="billto s">${d.to}</div>
      <table class="airy">${d.rows}</table>
      <div class="totbox" style="border-color:${d.colour}">${d.totals}</div>
      <div class="s foot">${d.foot}</div>
    </div>
  </div>`;

// A square logo mark on the left, serif throughout, ruled table.
STYLES.markLeft = (d) => `
  <div class="doc serif">
    <div class="split top">
      <div class="withmark"><div class="mark" style="background:${d.colour}">${d.initials}</div>
        <div><div class="name">${d.vendor}</div><div class="s">${d.addr}</div><div class="s">${d.taxLine}</div></div></div>
      <div class="r"><div class="doctype">${d.title}</div><div class="s">${d.no}</div><div class="s">${longDate(d.date)}</div></div>
    </div>
    <hr>
    <div class="billto s">${d.to}</div>
    <table class="ruled">${d.rows}</table>
    <div class="totright">${d.totals}</div>
    <div class="s foot">${d.foot}</div>
  </div>`;

// A circle mark on the right, condensed caps, hairline rules.
STYLES.markRight = (d) => `
  <div class="doc cond">
    <div class="split top">
      <div><div class="doctype caps">${d.title}</div><div class="s">${d.no} &middot; ${shortDate(d.date)}</div></div>
      <div class="withmark r"><div><div class="name caps">${d.vendor}</div><div class="s">${d.addr}</div></div>
        <div class="circle" style="border-color:${d.colour};color:${d.colour}">${d.initials}</div></div>
    </div>
    <div class="s">${d.taxLine}</div>
    <div class="hair"></div>
    <div class="billto s">${d.to}</div>
    <table class="hairline">${d.rows}</table>
    <div class="totright">${d.totals}</div>
    <div class="s foot">${d.foot}</div>
  </div>`;

// Nothing but type and space. No rules, no boxes, no colour.
STYLES.minimal = (d) => `
  <div class="doc sans thin">
    <div class="name light">${d.vendor}</div>
    <div class="s spaced">${d.addr} &middot; ${d.taxLine}</div>
    <div class="gap"></div>
    <div class="split"><div class="caps s">${d.title} ${d.no}</div><div class="s">${uk(d.date)}</div></div>
    <div class="gap"></div>
    <div class="s">${d.to}</div>
    <div class="gap"></div>
    <table class="bare">${d.rows}</table>
    <div class="gap"></div>
    <div class="totright bare">${d.totals}</div>
    <div class="gap"></div>
    <div class="s">${d.foot}</div>
  </div>`;

// Everything inside heavy boxes, the way a form is printed.
STYLES.boxed = (d) => `
  <div class="doc sans framed">
    <div class="cells">
      <div class="cell grow"><div class="lbl">Supplier</div><b>${d.vendor}</b><div class="s">${d.addr}</div><div class="s">${d.taxLine}</div></div>
      <div class="cell"><div class="lbl">${d.title}</div><b>${d.no}</b><div class="s">Date ${uk(d.date)}</div>${d.due ? `<div class="s">Due ${uk(d.due)}</div>` : ""}</div>
    </div>
    <div class="cells"><div class="cell grow"><div class="lbl">Customer</div><span class="s">${d.to}</span></div></div>
    <table class="gridded">${d.rows}</table>
    <div class="cells last"><div class="cell grow s">${d.foot}</div><div class="cell tot">${d.totals}</div></div>
  </div>`;

// Striped rows and a filled totals block: a web-generated bill.
STYLES.zebra = (d) => `
  <div class="doc sans">
    <div class="split top">
      <div><div class="name">${d.vendor}</div><div class="s">${d.addr}</div><div class="s">${d.taxLine}</div></div>
      <div class="r"><div class="pill" style="background:${d.colour}">${d.title}</div><div class="s">${d.no}</div><div class="s">${uk(d.date)}</div></div>
    </div>
    <div class="billto s">${d.to}</div>
    <table class="striped">${d.rows}</table>
    <div class="totfill" style="background:${d.tint}">${d.totals}</div>
    <div class="s foot">${d.foot}</div>
  </div>`;

// Continental: dense, small, a field for everything, IBAN and BIC.
STYLES.continental = (d) => `
  <div class="doc sans dense">
    <div class="micro">${d.vendor} &middot; ${d.addr}</div>
    <div class="hair"></div>
    <div class="split"><div class="s">${d.to}</div>
      <div class="kv">
        <div><span>${d.labels.no}</span><b>${d.no}</b></div>
        <div><span>${d.labels.date}</span><b>${dots(d.date)}</b></div>
        <div><span>${d.labels.tax}</span><b>${d.taxNo}</b></div>
        <div><span>${d.labels.cust}</span><b>${d.account ?? "&mdash;"}</b></div>
      </div></div>
    <div class="doctype">${d.title}</div>
    <table class="tight">${d.rows}</table>
    <div class="totright">${d.totals}</div>
    <div class="hair"></div>
    <div class="micro">IBAN ${d.iban} &middot; BIC ${d.bic} &middot; ${d.foot}</div>
  </div>`;

// Dot matrix on tractor-feed paper, sprocket holes down both sides.
STYLES.matrix = (d) => `
  <div class="doc matrix">
    <div class="sprockets left"></div><div class="sprockets right"></div>
    <div class="matrixbody">
      <pre>${d.vendor.toUpperCase()}
${d.addr.toUpperCase()}
${d.taxLine.toUpperCase()}
${"=".repeat(46)}
${d.title.toUpperCase().padEnd(28)}${d.no}
DATE: ${uk(d.date)}${d.due ? `   DUE: ${uk(d.due)}` : ""}
${"=".repeat(46)}
${d.pre}
${"=".repeat(46)}
${d.preTotals}
${"=".repeat(46)}
${d.foot.toUpperCase()}</pre>
    </div>
  </div>`;

// Carbon copy: yellow paper, blue ink, CUSTOMER COPY across the head.
STYLES.carbon = (d) => `
  <div class="doc carbonpaper">
    <div class="carbonhead">
      <div><div class="name">${d.vendor}</div><div class="s">${d.addr}</div></div>
      <div class="r"><div class="s caps">Customer copy</div><div class="doctype">${d.no}</div><div class="s">${uk(d.date)}</div></div>
    </div>
    <div class="s">${d.to}</div>
    <table class="ruled">${d.rows}</table>
    <div class="totright">${d.totals}</div>
    <div class="s foot">${d.foot}</div>
    <div class="sign">Received by: ______________________</div>
  </div>`;

// Handwritten on a lined pad.
STYLES.lined = (d) => `
  <div class="doc pad lines">
    <div class="hw">
      <div class="hwname">${d.vendor}</div>
      <div class="s">${d.addr}</div>
      <div class="s">${d.phone ?? ""}</div>
      <div class="hwgap"></div>
      <div>${d.title.toLowerCase()} no. ${d.no}</div>
      <div>Date: ${uk(d.date)}</div>
      <div>To: ${d.toPlain}</div>
      <div class="hwgap"></div>
      ${d.hwRows}
      <div class="hwgap"></div>
      <div class="row big">${d.hwTotal}</div>
      <div class="s">${d.foot}</div>
    </div>
  </div>`;

// Handwritten on squared paper.
STYLES.grid = (d) => `
  <div class="doc pad squares">
    <div class="hw">
      <div class="hwname">${d.vendor}</div>
      <div>${d.phone ?? ""}</div>
      <div class="hwgap"></div>
      <div>${uk(d.date)} &mdash; no ${d.no}</div>
      ${d.hwRows}
      <div class="row big">${d.hwTotal}</div>
      <div class="s">${d.foot}</div>
    </div>
  </div>`;

// Green-bar accounting paper.
STYLES.ledger = (d) => `
  <div class="doc ledgerpaper mono">
    <div class="split"><b>${d.vendor}</b><span>${d.title} ${d.no}</span></div>
    <div class="s">${d.addr} &middot; ${d.taxLine} &middot; ${uk(d.date)}</div>
    <table class="ledgertable">${d.rows}</table>
    <div class="totright">${d.totals}</div>
    <div class="s">${d.foot}</div>
  </div>`;

// Till roll, with a barcode or a QR block at the foot.
STYLES.till = (d) => `
  <div class="till ${d.ink ?? ""}">
    <div class="c b">${d.vendor.toUpperCase()}</div>
    <div class="c s">${d.addr}</div>
    <div class="c s">${d.taxLine}</div>
    <div class="rule"></div>
    ${d.tillRows}
    <div class="rule"></div>
    ${d.tillTotals}
    <div class="rule"></div>
    <div class="c s">${d.paid ?? "CARD **** 4417"}</div>
    <div class="c s">${uk(d.date)} ${d.time ?? "14:32"}</div>
    ${d.code === "qr" ? qr(d.no) : barcode(d.no)}
    <div class="c s">${d.foot}</div>
  </div>`;

// A card terminal slip: tiny, all caps, a signature line.
STYLES.slip = (d) => `
  <div class="till slipbox">
    <div class="c b">${d.vendor.toUpperCase()}</div>
    <div class="c s">${d.addr}</div>
    <div class="rule"></div>
    <div class="c s">MERCHANT ${d.no}</div>
    <div class="c s">VISA DEBIT **** 4417</div>
    <div class="c s">AID A0000000031010</div>
    <div class="rule"></div>
    <div class="c b" style="font-size:13pt">${d.grossStr}</div>
    <div class="c s">APPROVED &middot; AUTH 04417B</div>
    <div class="rule"></div>
    <div class="c s">${uk(d.date)} ${d.time ?? "11:07"}</div>
    <div class="c s">PLEASE RETAIN RECEIPT</div>
    <div class="sign small">X ______________</div>
  </div>`;

// A printed email.
STYLES.email = (d) => `
  <div class="doc sans">
    <div class="mailhead">
      <div><b>From:</b> billing@${d.domain}</div>
      <div><b>To:</b> atanas@fragovservices.co.uk</div>
      <div><b>Subject:</b> ${d.subject}</div>
      <div><b>Date:</b> ${longDate(d.date)} at ${d.time ?? "09:14"}</div>
    </div>
    <div class="mailbody">
      <div class="name">${d.vendor}</div>
      <p class="s">${d.intro ?? "Thanks for your order. Here is your receipt."}</p>
      <table class="airy">${d.rows}</table>
      <div class="totright">${d.totals}</div>
      <p class="s">${d.foot}</p>
    </div>
    <div class="mailfoot micro">${d.vendor} &middot; ${d.addr} &middot; ${d.taxLine}</div>
  </div>`;

// A big diagonal stamp across an otherwise ordinary invoice.
STYLES.stamped = (d) => `
  <div class="doc sans stampwrap">
    <div class="stampmark" style="color:${d.stampColour ?? "#c33"};border-color:${d.stampColour ?? "#c33"}">${d.stamp}</div>
    <div class="split top">
      <div><div class="name">${d.vendor}</div><div class="s">${d.addr}</div><div class="s">${d.taxLine}</div></div>
      <div class="r"><div class="doctype">${d.title}</div><div class="s">${d.no}</div><div class="s">${uk(d.date)}</div></div>
    </div>
    <div class="billto s">${d.to}</div>
    <table class="ruled">${d.rows}</table>
    <div class="totright">${d.totals}</div>
    <div class="s foot">${d.foot}</div>
  </div>`;

// Wide and short, the way a landscape statement prints.
STYLES.landscape = (d) => `
  <div class="doc sans">
    <div class="split top"><div><div class="name">${d.vendor}</div><div class="s">${d.addr} &middot; ${d.taxLine}</div></div>
    <div class="r"><div class="doctype">${d.title}</div><div class="s">${d.no} &middot; ${uk(d.date)}</div></div></div>
    <table class="gridded">${d.rows}</table>
    <div class="totright">${d.totals}</div>
    <div class="s foot">${d.foot}</div>
  </div>`;

// Formal letterhead, company details only in a footer rule.
STYLES.letterhead = (d) => `
  <div class="doc serif">
    <div class="c letterhead"><div class="name big">${d.vendor}</div><div class="s spaced caps">${d.tagline ?? "Established 1994"}</div></div>
    <div class="rulewide"></div>
    <div class="split"><div class="s">${d.to}</div><div class="r s">${longDate(d.date)}<br>${d.title} ${d.no}</div></div>
    <table class="ruled">${d.rows}</table>
    <div class="totright">${d.totals}</div>
    <div class="s foot">${d.foot}</div>
    <div class="rulewide"></div>
    <div class="c micro">${d.addr} &middot; ${d.taxLine} &middot; ${d.coLine ?? ""}</div>
  </div>`;

// A photocopy of a photocopy: grey, flat, slightly askew.
STYLES.photocopy = (d) => `
  <div class="doc sans copied">
    <div class="split top"><div><div class="name">${d.vendor}</div><div class="s">${d.addr}</div><div class="s">${d.taxLine}</div></div>
    <div class="r"><div class="doctype">${d.title}</div><div class="s">${d.no}</div><div class="s">${uk(d.date)}</div></div></div>
    <div class="billto s">${d.to}</div>
    <table class="ruled">${d.rows}</table>
    <div class="totright">${d.totals}</div>
    <div class="s foot">${d.foot}</div>
  </div>`;

// A fax, with the transmission line across the top.
STYLES.fax = (d) => `
  <div class="doc mono copied">
    <div class="faxline">${iso(d.date)} 09:41  FROM ${d.vendor.toUpperCase().slice(0, 18)}  01228 ${d.no.replace(/\D/g, "").slice(0, 6).padEnd(6, "0")}  P.01</div>
    <div class="split top"><div><b>${d.vendor}</b><div class="s">${d.addr}</div><div class="s">${d.taxLine}</div></div>
    <div class="r"><b>${d.title}</b><div class="s">${d.no}</div><div class="s">${uk(d.date)}</div></div></div>
    <div class="s">${d.to}</div>
    <table class="ruled">${d.rows}</table>
    <div class="totright">${d.totals}</div>
    <div class="s foot">${d.foot}</div>
  </div>`;

// Three columns of details above the table.
STYLES.twoCol = (d) => `
  <div class="doc sans">
    <div class="name big">${d.vendor}</div>
    <div class="cols">
      <div><div class="lbl">From</div><div class="s">${d.addr}<br>${d.taxLine}</div></div>
      <div><div class="lbl">To</div><div class="s">${d.to}</div></div>
      <div><div class="lbl">${d.title}</div><div class="s">${d.no}<br>${uk(d.date)}${d.due ? `<br>Due ${uk(d.due)}` : ""}</div></div>
    </div>
    <table class="striped">${d.rows}</table>
    <div class="totright">${d.totals}</div>
    <div class="s foot">${d.foot}</div>
  </div>`;

// A spreadsheet printed straight off the screen, gridlines and all.
STYLES.spreadsheet = (d) => `
  <div class="doc mono">
    <div class="s">${d.vendor} &mdash; ${d.title} ${d.no} &mdash; ${iso(d.date)}</div>
    <table class="sheetgrid">${d.rows}</table>
    <div class="totright">${d.totals}</div>
    <div class="micro">${d.addr} | ${d.taxLine} | ${d.foot}</div>
  </div>`;

// A booking confirmation: no table, just a block of facts.
STYLES.confirmation = (d) => `
  <div class="doc sans">
    <div class="band" style="background:${d.colour}"><div class="bandname">${d.vendor}</div><div class="bandright"><div class="bandtype">${d.title}</div></div></div>
    <div class="pad">
      <div class="factgrid">
        <div><span class="lbl">Reference</span><b>${d.no}</b></div>
        <div><span class="lbl">Date</span><b>${longDate(d.date)}</b></div>
        <div><span class="lbl">Paid</span><b>${d.grossStr}</b></div>
        <div><span class="lbl">Method</span><b>Card ending 4417</b></div>
      </div>
      <p class="s">${d.intro ?? ""}</p>
      <div class="totright bare">${d.totals}</div>
      <div class="s foot">${d.foot}</div>
      <div class="micro">${d.addr} &middot; ${d.taxLine}</div>
    </div>
  </div>`;

// A compact docket, almost no text at all.
STYLES.docket = (d) => `
  <div class="doc sans">
    <div class="split"><b>${d.vendor}</b><span class="s">${d.no}</span></div>
    <div class="hair"></div>
    <table class="tight">${d.rows}</table>
    <div class="hair"></div>
    <div class="totright bare">${d.totals}</div>
    <div class="micro">${d.addr}<br>${d.taxLine} &middot; ${uk(d.date)}<br>${d.foot}</div>
  </div>`;

// ------------------------------------------------------------- the maker
const initialsOf = (v) => v.replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

const build = (o) => {
  const c = o.currency ?? "&pound;";
  const lines = o.lines ?? [];
  let net = 0, vat = 0;
  for (const l of lines) {
    const amt = Math.round(l.qty * l.price * 100) / 100;
    net += amt;
    vat += Math.round(amt * (l.rate ?? o.rate ?? 20)) / 100;
  }
  net = Math.round(net * 100) / 100;
  vat = o.noVat ? 0 : Math.round(vat * 100) / 100;
  const gross = o.grossOverride ?? Math.round((net + vat) * 100) / 100;
  const sign = o.type === "credit_note" ? -1 : 1;

  const cols = o.cols ?? ["Description", "Qty", "Price", "Amount"];
  const rows = `<tr>${cols.map((h, i) => `<th class="${i ? "r" : ""}">${h}</th>`).join("")}</tr>`
    + lines.map((l) => `<tr><td>${l.d}</td><td class="r">${l.qty}</td><td class="r">${m2(l.price)}</td><td class="r">${m2(Math.round(l.qty * l.price * 100) / 100)}</td></tr>`).join("");

  const totalsRows = [
    [o.netLabel ?? "Net", pounds(net, c)],
    ...(o.noVat ? [] : [[o.vatLabel ?? `VAT ${o.rate ?? 20}%`, pounds(vat, c)]]),
    ...(o.extraTotals ?? []),
    [o.grossLabel ?? "Total", pounds(gross, c)],
  ];
  const totals = totalsRows.map(([k, v], i) => `<div class="row ${i === totalsRows.length - 1 ? "b" : ""}"><span>${k}</span><span>${v}</span></div>`).join("");

  const plain = (s) => String(s).replace(/&pound;/g, "£").replace(/&euro;/g, "€").replace(/&minus;/g, "-").replace(/&mdash;/g, "-").replace(/<[^>]+>/g, "");
  const pad = (s, w) => plain(s).padEnd(w).slice(0, w);
  const rpad = (s, w) => plain(s).padStart(w);
  const pre = lines.map((l) => `${pad(l.d, 30)}${rpad(m2(Math.round(l.qty * l.price * 100) / 100), 16)}`).join("\n");
  const preTotals = totalsRows.map(([k, v]) => `${pad(k, 30)}${rpad(v, 16)}`).join("\n");

  const tillRows = lines.map((l) => `<div class="row"><span>${l.d}</span><span>${m2(Math.round(l.qty * l.price * 100) / 100)}</span></div>`).join("");
  const tillTotals = `<div class="row big"><span>${o.totalLabel === false ? "" : "TOTAL"}</span><span>${m2(gross)}</span></div>`
    + (o.noVat ? `<div class="c s">${o.vatNote ?? "No VAT breakdown shown"}</div>` : `<div class="row s"><span>VAT ${o.rate ?? 20}%</span><span>${m2(vat)}</span></div><div class="row s"><span>NET</span><span>${m2(net)}</span></div>`);

  const hwRows = lines.map((l) => `<div class="row"><span>${l.d}</span><span>${m2(Math.round(l.qty * l.price * 100) / 100)}</span></div>`).join("");
  const hwTotal = `<span>TOTAL</span><span>&pound;${m2(gross)}</span>`;

  const d = {
    ...o,
    initials: initialsOf(o.vendor),
    colour: o.colour ?? "#1f4e79",
    tint: o.tint ?? "#eef3f8",
    title: o.title ?? "INVOICE",
    taxLine: o.taxLine ?? (o.taxNo ? `VAT Reg ${o.taxNo}` : "Not VAT registered"),
    to: o.to ?? "Fragov Services Ltd<br>Unit 3 Willowholme Industrial Estate<br>Carlisle CA2 5RT",
    toPlain: o.toPlain ?? "Fragov Services Ltd, Carlisle",
    foot: o.foot ?? "Payment by BACS. Sort 20-45-77 Account 40112288.",
    labels: o.labels ?? { no: "Invoice no.", date: "Date", tax: "VAT no.", cust: "Customer no." },
    iban: o.iban ?? "GB29 NWBK 6016 1331 9268 19",
    bic: o.bic ?? "NWBKGB2L",
    taxNo: o.taxNo ?? "GB 771 4402 55",
    domain: o.domain ?? "example.com",
    subject: o.subject ?? `Your receipt from ${o.vendor}`,
    grossStr: pounds(gross, c),
    rows, totals, pre, preTotals, tillRows, tillTotals, hwRows, hwTotal,
  };

  add({
    style: o.style,
    width: o.width,
    page: o.page ?? false,
    vendor: o.vendor,
    hard: o.hard,
    expect: {
      vendor: o.vendor,
      date: o.dateShown === null ? null : uk(o.date),
      invoiceNumber: o.no,
      net: sign * net,
      vat: o.noVat ? null : sign * vat,
      gross: sign * gross,
      dueDate: o.due ? uk(o.due) : null,
      currency: o.currencyCode ?? "GBP",
      // A till roll and a card terminal slip are proof that money has
      // already been handed over -- they carry "CARD **** 4417" or "CASH"
      // and no amount due. They are receipts, and calling them invoices
      // made this key mark the reader WRONG for reading them correctly
      // (found 2026-09-24, scoring the reader against this file). The app's
      // own model draws the same line: an invoice is a bill to pay, a
      // receipt is one already paid.
      type: o.type ?? (o.style === "till" || o.style === "slip" ? "receipt" : "invoice"),
      ...(o.note ? { note: o.note } : {}),
    },
    html: STYLES[o.style](d),
  });
};

// ----------------------------------------------------------- the content
// Spread across trades and services, not one town's builders' merchants.
const A4 = { page: true };
const A5 = { width: 132 };
const A6 = { width: 96 };
const TILL = { width: 80 };
const WIDE = { width: 110 };
const CARD = { width: 78 };

build({ ...A4, style: "band", colour: "#0b6b4f", vendor: "Greenfield Landscapes Ltd", addr: "Unit 9 Rosehill Estate, Carlisle CA1 2RW", taxNo: "GB 412 7755 19", no: "GL-2026-0412", date: [2026, 4, 12], due: [2026, 5, 12], lines: [{ d: "Turfing, rear garden 120m2", qty: 1, price: 1180 }, { d: "Topsoil, per tonne", qty: 8, price: 42 }, { d: "Waste removal", qty: 1, price: 180 }], hard: "coloured band, no rules in the table" });
build({ ...A4, style: "markLeft", colour: "#8a1b1b", vendor: "Renwick & Daughters", addr: "The Old Bakery, Wigton CA7 9AA", taxNo: "GB 220 4417 88", no: "R&D/2026/118", date: [2026, 5, 3], due: [2026, 6, 2], lines: [{ d: "Structural survey", qty: 1, price: 750 }, { d: "Report and drawings", qty: 1, price: 420 }], hard: "serif throughout, date written out in words" });
build({ ...A5, style: "markRight", colour: "#b8860b", vendor: "Solway Marine Services", addr: "Harbour Road, Silloth CA7 4JT", taxNo: "GB 118 2204 77", no: "SMS-7741", date: [2026, 5, 19], lines: [{ d: "Hull inspection", qty: 1, price: 340 }, { d: "Anode replacement", qty: 4, price: 46 }], hard: "condensed caps, hairline rules, no due date" });
build({ ...A5, style: "minimal", vendor: "Hale Studio", addr: "2 Fisher Street, Carlisle CA3 8RR", taxNo: "GB 990 1122 33", no: "HS-0221", date: [2026, 6, 1], lines: [{ d: "Brand design, phase one", qty: 1, price: 1600 }], hard: "no rules, no boxes, very light type" });
build({ ...A4, style: "boxed", vendor: "Northern Aggregates plc", addr: "Longtown Quarry, Longtown CA6 5NA", taxNo: "GB 553 2210 88", no: "NA-556120", date: [2026, 6, 9], due: [2026, 7, 9], lines: [{ d: "MOT Type 1, 20t loads", qty: 14, price: 218 }, { d: "Haulage", qty: 14, price: 96 }], hard: "form-like boxes, and a five-figure total" });
build({ ...A4, style: "zebra", colour: "#5b2d8e", tint: "#f2eefa", vendor: "Pixel & Pulse Ltd", addr: "35 Warwick Road, Carlisle CA1 1DN", taxNo: "GB 337 9911 04", no: "PP-2026-0641", date: [2026, 6, 18], due: [2026, 7, 2], lines: [{ d: "Website hosting, annual", qty: 1, price: 240 }, { d: "Email, 5 mailboxes, monthly", qty: 12, price: 12 }, { d: "SSL certificate", qty: 1, price: 60 }], hard: "striped rows, filled totals block" });
build({ ...A4, style: "continental", vendor: "Van Dijk Gereedschap BV", addr: "Havenstraat 44, 3011 Rotterdam, Nederland", taxNo: "NL 8812 4471 B01", no: "2026-004412", date: [2026, 5, 4], currency: "&euro;", currencyCode: "EUR", rate: 21, lines: [{ d: "Pneumatische moersleutel", qty: 1, price: 289 }, { d: "Verzendkosten", qty: 1, price: 42 }], labels: { no: "Factuurnr.", date: "Factuurdatum", tax: "BTW-nr.", cust: "Klantnr." }, account: "KL-4417", title: "FACTUUR", vatLabel: "BTW 21%", iban: "NL91 ABNA 0417 1643 00", bic: "ABNANL2A", hard: "Dutch, euros, 21% BTW, dotted date 04.05.2026", foot: "Betaling binnen 30 dagen" });
build({ ...A4, style: "continental", vendor: "Schmidt Werkzeuge GmbH", addr: "Industriestrasse 12, 80939 Muenchen, Deutschland", taxNo: "DE 224 118 990", no: "RE-2026-88120", date: [2026, 6, 26], currency: "&euro;", currencyCode: "EUR", rate: 19, lines: [{ d: "Rotationslaser mit Stativ", qty: 1, price: 410 }, { d: "Versand", qty: 1, price: 28 }], labels: { no: "Rechnungsnr.", date: "Rechnungsdatum", tax: "USt-IdNr.", cust: "Kundennr." }, title: "RECHNUNG", vatLabel: "MwSt 19%", iban: "DE89 3704 0044 0532 0130 00", bic: "COBADEFFXXX", hard: "German, 19% MwSt, no pound sign anywhere", foot: "Zahlbar ohne Abzug" });
build({ ...A4, style: "matrix", vendor: "Border Plant Hire", addr: "Brunthill Road, Carlisle CA3 0EH", taxNo: "GB 448 9012 33", no: "BPH006640", date: [2026, 7, 6], due: [2026, 8, 6], lines: [{ d: "MINI DIGGER 1.5T WEEKLY", qty: 2, price: 320 }, { d: "TRANSPORT", qty: 2, price: 65 }, { d: "FUEL SURCHARGE", qty: 1, price: 48.75 }], hard: "dot matrix on tractor feed, sprocket holes down both sides" });
build({ ...A5, style: "carbon", vendor: "Kirkby Fuels", addr: "Depot Road, Penrith CA11 9EH", taxNo: "GB 243 8817 02", no: "KF-44120", date: [2026, 7, 14], lines: [{ d: "Red diesel, litres", qty: 500, price: 0.94 }, { d: "Delivery", qty: 1, price: 25 }], hard: "blue ink on yellow carbon paper, CUSTOMER COPY", foot: "Rebated fuel. For off-road use only." });
build({ ...A5, style: "lined", vendor: "A. Murray Gardening", addr: "17 Scotby Road, Carlisle", phone: "07700 900412", no: "112", date: [2026, 4, 6], noVat: true, lines: [{ d: "Clearing site", qty: 1, price: 180 }, { d: "Waste removal", qty: 1, price: 65 }], hard: "handwritten on a lined pad, not VAT registered", foot: "Cash or bank transfer please" });
build({ ...A5, style: "grid", vendor: "Dave's Van Repairs", phone: "07700 900855", addr: "Botcherby, Carlisle", no: "77", date: [2026, 5, 11], noVat: true, lines: [{ d: "Brake pads + fitting", qty: 1, price: 145 }, { d: "Oil change", qty: 1, price: 55 }, { d: "MOT prep", qty: 1, price: 40 }], hard: "handwritten on squared paper", foot: "Paid cash - thanks" });
build({ ...A4, style: "ledger", vendor: "Clarke & Sons Accountants", addr: "12 Lowther Street, Carlisle CA3 8DA", taxNo: "GB 771 4402 55", no: "CS-1188", date: [2026, 5, 30], due: [2026, 6, 29], lines: [{ d: "Self Assessment return 2025/26", qty: 1, price: 350 }, { d: "Bookkeeping, quarterly", qty: 4, price: 45 }], hard: "green-bar accounting paper, monospace" });
build({ ...TILL, style: "till", vendor: "Bramley Mini Market", addr: "14 Foss Road, Carlisle", taxNo: "GB 412 7755 19", no: "BM04417", date: [2026, 4, 3], lines: [{ d: "MILK 2PT", qty: 1, price: 1.35 }, { d: "SANDWICH", qty: 1, price: 3.2 }, { d: "CRISPS", qty: 1, price: 0.95 }], hard: "ambiguous date 03/04, barcode at the foot", foot: "THANK YOU" });
build({ ...TILL, style: "till", ink: "faded", vendor: "Quick Stop", addr: "Harraby, Carlisle", taxNo: "GB 412 7755 19", no: "QS88120", date: [2026, 7, 31], lines: [{ d: "SANDWICH", qty: 1, price: 3.25 }, { d: "DRINK", qty: 1, price: 1.5 }, { d: "CRISPS", qty: 1, price: 1.0 }], hard: "faded thermal print, nearly gone", foot: "" });
build({ ...TILL, style: "till", ink: "invert", vendor: "Lune Valley Cafe", addr: "M6 Junction 36", taxNo: "GB 337 9911 04", no: "LV5512", date: [2026, 8, 15], lines: [{ d: "BREAKFAST", qty: 1, price: 8.95 }, { d: "TEA", qty: 1, price: 1.8 }], hard: "printed white on black, which defeats most thresholding", foot: "" });
build({ ...WIDE, style: "till", code: "qr", vendor: "Kingstown Superstore", addr: "Kingstown Retail Park, Carlisle", taxNo: "GB 553 2210 88", no: "KS7741204", date: [2026, 9, 2], lines: [{ d: "DIESEL 42.11L", qty: 1, price: 60.42 }, { d: "MEAL DEAL", qty: 2, price: 3.5 }, { d: "SCREENWASH", qty: 1, price: 5.49 }, { d: "GLOVES", qty: 1, price: 4.99 }], hard: "wide till roll, QR block, fuel and shopping mixed", foot: "SCAN FOR POINTS" });
build({ ...CARD, style: "slip", vendor: "The Crown Inn", addr: "Wetheral, Carlisle", no: "884120", date: [2026, 4, 25], lines: [{ d: "FOOD", qty: 1, price: 27.87 }], hard: "a card terminal slip: no itemisation, no VAT number" });
build({ ...A5, style: "email", domain: "amazonbusiness.co.uk", vendor: "Amazon Business", addr: "1 Principal Place, London EC2A 2FA", taxNo: "GB 727 2554 88", no: "AMZ-2026-771204", date: [2026, 4, 19], lines: [{ d: "Storage boxes, pack of 4", qty: 1, price: 31.96 }, { d: "Label printer", qty: 1, price: 64 }], hard: "a printed email with headers above the receipt", foot: "This is your VAT receipt." });
build({ ...A4, style: "stamped", stamp: "PAID", vendor: "Solway Tyres", addr: "Willowholme, Carlisle CA2 5RT", taxNo: "GB 448 9012 33", no: "SWT-44120", date: [2026, 5, 22], lines: [{ d: "Van tyres 215/65 R16C", qty: 4, price: 118 }, { d: "Fitting and balancing", qty: 4, price: 12 }], hard: "a PAID stamp across the page: must not then be chased for payment", foot: "Paid in full by card 22/05/2026." });
build({ ...A4, style: "stamped", stamp: "OVERDUE", stampColour: "#b00", vendor: "Eden Waste Services", addr: "Penrith CA11 9EH", taxNo: "GB 220 4417 88", no: "EWS-55021", date: [2026, 3, 5], due: [2026, 4, 5], lines: [{ d: "Waste transfer, 12 months", qty: 1, price: 180 }, { d: "Duty of care documentation", qty: 1, price: 25 }], hard: "an OVERDUE stamp, and the due date is in the past" });
build({ ...A4, style: "landscape", vendor: "Cumbria Hire Centre", addr: "Brunthill Road, Carlisle", taxNo: "GB 118 2204 77", no: "CHC-330117", date: [2026, 7, 14], due: [2026, 8, 14], lines: [{ d: "Breaker hire, days", qty: 3, price: 48 }, { d: "Points and chisels", qty: 1, price: 22 }, { d: "Delivery and collection", qty: 1, price: 40 }, { d: "Damage waiver", qty: 1, price: 18 }], hard: "full gridlines, four lines, a damage waiver" });
build({ ...A4, style: "letterhead", vendor: "Hetherington & Co", tagline: "Chartered Surveyors since 1978", addr: "4 Castle Street, Carlisle CA3 8SY", taxNo: "GB 990 1122 33", coLine: "Company No. 01884120", no: "H&C-2026-0447", date: [2026, 8, 3], due: [2026, 9, 2], lines: [{ d: "Dilapidations schedule", qty: 1, price: 1450 }, { d: "Site attendance", qty: 2, price: 275 }], hard: "formal letterhead, details only in the footer rule" });
build({ ...A4, style: "photocopy", vendor: "Fell Top Roofing", addr: "Keswick CA12 5DF", taxNo: "GB 224 1189 90", no: "FTR-2211", date: [2026, 8, 20], due: [2026, 9, 20], lines: [{ d: "Re-slate rear elevation", qty: 1, price: 3400 }, { d: "Scaffold", qty: 1, price: 880 }, { d: "Skip", qty: 2, price: 220 }], hard: "a grey photocopy, slightly askew" });
build({ ...A4, style: "fax", vendor: "Northern Steel Stockholders", addr: "Team Valley, Gateshead NE11 0QD", taxNo: "GB 336 1120 44", no: "NSS-118240", date: [2026, 9, 1], due: [2026, 10, 1], lines: [{ d: "RSJ 203x133x25, 6m", qty: 3, price: 288 }, { d: "Flat bar 50x10", qty: 12, price: 22.5 }, { d: "Cutting", qty: 1, price: 45 }], hard: "a fax, with the transmission line printed across the top" });
build({ ...A4, style: "twoCol", vendor: "Lakes Electrical Contractors", addr: "Ambleside LA22 9BU", taxNo: "GB 441 7220 11", no: "LEC-2026-0912", date: [2026, 9, 12], due: [2026, 10, 12], lines: [{ d: "Consumer unit upgrade", qty: 1, price: 680 }, { d: "EICR testing", qty: 1, price: 240 }, { d: "Certificates", qty: 1, price: 45 }], hard: "three columns of details above a striped table" });
build({ ...A4, style: "spreadsheet", vendor: "Hodgson Haulage", addr: "Kingmoor Park, Carlisle CA6 4SD", taxNo: "GB 771 4402 55", no: "HH-2026-Q3-118", date: [2026, 9, 20], due: [2026, 10, 20], cols: ["Job", "Loads", "Rate", "Amount"], lines: [{ d: "Carlisle to Leeds", qty: 6, price: 320 }, { d: "Carlisle to Glasgow", qty: 4, price: 280 }, { d: "Waiting time, hours", qty: 7, price: 35 }], hard: "printed straight off a spreadsheet, gridlines and all" });
build({ ...A5, style: "confirmation", colour: "#c2410c", vendor: "Premier Inn", addr: "Kingstown, Carlisle CA3 0AT", taxNo: "GB 556 2290 11", no: "PI-88412204", date: [2026, 6, 24], title: "BOOKING CONFIRMATION", lines: [{ d: "1 night, standard room", qty: 1, price: 68.33 }], intro: "Your stay is confirmed. This is your VAT receipt.", hard: "the facts are in a block, not a table" });
build({ ...A6, style: "docket", vendor: "City Cabs Carlisle", addr: "Rickergate, Carlisle", taxLine: "Not VAT registered", noVat: true, no: "CC-44120", date: [2026, 7, 2], lines: [{ d: "Station to Kingmoor Park", qty: 1, price: 11.5 }], hard: "an A6 docket, no VAT, almost no text at all", foot: "Thank you" });

build({ ...A4, style: "band", colour: "#1f4e79", vendor: "Solway Training Services", addr: "Rosehill, Carlisle CA1 2RS", taxNo: "GB 412 7755 19", no: "STS-2026-118", date: [2026, 9, 7], due: [2026, 10, 7], lines: [{ d: "CSCS card renewal course", qty: 2, price: 165 }, { d: "Examination fee", qty: 2, price: 36, rate: 0 }], hard: "two VAT rates: the exam fee is exempt, the course is not" });
build({ ...A5, style: "band", colour: "#374151", vendor: "Border Locksmiths", addr: "Denton Holme, Carlisle", taxNo: "GB 118 2204 77", no: "BL-7712", date: [2026, 8, 29], lines: [{ d: "Emergency callout, out of hours", qty: 1, price: 95 }, { d: "Lock replacement", qty: 2, price: 64 }] });
build({ ...A4, style: "markLeft", colour: "#0f766e", vendor: "Eden Valley Veterinary", addr: "Appleby CA16 6QR", taxNo: "GB 224 1189 90", no: "EVV-55120", date: [2026, 5, 8], lines: [{ d: "Farm visit and inspection", qty: 1, price: 180 }, { d: "Medication", qty: 3, price: 42.5 }], hard: "a trade nothing else in the pile resembles" });
build({ ...A5, style: "markRight", colour: "#7c2d12", vendor: "The Cutting Room", addr: "Lowther Arcade, Carlisle", taxNo: "GB 990 1122 33", no: "TCR-2204", date: [2026, 6, 14], lines: [{ d: "Cut and finish", qty: 1, price: 34 }, { d: "Products", qty: 1, price: 18.5 }] });
build({ ...A5, style: "minimal", vendor: "Quiet Hours Sound", addr: "Brampton CA8 1SH", taxNo: "GB 336 1120 44", no: "QH-0118", date: [2026, 7, 27], lines: [{ d: "PA hire, weekend", qty: 1, price: 420 }, { d: "Engineer", qty: 1, price: 280 }] });
build({ ...A4, style: "boxed", vendor: "HM Courts and Tribunals Service", addr: "Earl Street, Carlisle CA1 1DJ", taxLine: "Outside the scope of VAT", noVat: true, no: "FEE-2026-8841", date: [2026, 4, 30], title: "FEE NOTICE", lines: [{ d: "Money claim issue fee", qty: 1, price: 455 }], hard: "a court fee: outside the scope of VAT entirely", foot: "Court fees are not subject to VAT." });
build({ ...A5, style: "zebra", colour: "#065f46", tint: "#ecfdf5", vendor: "Carlisle Cleaning Co", addr: "Harraby, Carlisle CA1 2QS", taxNo: "GB 553 2210 88", no: "CCC-4412", date: [2026, 8, 1], due: [2026, 8, 15], lines: [{ d: "Office clean, weekly", qty: 4, price: 85 }, { d: "Consumables", qty: 1, price: 34.2 }] });
build({ ...A4, style: "continental", vendor: "Dublin Site Supplies Ltd", addr: "Ballymount, Dublin 12, Ireland", taxNo: "IE 4471220T", no: "DSS-7741", date: [2026, 8, 9], currency: "&euro;", currencyCode: "EUR", rate: 23, lines: [{ d: "Scaffold boards, 3.9m", qty: 30, price: 18.5 }, { d: "Carriage to UK", qty: 1, price: 180, rate: 0 }], iban: "IE29 AIBK 9311 5212 3456 78", bic: "AIBKIE2D", vatLabel: "VAT 23%", hard: "Irish euros at 23%, and the carriage is zero-rated as an export" });
build({ ...A4, style: "matrix", vendor: "Cumbria Farmers Co-op", addr: "Skirsgill, Penrith CA11 0DP", taxNo: "GB 441 7220 11", no: "CFC112044", date: [2026, 5, 27], due: [2026, 6, 27], lines: [{ d: "FENCING STAKES X100", qty: 1, price: 285 }, { d: "BARBED WIRE 200M", qty: 6, price: 38.5 }, { d: "STAPLES 5KG", qty: 2, price: 19.4 }], hard: "dot matrix again, different trade, with a due date" });
build({ ...A5, style: "carbon", vendor: "Tebay Services Garage", addr: "M6 Junction 38, Tebay CA10 3SB", taxNo: "GB 243 8817 02", no: "TSG-9920", date: [2026, 9, 5], lines: [{ d: "Roadside assistance", qty: 1, price: 145 }, { d: "Alternator belt", qty: 1, price: 62.5 }], hard: "carbon copy, second trade, signature line at the foot" });
build({ ...A5, style: "lined", vendor: "B. Little Groundcare", addr: "Dalston, Carlisle", phone: "07700 900233", no: "19", date: [2026, 6, 21], noVat: true, lines: [{ d: "Hedge cutting", qty: 1, price: 240 }, { d: "Green waste", qty: 1, price: 60 }], hard: "handwritten, with a note scrawled across it afterwards", foot: "PAID CASH 21/6 - thanks B" });
build({ ...A5, style: "grid", vendor: "Nixon & Son", phone: "07700 900771", addr: "Wigton CA7 9AA", no: "88", date: [2026, 9, 19], noVat: true, lines: [{ d: "Repair to flat roof", qty: 1, price: 480 }, { d: "Materials", qty: 1, price: 165.5 }], hard: "handwriting where the total reads either 645.50 or 845.50" });
build({ ...A4, style: "ledger", vendor: "Border Bookkeeping", addr: "Longtown CA6 5NA", taxNo: "GB 336 1120 44", no: "BB-2026-09", date: [2026, 9, 30], due: [2026, 10, 14], cols: ["Period", "Hours", "Rate", "Amount"], lines: [{ d: "July", qty: 6, price: 32 }, { d: "August", qty: 5.5, price: 32 }, { d: "September", qty: 7, price: 32 }], hard: "fractional hours on ledger paper" });
build({ ...TILL, style: "till", vendor: "Greggs", addr: "The Lanes, Carlisle", taxNo: "GB 337 9911 04", no: "GR112044", date: [2026, 6, 8], totalLabel: false, lines: [{ d: "SAUSAGE ROLL", qty: 1, price: 1.3 }, { d: "COFFEE", qty: 1, price: 2.1 }], hard: "the total has no label at all", foot: "" });
build({ ...TILL, style: "till", vendor: "Market Stall 14", addr: "Carlisle Market Hall", taxLine: "no VAT number shown", noVat: true, no: "MS0014", date: [2026, 2, 28], paid: "CASH", lines: [{ d: "WORK SOCKS X3", qty: 1, price: 10 }], hard: "cash, no VAT number, the last day of February", foot: "" });
build({ ...TILL, style: "till", vendor: "BP Kingstown", addr: "Carlisle CA3 0HA", taxNo: "GB 243 8817 02", no: "BP044170", date: [2026, 4, 9], time: "07:41", lines: [{ d: "DIESEL 54.22L @ 148.9", qty: 1, price: 80.73 }], hard: "litres and pence-per-litre sit where amounts normally do", foot: "" });
build({ ...WIDE, style: "till", code: "qr", vendor: "Screwfix Trade Counter", addr: "Willowholme, Carlisle", taxNo: "GB 553 2210 88", no: "SF9920117", date: [2026, 7, 23], lines: [{ d: "SITE LIGHT 110V", qty: 1, price: 78 }, { d: "EXTENSION LEAD 14M", qty: 1, price: 22.5 }, { d: "GAFFER TAPE", qty: 3, price: 4.99 }], hard: "wide roll, QR block, trade account", foot: "TRADE ACCOUNT 77412" });
build({ ...CARD, style: "slip", vendor: "Nawab Restaurant", addr: "Botchergate, Carlisle", no: "551204", date: [2026, 5, 29], time: "21:47", lines: [{ d: "TOTAL", qty: 1, price: 23.25 }], hard: "a second terminal slip, late at night, no itemisation" });
build({ ...A5, style: "email", domain: "adobe.com", vendor: "Adobe Systems Software Ireland", addr: "4-6 Riverwalk, Dublin 24, Ireland", taxNo: "IE 6364992H", no: "ADB-5512094", date: [2026, 6, 1], noVat: true, lines: [{ d: "Acrobat Pro, monthly", qty: 1, price: 15.17 }], hard: "an Irish VAT number, no VAT charged, reverse charge instead", foot: "VAT to be accounted for by the customer under the reverse charge." });
build({ ...A5, style: "email", domain: "vistaprint.co.uk", vendor: "Vistaprint", addr: "Hudson House, Dublin 2, Ireland", taxNo: "GB 727 2554 88", no: "VP-441028", date: [2026, 8, 28], lines: [{ d: "Business cards, 500", qty: 1, price: 34 }, { d: "Flyers A5, 1000", qty: 1, price: 78 }, { d: "Delivery", qty: 1, price: 6.99 }], hard: "the flyer order for the depots, as it happens" });
build({ ...A4, style: "stamped", stamp: "COPY", stampColour: "#666", vendor: "Travis Perkins", addr: "Currock Road, Carlisle CA2 4BN", taxNo: "GB 553 2210 88", no: "TP-884120", date: [2026, 4, 12], due: [2026, 5, 12], lines: [{ d: "Cement 25kg", qty: 10, price: 6.4 }, { d: "Sharp sand bulk bag", qty: 2, price: 48 }, { d: "Blocks 100mm", qty: 60, price: 1.95 }], hard: "a duplicate of another sheet in this pile, stamped COPY: must be caught, not filed twice" });
build({ ...A4, style: "landscape", vendor: "Fleet Finance Ltd", addr: "Wellington Place, Leeds LS1 4AP", taxNo: "GB 556 2290 11", no: "FF-2026-04-118", date: [2026, 4, 1], due: [2026, 4, 8], cols: ["Description", "Months", "Monthly", "Amount"], lines: [{ d: "Vehicle lease, LV21 KNX", qty: 1, price: 389 }, { d: "Maintenance package", qty: 1, price: 62 }], hard: "one of twelve identical monthly invoices: only number and date differ" });
build({ ...A4, style: "letterhead", vendor: "Cumberland Insurance Brokers", tagline: "Authorised and regulated by the FCA", addr: "Lowther Street, Carlisle CA3 8DA", taxLine: "Insurance is exempt from VAT", coLine: "FCA No. 447122", no: "CIB-2026-881", date: [2026, 4, 5], due: [2026, 4, 19], noVat: true, lines: [{ d: "Commercial van policy, 12 months", qty: 1, price: 1240 }, { d: "Public liability, 12 months", qty: 1, price: 385 }], hard: "insurance is exempt: no VAT at all, and IPT is not VAT", foot: "Insurance Premium Tax included. IPT is not recoverable as VAT." });
build({ ...A4, style: "photocopy", vendor: "Kingmoor Motors", addr: "Kingstown, Carlisle CA3 0HA", taxNo: "GB 448 9012 33", no: "KM-77211", date: [2026, 6, 13], due: [2026, 7, 13], lines: [{ d: "Van service, full", qty: 1, price: 285 }, { d: "MOT", qty: 1, price: 54.85, rate: 0 }, { d: "Brake discs and pads", qty: 1, price: 219.4 }], hard: "a grey photocopy, and the MOT is outside the scope of VAT" });
build({ ...A4, style: "fax", vendor: "Solway Timber", addr: "Silloth CA7 4JT", taxNo: "GB 220 4417 88", no: "ST-556120", date: [2026, 3, 19], due: [2026, 4, 19], lines: [{ d: "Redwood 47x100, 4.8m", qty: 40, price: 11.4 }, { d: "Ply 18mm WBP", qty: 15, price: 34.8 }], hard: "faxed, previous tax year, large quantities" });
build({ ...A4, style: "twoCol", vendor: "Northgate Vehicle Hire", addr: "Kingstown Ind Est, Carlisle CA3 0HA", taxNo: "GB 044 7122 09", no: "NVH-2026-4471", date: [2026, 4, 1], due: [2026, 4, 30], lines: [{ d: "Van hire, LWB Transit, weekly", qty: 4, price: 210 }, { d: "Insurance waiver", qty: 4, price: 28 }, { d: "Excess mileage, miles", qty: 340, price: 0.14 }], hard: "a per-mile rate in pence, which reads like a total" });
build({ ...A4, style: "spreadsheet", vendor: "Pennine Scaffolding", addr: "Brampton CA8 1QW", taxNo: "GB 990 1122 33", no: "PS-2026-0706", date: [2026, 7, 6], due: [2026, 8, 6], cols: ["Item", "Qty", "Unit", "Amount"], lines: [{ d: "Erect, 3 storey frontage", qty: 1, price: 1850 }, { d: "Hire, weeks", qty: 4, price: 105 }, { d: "Dismantle", qty: 1, price: 480 }], hard: "spreadsheet gridlines, a large job" });
build({ ...A5, style: "confirmation", colour: "#1d4ed8", vendor: "Trainline", addr: "120 Holborn, London EC1N 2TD", taxLine: "Rail travel is zero-rated", noVat: true, no: "TL-8841220", date: [2026, 8, 11], title: "TICKET CONFIRMATION", lines: [{ d: "Carlisle to London Euston, return", qty: 1, price: 187.4 }], intro: "Your tickets are ready.", hard: "rail travel is zero-rated: the VAT really is nil" });
build({ ...A6, style: "docket", vendor: "Carlisle City Council", addr: "Civic Centre, Carlisle CA3 8QG", taxLine: "Exempt", noVat: true, no: "PK-4417", date: [2026, 4, 17], title: "PARKING", lines: [{ d: "Devonshire Walk, 4 hours", qty: 1, price: 3.6 }], hard: "council parking is exempt, and the ticket is tiny", foot: "Display face up" });
build({ ...A6, style: "docket", vendor: "M6 Toll", addr: "Great Wyrley, Staffordshire", taxNo: "GB 791 7261 22", no: "MT-99120", date: [2026, 6, 19], title: "TOLL", lines: [{ d: "Class 2, northbound", qty: 1, price: 5.92 }], hard: "a toll docket, VAT buried in a tiny total" });

// Documents that are not bills: the reader must refuse them, not file them.
const notABill = (o) => build({ ...o, type: "other", note: "not a bill: filing it would put money in the record that is not owed" });
notABill({ ...A4, style: "spreadsheet", vendor: "Travis Perkins", addr: "Currock Road, Carlisle CA2 4BN", taxNo: "GB 553 2210 88", no: "STMT-063026", date: [2026, 6, 30], title: "STATEMENT", cols: ["Date", "Ref", "Charge", "Balance"], lines: [{ d: "12/04/2026 TP-884120", qty: 1, price: 309.6 }, { d: "03/06/2026 TP-891044", qty: 1, price: 522 }], hard: "a statement: every line is an invoice already entered elsewhere", foot: "Do not pay from this statement." });
notABill({ ...A5, style: "boxed", vendor: "Jewson", addr: "Brunthill Road, Carlisle", taxNo: "GB 553 2210 88", no: "DN-55231", date: [2026, 6, 4], title: "DELIVERY NOTE", noVat: true, cols: ["Description", "Ordered", "Delivered", "Value"], lines: [{ d: "Timber 47x100 3.6m", qty: 24, price: 0 }, { d: "OSB3 18mm sheet", qty: 8, price: 0 }], hard: "a delivery note with no prices at all", foot: "Goods received in good condition. Signature: ______________" });
notABill({ ...A4, style: "band", colour: "#4b5563", vendor: "Cumbria Signs", addr: "Botcherby, Carlisle", taxNo: "GB 337 9911 04", no: "QT-4412", date: [2026, 8, 14], title: "QUOTATION", lines: [{ d: "Full van wrap, design and fit", qty: 1, price: 1240 }], hard: "a quotation: money not yet owed and possibly never", foot: "Valid 30 days. This is an estimate, not an invoice." });
notABill({ ...A5, style: "minimal", vendor: "Lakeland Fixings", addr: "Workington CA14 3YA", taxNo: "GB 224 1189 90", no: "PF-88213", date: [2026, 9, 10], title: "PRO FORMA", lines: [{ d: "Resin anchors M12, box of 100", qty: 1, price: 320 }], hard: "pro forma: a real VAT invoice follows, so filing both double-counts", foot: "Payment in advance. A VAT invoice will follow on payment." });
notABill({ ...A5, style: "email", domain: "stripe.com", vendor: "Stripe Payments UK", addr: "9 Sloane Street, London SW1X 9LE", taxNo: "GB 316 4776 45", no: "PAYOUT-441220", date: [2026, 9, 21], title: "PAYOUT ADVICE", noVat: true, subject: "Your payout is on the way", lines: [{ d: "Payout to account ****4417", qty: 1, price: 2840.55 }], hard: "money coming in, not a cost: filing it as an expense is backwards", foot: "This is a payout advice, not an invoice." });

// Credit notes: everything about them must end up negative.
const creditNote = (o) => build({ ...o, type: "credit_note", title: o.title ?? "CREDIT NOTE" });
creditNote({ ...A5, style: "markLeft", colour: "#b00020", vendor: "Travis Perkins", addr: "Currock Road, Carlisle CA2 4BN", taxNo: "GB 553 2210 88", no: "CN-4471", date: [2026, 4, 29], lines: [{ d: "Blocks 100mm returned", qty: 20, price: 1.95 }], hard: "a credit note: every amount must be stored negative", foot: "Credited against invoice TP-884120. Do not pay." });
creditNote({ ...A5, style: "zebra", colour: "#b00020", tint: "#fdecec", vendor: "City Plumbing", addr: "Junction Street, Carlisle", taxNo: "GB 118 2204 77", no: "CP-CR-220", date: [2026, 8, 1], lines: [{ d: "Copper pipe over-supplied", qty: 4, price: 9.4 }], hard: "the word CREDIT appears once, small, inside a coloured pill" });
creditNote({ ...TILL, style: "till", vendor: "Halfords", addr: "Kingstown Retail Park", taxNo: "GB 336 1120 44", no: "HF-RF-8841", date: [2026, 7, 18], title: "REFUND", lines: [{ d: "WIPER BLADES RETURNED", qty: 1, price: 18.99 }], hard: "a till refund, which is a credit note in disguise", foot: "REFUND TO CARD ****4417" });
creditNote({ ...A4, style: "matrix", vendor: "Border Plant Hire", addr: "Brunthill Road, Carlisle CA3 0EH", taxNo: "GB 448 9012 33", no: "BPHCR00118", date: [2026, 9, 18], lines: [{ d: "TRANSPORT CHARGED TWICE", qty: 1, price: 65 }], hard: "a credit note on dot matrix paper", foot: "CREDIT TO ACCOUNT" });

// CIS: the deduction comes off labour only, and the payable figure is the odd one out.
const cisDoc = (o) => {
  const net = o.labour + o.materials;
  const vat = Math.round(net * 20) / 100;
  const ded = Math.round(o.labour * o.cisRate) / 100;
  build({
    ...o,
    lines: [{ d: `Labour: ${o.work}`, qty: 1, price: o.labour }, ...(o.materials ? [{ d: "Materials", qty: 1, price: o.materials }] : [])],
    extraTotals: [[`Less CIS ${o.cisRate}% on labour`, `-&pound;${m2(ded)}`]],
    grossLabel: "Payable",
    grossOverride: Math.round((net + vat - ded) * 100) / 100,
    note: `CIS ${o.cisRate}% held back from labour only; gross before the deduction was ${m2(Math.round((net + vat) * 100) / 100)}`,
    foot: "Construction Industry Scheme. Deduction is from labour only; materials are not liable.",
  });
};
cisDoc({ ...A4, style: "markLeft", colour: "#334155", vendor: "J. Hetherington Groundworks", addr: "Kingmoor Park, Carlisle CA6 4SD", taxNo: "GB 448 9012 33", no: "JH-1142", date: [2026, 4, 22], labour: 2400, materials: 860, cisRate: 20, work: "groundworks, phase 1", hard: "CIS 20%: the payable figure is neither the net nor the gross" });
cisDoc({ ...A4, style: "boxed", vendor: "R. Scott Roofing", addr: "Wigton CA7 9AA", taxNo: "GB 224 1189 90", no: "RS-770", date: [2026, 6, 30], labour: 3100, materials: 1890.5, cisRate: 30, work: "roof strip and re-cover", hard: "CIS at 30%, the unverified rate" });
cisDoc({ ...A5, style: "lined", vendor: "Cumbria Plastering", addr: "Harraby, Carlisle", phone: "07700 900119", taxNo: "GB 990 1122 33", no: "CPL-5512", date: [2026, 8, 30], labour: 1420, materials: 0, cisRate: 20, work: "first floor", hard: "handwritten CIS invoice, labour only, no materials line" });

// A few that are simply awkward.
build({ ...A5, style: "minimal", vendor: "P. Nixon Fencing", addr: "Dalston, Carlisle", taxLine: "Not VAT registered", noVat: true, no: "55", date: [2026, 5, 16], dateShown: null, lines: [{ d: "Close board fencing, 18m", qty: 1, price: 540 }, { d: "Concrete posts", qty: 10, price: 10 }], hard: "the date prints as 16 May with no year: must be asked, never assumed", note: "no year anywhere on the document" });
build({ ...A5, style: "markRight", colour: "#166534", vendor: "Border Fixings", addr: "Longtown CA6 5NA", taxNo: "GB 118 2204 77", no: "BF-7720", date: [2026, 7, 2], lines: [{ d: "Fixings, assorted", qty: 1, price: 220 }], extraTotals: [["Settlement discount 10%", "-&pound;26.40"]], grossOverride: 237.6, hard: "two totals: one before a settlement discount and one after", note: "the payable figure is the one after the discount" });
build({ ...A4, style: "letterhead", vendor: "Kirk Construction Services", tagline: "Principal contractor", addr: "Kingmoor Park, Carlisle CA6 4SD", taxNo: "GB 990 1122 33", no: "KCS-8806", date: [2026, 8, 6], noVat: true, lines: [{ d: "Site labour, August", qty: 1, price: 1850 }], hard: "domestic reverse charge: the VAT shows as nil on purpose", foot: "Domestic reverse charge: customer to account for VAT to HMRC.", note: "reverse charge, not an error" });
build({ ...A5, style: "docket", vendor: "Goodwill Repairs Ltd", addr: "Carlisle CA1 2RW", taxNo: "GB 441 7220 11", no: "GR-0042", date: [2026, 8, 11], lines: [{ d: "Remedial work, under warranty", qty: 1, price: 0 }], hard: "a zero total: nothing is owed and nothing should be filed as owing", foot: "No charge. Issued for your records." });
build({ ...TILL, style: "till", vendor: "Fell View Stores", addr: "Caldbeck, Wigton", taxLine: "VAT number not shown", noVat: true, no: "FV55120", date: [2026, 5, 24], lines: [{ d: "TEA 80 BAGS", qty: 1, price: 3.49 }, { d: "SUGAR 1KG", qty: 1, price: 1.29 }, { d: "MILK 4PT", qty: 1, price: 1.75 }], hard: "VAT included but never stated anywhere on the paper", foot: "" });
build({ ...A4, style: "zebra", colour: "#0369a1", tint: "#e0f2fe", vendor: "Northern Power", addr: "PO Box 1122, Sunderland SR1 1AA", taxNo: "GB 220 4417 88", no: "NP-8841-0426", date: [2026, 4, 28], due: [2026, 5, 14], rate: 5, title: "BILL", cols: ["Charge", "Units", "Rate", "Amount"], lines: [{ d: "Electricity, workshop, March 2026", qty: 1, price: 182.4 }, { d: "Standing charge, 31 days", qty: 1, price: 14.6 }], hard: "5% VAT, not 20%, and a period that is not the bill date" });
build({ ...A4, style: "twoCol", vendor: "Cumbria Water", addr: "Cockermouth CA13 0HT", taxNo: "GB 336 1120 44", no: "CW-220115", date: [2026, 5, 20], due: [2026, 6, 10], rate: 0, title: "BILL", lines: [{ d: "Water supply, Q1 2026", qty: 1, price: 96 }, { d: "Waste water, Q1 2026", qty: 1, price: 64.5 }], hard: "water is zero-rated: the VAT really is 0.00" });
build({ ...A4, style: "band", colour: "#be123c", vendor: "Safety First Supplies", addr: "Workington CA14 3YA", taxNo: "GB 224 1189 90", no: "SFS-44021", date: [2026, 8, 17], due: [2026, 9, 17], lines: [{ d: "Hard hats", qty: 8, price: 9.5 }, { d: "Safety boots", qty: 4, price: 48, rate: 0 }, { d: "Gloves, box of 50", qty: 2, price: 34 }], hard: "protective boots are zero-rated while hard hats are not" });
build({ ...A4, style: "markLeft", colour: "#713f12", vendor: "Sage UK Ltd", addr: "North Park, Newcastle NE13 9AA", taxNo: "GB 556 2290 11", no: "SGE-2026-77412", date: [2026, 3, 1], due: [2026, 3, 15], lines: [{ d: "Accounting subscription, 12 months in advance", qty: 1, price: 336 }], hard: "a year paid up front: the cost belongs to twelve months, not to March" });

// More paper, mostly half-page and smaller so the printing stays sane.
build({ ...A5, style: "carbon", vendor: "Whitehaven Marine Fuels", addr: "The Harbour, Whitehaven CA28 7LR", taxNo: "GB 243 8817 02", no: "WMF-3310", date: [2026, 6, 11], lines: [{ d: "Gas oil, litres", qty: 320, price: 1.12 }], hard: "a receipt book carbon, one line, a per-litre price" });
build({ ...A5, style: "lined", vendor: "T. Bell Chimney Sweep", addr: "Brampton CA8 1SH", phone: "07700 900318", no: "204", date: [2026, 10, 2], noVat: true, lines: [{ d: "Sweep and certificate", qty: 1, price: 65 }], hard: "a future date: October, after everything else in the pile" });
build({ ...A5, style: "grid", vendor: "Kelso Fabrication", phone: "01573 900412", addr: "Kelso, Scottish Borders TD5 7BH", no: "41", date: [2026, 7, 9], noVat: true, lines: [{ d: "Gate frame, galvanised", qty: 1, price: 380 }, { d: "Delivery to Carlisle", qty: 1, price: 45 }], hard: "a Scottish address and postcode, handwritten" });
build({ ...A5, style: "docket", vendor: "Stena Line", addr: "Cairnryan, Scotland DG9 8RF", taxLine: "Zero-rated: international passenger transport", noVat: true, no: "SL-4417220", date: [2026, 8, 5], title: "TRAVEL RECEIPT", lines: [{ d: "Vehicle and driver, Cairnryan to Belfast", qty: 1, price: 148 }], hard: "international transport is zero-rated, and it is a ferry, not a bill" });
build({ ...A5, style: "minimal", vendor: "Hospice at Home Carlisle", addr: "Carlisle CA2 7NH", taxLine: "Registered charity 1053920", noVat: true, no: "DON-8841", date: [2026, 5, 15], title: "DONATION RECEIPT", lines: [{ d: "Donation", qty: 1, price: 250 }], hard: "a charity donation: outside the scope of VAT, and not a business cost at all" });
build({ ...A5, style: "email", domain: "ee.co.uk", vendor: "EE Business", addr: "Trident Place, Hatfield AL10 9BW", taxNo: "GB 553 9772 10", no: "EE-77120448", date: [2026, 6, 6], due: [2026, 6, 20], lines: [{ d: "Mobile, 3 lines, monthly", qty: 3, price: 21 }, { d: "Data add-on", qty: 1, price: 10 }, { d: "Calls outside plan", qty: 1, price: 4.82 }], hard: "a phone bill where the line count multiplies out" });
build({ ...A5, style: "zebra", colour: "#0f766e", tint: "#ecfeff", vendor: "Northside Self Storage", addr: "Kingstown, Carlisle CA3 0HA", taxNo: "GB 441 7220 11", no: "NSS-0912", date: [2026, 9, 1], due: [2026, 9, 8], lines: [{ d: "Unit 44, 100 sq ft, monthly", qty: 1, price: 96 }, { d: "Insurance", qty: 1, price: 12 }] });
build({ ...A5, style: "markLeft", colour: "#3f3f46", vendor: "Gilpin Legal LLP", addr: "Bank Street, Carlisle CA3 8HG", taxNo: "GB 336 1120 44", no: "GL-2026-0448", date: [2026, 7, 17], due: [2026, 8, 16], lines: [{ d: "Contract review, hours", qty: 3.5, price: 220 }, { d: "Disbursements", qty: 1, price: 48, rate: 0 }], hard: "fractional hours, and disbursements outside VAT" });
build({ ...A5, style: "markRight", colour: "#9f1239", vendor: "Bloom & Vine", addr: "Lowther Street, Carlisle", taxNo: "GB 224 1189 90", no: "BV-1180", date: [2026, 6, 28], lines: [{ d: "Arrangement, large", qty: 1, price: 65 }, { d: "Delivery", qty: 1, price: 8 }] });
build({ ...A5, style: "boxed", vendor: "Fragov Services Ltd", addr: "Unit 3 Willowholme, Carlisle CA2 5RT", taxNo: "GB 771 4402 55", no: "SB-2026-0044", date: [2026, 8, 25], title: "SELF-BILLED INVOICE", to: "J. Hetherington Groundworks<br>Kingmoor Park, Carlisle CA6 4SD", lines: [{ d: "Labour, week 34", qty: 1, price: 1200 }], hard: "self-billing: the customer raised it, so the supplier is the other party", note: "the supplier here is Hetherington, not Fragov, despite the letterhead", foot: "Self-billed under agreement dated 01/04/2026." });
build({ ...A5, style: "confirmation", colour: "#0369a1", vendor: "Hilton Garden Inn", addr: "Sunderland SR1 3HP", taxNo: "GB 556 2290 11", no: "HGI-4471209", date: [2026, 7, 30], title: "FOLIO", lines: [{ d: "Room, 2 nights", qty: 2, price: 79 }, { d: "Breakfast", qty: 2, price: 12.5 }, { d: "Car parking", qty: 2, price: 8 }], hard: "a hotel folio: three lines that all multiply by nights" });
build({ ...TILL, style: "till", vendor: "Booths", addr: "Penrith CA11 7JQ", taxNo: "GB 412 7755 19", no: "BO112040", date: [2026, 5, 6], lines: [{ d: "COFFEE BEANS", qty: 1, price: 6.5 }, { d: "MILK 2PT", qty: 2, price: 1.45 }, { d: "BISCUITS", qty: 3, price: 1.79 }], hard: "quantities greater than one on a till receipt" });
build({ ...TILL, style: "till", ink: "faded", vendor: "Esso Warwick Road", addr: "Carlisle CA1 2RW", taxNo: "GB 243 8817 02", no: "ES771204", date: [2026, 6, 2], time: "06:12", lines: [{ d: "UNLEADED 61.40L", qty: 1, price: 90.19 }, { d: "CAR WASH", qty: 1, price: 7 }], hard: "faded fuel receipt with a second, unrelated line" });
build({ ...TILL, style: "till", vendor: "Wetherspoons", addr: "The Woodrow Wilson, Carlisle", taxNo: "GB 337 9911 04", no: "WS004412", date: [2026, 7, 26], lines: [{ d: "BURGER MEAL", qty: 1, price: 9.49 }, { d: "PINT", qty: 2, price: 3.95 }], hard: "food and drink at different real-world rates, printed as one", foot: "TABLE 41" });
build({ ...TILL, style: "till", vendor: "Halfords", addr: "Kingstown Retail Park, Carlisle", taxNo: "GB 336 1120 44", no: "HF992011", date: [2026, 7, 16], lines: [{ d: "WIPER BLADES", qty: 1, price: 18.99 }, { d: "SCREENWASH", qty: 1, price: 5.49 }, { d: "BULB H7", qty: 2, price: 7.25 }], hard: "the sheet its own refund credit note refers to" });
build({ ...TILL, style: "till", vendor: "Costa Coffee", addr: "M6 Southwaite Services", taxNo: "GB 337 9911 04", no: "CC551204", date: [2026, 8, 21], time: "06:14", lines: [{ d: "FLAT WHITE", qty: 1, price: 3.45 }, { d: "PANINI", qty: 1, price: 5.95 }], hard: "eat in or take away changes the VAT and the paper does not say" });
build({ ...TILL, style: "till", vendor: "Poundland", addr: "The Lanes, Carlisle", taxNo: "GB 553 2210 88", no: "PL044120", date: [2026, 9, 9], lines: [{ d: "CABLE TIES", qty: 1, price: 1 }, { d: "MARKER PEN", qty: 1, price: 1 }, { d: "TAPE", qty: 1, price: 1 }], hard: "round numbers with no pence anywhere" });
build({ ...WIDE, style: "till", code: "qr", vendor: "B&Q Trade Point", addr: "Kingstown, Carlisle CA3 0AT", taxNo: "GB 232 5223 45", no: "BQ88412204", date: [2026, 6, 5], lines: [{ d: "INSULATION ROLL 100MM", qty: 6, price: 22.4 }, { d: "PLASTERBOARD 12.5MM", qty: 12, price: 9.85 }, { d: "ADHESIVE 25KG", qty: 4, price: 11.5 }, { d: "TRADE DISCOUNT", qty: 1, price: -18.4 }], hard: "a negative discount line on a till receipt" });
build({ ...CARD, style: "slip", vendor: "City Cabs Carlisle", addr: "Rickergate, Carlisle", no: "441207", date: [2026, 9, 14], time: "23:41", lines: [{ d: "FARE", qty: 1, price: 18.4 }], hard: "a taxi terminal slip near midnight: the date is the awkward part" });
build({ ...CARD, style: "slip", vendor: "Tesco Express", addr: "Warwick Road, Carlisle", no: "771202", date: [2026, 4, 2], time: "08:03", lines: [{ d: "PURCHASE", qty: 1, price: 6.85 }], hard: "a slip with no itemisation at all, just a total" });
build({ ...A6, style: "docket", vendor: "Dart Charge", addr: "Dartford Crossing", taxNo: "GB 888 8888 88", no: "DC-4417", date: [2026, 8, 7], title: "CROSSING", lines: [{ d: "Class B, LV21 KNX", qty: 1, price: 2.5 }], hard: "the smallest total in the pile" });
build({ ...A6, style: "docket", vendor: "Transport for London", addr: "Congestion Charge, PO Box 344", taxLine: "Outside the scope of VAT", noVat: true, no: "CC-88120", date: [2026, 7, 3], title: "CHARGE", lines: [{ d: "Daily charge, LV21 KNX", qty: 1, price: 15 }], hard: "a road charge, not a supply: no VAT at all" });
build({ ...A6, style: "docket", vendor: "NCP", addr: "Viaduct Car Park, Carlisle", taxNo: "GB 234 5566 77", no: "NCP-5512", date: [2026, 5, 6], title: "PARKING", lines: [{ d: "4 hours", qty: 1, price: 7.5 }], hard: "commercial parking does carry VAT, unlike the council's" });
build({ ...A4, style: "spreadsheet", vendor: "Border Electrical Wholesale", addr: "Montgomery Way, Carlisle CA3 0EH", taxNo: "GB 441 7220 11", no: "BEW-2026-1180", date: [2026, 9, 25], due: [2026, 10, 25], cols: ["Code", "Qty", "Unit", "Amount"], lines: [{ d: "T&E 2.5mm 100m drum", qty: 4, price: 78 }, { d: "Consumer unit 10 way", qty: 2, price: 96.5 }, { d: "RCBO 32A", qty: 12, price: 18.4 }, { d: "Back box 35mm", qty: 50, price: 0.68 }, { d: "Socket double white", qty: 40, price: 3.95 }, { d: "Switch 1 gang", qty: 25, price: 2.4 }, { d: "Cable clips box", qty: 8, price: 4.2 }, { d: "Conduit 20mm 3m", qty: 15, price: 3.85 }, { d: "Junction box", qty: 20, price: 2.15 }, { d: "Carriage", qty: 1, price: 12.5 }], hard: "ten lines, several with quantities in the dozens" });
notABill({ ...A5, style: "boxed", vendor: "Fragov Services Ltd", addr: "Unit 3 Willowholme, Carlisle CA2 5RT", taxNo: "GB 771 4402 55", no: "PO-2026-0338", date: [2026, 6, 2], title: "PURCHASE ORDER", to: "Jewson, Brunthill Road, Carlisle", lines: [{ d: "Timber 47x100 3.6m", qty: 24, price: 8.75 }], hard: "an order Atanas sent out: nothing is owed until the invoice arrives" });
notABill({ ...A5, style: "minimal", vendor: "Fragov Services Ltd", addr: "Unit 3 Willowholme, Carlisle CA2 5RT", taxNo: "GB 771 4402 55", no: "REM-441208", date: [2026, 9, 28], title: "REMITTANCE ADVICE", to: "Travis Perkins, Currock Road, Carlisle", noVat: true, lines: [{ d: "Payment against TP-884120", qty: 1, price: 371.52 }], hard: "a remittance advice: a record of paying, not a new cost" });

// ------------------------------------------------------------------ CSS
const CSS = `
  @page { size: A4; margin: 9mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Helvetica Neue", Arial, sans-serif; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .flow { display: flex; flex-wrap: wrap; align-content: flex-start; gap: 5mm; }
  .cut { border: 1px dashed #bbb; padding: 3mm; background: #fff; break-inside: avoid; overflow: hidden; }
  .stamp { font-size: 5.5pt; color: #aaa; letter-spacing: .4px; text-align: center; padding-top: 1.5mm; border-top: 1px dotted #e2e2e2; margin-top: 2mm; }
  .doc { font-size: 9pt; }
  .serif { font-family: Georgia, "Times New Roman", serif; }
  .cond { font-family: "Arial Narrow", "Helvetica Neue", sans-serif; letter-spacing: .2px; }
  .mono, pre { font-family: "Courier New", monospace; }
  .thin { font-weight: 300; }
  .caps { text-transform: uppercase; letter-spacing: 1px; }
  .spaced { letter-spacing: 1.5px; }
  .light { font-weight: 300; }
  .s { font-size: 7.5pt; color: #444; }
  .micro { font-size: 6.5pt; color: #666; }
  .b { font-weight: 700; }
  .r { text-align: right; }
  .c { text-align: center; }
  .gap { height: 5mm; }
  .split { display: flex; justify-content: space-between; align-items: flex-start; gap: 6mm; }
  .split.top { margin-bottom: 3mm; }
  .name { font-size: 13pt; font-weight: 700; line-height: 1.15; }
  .name.big { font-size: 18pt; }
  .doctype { font-size: 11pt; font-weight: 700; letter-spacing: .5px; }
  .billto { margin: 3mm 0; }
  .lbl { font-size: 6.5pt; text-transform: uppercase; letter-spacing: 1px; color: #777; }
  hr { border: 0; border-top: 1px solid #111; margin: 2.5mm 0; }
  .hair { border-top: .5px solid #999; margin: 2mm 0; }
  .rulewide { border-top: 2px solid #111; margin: 2.5mm 0; }
  table { width: 100%; border-collapse: collapse; margin: 3mm 0; }
  th { font-size: 7pt; text-transform: uppercase; letter-spacing: .5px; text-align: left; padding: 1mm 2mm 1mm 0; }
  td { padding: 1.2mm 2mm 1.2mm 0; }
  .ruled th { border-bottom: 1.5px solid #111; } .ruled td { border-bottom: .5px solid #ddd; }
  .hairline th { border-bottom: .5px solid #111; } .hairline td { border-bottom: .5px solid #eee; }
  .airy th { border-bottom: 1px solid #ccc; } .airy td { padding: 2mm 2mm 2mm 0; }
  .bare th, .bare td { border: 0; padding: 1mm 2mm 1mm 0; }
  .striped tr:nth-child(even) td { background: #f5f5f5; }
  .striped th { background: #111; color: #fff; padding: 1.5mm 2mm; }
  .striped td { padding: 1.5mm 2mm; }
  .gridded th, .gridded td { border: .5px solid #999; padding: 1.2mm 2mm; }
  .tight th, .tight td { padding: .6mm 1.5mm .6mm 0; font-size: 8pt; }
  .sheetgrid th, .sheetgrid td { border: .5px solid #bbb; padding: 1mm 1.5mm; font-size: 8pt; }
  .sheetgrid th { background: #e8e8e8; }
  .ledgertable tr:nth-child(odd) td { background: #e3f0e3; }
  .ledgertable td, .ledgertable th { padding: 1.4mm 2mm; }
  .totright { margin-left: auto; width: 62mm; }
  .totright .row, .totbox .row, .totfill .row, .cell.tot .row { display: flex; justify-content: space-between; padding: .7mm 0; }
  .totright .row.b, .totbox .row.b, .totfill .row.b, .cell.tot .row.b { border-top: 1.5px solid #111; padding-top: 1.4mm; font-size: 11pt; font-weight: 700; }
  .totbox { margin-left: auto; width: 66mm; border: 2px solid; padding: 2.5mm; }
  .totfill { margin-left: auto; width: 66mm; padding: 2.5mm; }
  .foot { margin-top: 4mm; color: #444; }
  .row { display: flex; justify-content: space-between; gap: 4mm; }
  .row.big { font-size: 11pt; font-weight: 700; }
  .band { display: flex; justify-content: space-between; align-items: center; color: #fff; padding: 4mm 5mm; }
  .bandname { font-size: 15pt; font-weight: 700; }
  .bandtype { font-size: 11pt; letter-spacing: 2px; text-align: right; }
  .bandright { text-align: right; font-size: 8pt; }
  .pad { padding: 4mm 5mm; }
  .withmark { display: flex; gap: 3mm; align-items: flex-start; }
  .mark { width: 14mm; height: 14mm; color: #fff; font-weight: 700; font-size: 12pt; display: flex; align-items: center; justify-content: center; flex: none; }
  .circle { width: 14mm; height: 14mm; border: 2px solid; border-radius: 50%; font-weight: 700; display: flex; align-items: center; justify-content: center; flex: none; }
  .pill { display: inline-block; color: #fff; padding: 1mm 3mm; font-size: 9pt; letter-spacing: 1px; }
  .framed { border: 1.5px solid #111; }
  .cells { display: flex; border-bottom: 1.5px solid #111; }
  .cells.last { border-bottom: 0; }
  .cell { padding: 2mm 2.5mm; border-right: 1.5px solid #111; min-width: 42mm; }
  .cell:last-child { border-right: 0; }
  .cell.grow { flex: 1; }
  .cell.tot { min-width: 58mm; }
  .framed table { margin: 0; }
  .cols { display: flex; gap: 6mm; margin: 3mm 0; }
  .cols > div { flex: 1; }
  .factgrid { display: flex; flex-wrap: wrap; gap: 4mm 8mm; margin-bottom: 3mm; }
  .factgrid > div { min-width: 38mm; }
  .factgrid span { display: block; }
  .kv > div { display: flex; gap: 3mm; justify-content: space-between; font-size: 8pt; }
  .kv span { color: #666; }
  .dense { font-size: 8pt; }
  .dense td, .dense th { padding: .8mm 1.5mm .8mm 0; }
  .matrix { position: relative; background: #fdfdf2; padding: 0 7mm; }
  .matrixbody { padding: 3mm 0; }
  .matrix pre { font-size: 8pt; line-height: 1.45; margin: 0; letter-spacing: .3px; white-space: pre-wrap; }
  .sprockets { position: absolute; top: 0; bottom: 0; width: 7mm; background-image: radial-gradient(circle at 3.5mm 3mm, #fff 1.1mm, #aaa 1.2mm, transparent 1.3mm); background-size: 7mm 7mm; border-left: .5px dashed #ccc; border-right: .5px dashed #ccc; }
  .sprockets.left { left: 0; } .sprockets.right { right: 0; }
  .carbonpaper { background: #fdf6d8; color: #1b3a8c; padding: 3mm; }
  .carbonpaper .s, .carbonpaper .micro { color: #3355a8; }
  .carbonhead { display: flex; justify-content: space-between; border-bottom: 1.5px solid #1b3a8c; padding-bottom: 2mm; margin-bottom: 2mm; }
  .carbonpaper .ruled th { border-bottom-color: #1b3a8c; } .carbonpaper .ruled td { border-bottom-color: #c9c09a; }
  .carbonpaper .totright .row.b { border-top-color: #1b3a8c; }
  .sign { margin-top: 6mm; font-size: 8pt; }
  .sign.small { margin-top: 3mm; font-size: 7pt; }
  .pad.lines { background-color: #fffdf2; background-image: repeating-linear-gradient(transparent 0 5.4mm, #b9d4ea 5.4mm 5.5mm); padding: 3mm; }
  .pad.squares { background-color: #fffdf2; background-image: repeating-linear-gradient(transparent 0 4.4mm, #cfe0ef 4.4mm 4.5mm), repeating-linear-gradient(90deg, transparent 0 4.4mm, #cfe0ef 4.4mm 4.5mm); padding: 3mm; }
  .hw { font-family: "Bradley Hand", "Segoe Script", "Comic Sans MS", cursive; font-size: 11pt; line-height: 5.5mm; color: #1a1a6e; }
  .pad.squares .hw { line-height: 4.5mm; }
  .hwname { font-size: 15pt; font-weight: 700; }
  .hwgap { height: 5.5mm; }
  .ledgerpaper { padding: 2mm; }
  .till { font-family: "Courier New", monospace; font-size: 8.5pt; line-height: 1.35; }
  .till .row { gap: 3mm; }
  .rule { border-top: 1px dashed #999; margin: 1.5mm 0; }
  .till.faded { color: #9a9a9a; } .till.faded .s { color: #b4b4b4; }
  .till.invert { background: #111; color: #f2f2f2; padding: 3mm; }
  .till.invert .s { color: #ccc; } .till.invert .rule { border-top-color: #777; }
  .slipbox { border: 1px solid #ddd; padding: 2mm; }
  .barcode { height: 9mm; margin: 2mm 0 1mm; }
  .qr { width: 18mm; height: 18mm; margin: 2mm auto 1mm; display: grid; grid-template-columns: repeat(12, 1fr); }
  .qr i { background: #fff; } .qr i.on { background: #111; }
  .mailhead { border: 1px solid #ccc; background: #f7f7f7; padding: 2.5mm; font-size: 8pt; line-height: 1.5; }
  .mailbody { padding: 3mm 1mm; }
  .mailfoot { border-top: 1px solid #ddd; padding-top: 2mm; text-align: center; }
  .stampwrap { position: relative; }
  .stampmark { position: absolute; top: 34mm; left: 50%; transform: translateX(-50%) rotate(-18deg); border: 4px solid; padding: 2mm 8mm; font-size: 26pt; font-weight: 700; letter-spacing: 4px; opacity: .3; }
  .letterhead { padding-bottom: 2mm; }
  .copied { filter: grayscale(1) contrast(.82) brightness(1.06); transform: rotate(-.7deg); }
  .faxline { border-bottom: 1px solid #999; font-size: 7pt; letter-spacing: .5px; padding-bottom: 1mm; margin-bottom: 3mm; }
  .cover { font-family: Arial, sans-serif; padding: 8mm; }
  .cover h1 { font-size: 19pt; margin: 0 0 4mm; }
  .cover p { font-size: 9.5pt; line-height: 1.5; max-width: 155mm; }
  .cover td, .cover th { font-size: 8pt; border-bottom: .5px solid #ddd; }
`;

// ----------------------------------------------------------- the pages
const pages = [];
let flow = [];
let used = 0;
const CAP = 252;
const heightOf = (d) => (d.width && d.width <= 80 ? 92 : d.width && d.width <= 100 ? 100 : 112);
for (const d of docs) {
  const box = `<div class="cut" style="${d.width ? `width:${d.width}mm;` : ""}">${d.html}<div class="stamp">FAKE TEST DOCUMENT &middot; ${d.id}</div></div>`;
  if (d.page) {
    if (flow.length) { pages.push(`<div class="page"><div class="flow">${flow.join("")}</div></div>`); flow = []; used = 0; }
    pages.push(`<div class="page">${box}</div>`);
    continue;
  }
  const h = heightOf(d);
  const share = d.width && d.width <= 110 ? h / 2 : h;
  if (used + share > CAP && flow.length) { pages.push(`<div class="page"><div class="flow">${flow.join("")}</div></div>`); flow = []; used = 0; }
  flow.push(box);
  used += share;
}
if (flow.length) pages.push(`<div class="page"><div class="flow">${flow.join("")}</div></div>`);

const byStyle = docs.reduce((m, d) => { m[d.style] = (m[d.style] || 0) + 1; return m; }, {});
const cover = `
  <div class="page cover">
    <h1>${docs.length} fake documents, in ${Object.keys(byStyle).length} different designs</h1>
    <p><b>Every sheet on the following pages is invented.</b> No supplier, customer, address,
    VAT number or amount here belongs to a real business, and nothing records a real
    transaction. They exist so the reader can be tested against paper it has not seen.</p>
    <p>Print on A4, cut along the dashed lines, and batter them about &mdash; a flat sheet under a
    desk lamp is not the test. Each carries its id in small print at the foot, matching
    <code>expected.json</code>, so a cut-out pile can still be checked.</p>
    <p><b>A document the reader cannot manage is the most useful sheet in the pile.</b> Write down
    what it got wrong, not just that it failed.</p>
    <table><tr><th>Design</th><th>How many</th></tr>
    ${Object.entries(byStyle).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}</table>
  </div>`;

fs.mkdirSync(OUT, { recursive: true });
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${cover}${pages.join("")}</body></html>`;
fs.writeFileSync(OUT + "documents.html", html);
fs.writeFileSync(OUT + "expected.json", JSON.stringify(docs.map((d) => ({ id: d.id, design: d.style, hard: d.hard ?? null, ...d.expect })), null, 2));
fs.writeFileSync(OUT + "index.md", `# The ${docs.length} test documents

Generated by \`harness/gen-test-documents.mjs\` in ${Object.keys(byStyle).length} unrelated
designs, so no two look alike at arm's length. Every one is invented and every printed
sheet says so. \`expected.json\` holds what a correct reading looks like, keyed by the id
printed at the foot of each sheet.

Print \`documents.pdf\` on A4, cut along the dashed lines, and age them by hand.
**Write down what a failure got wrong, not just that it failed** — that list is what the
next scanner work is built from.

| id | design | supplier | what makes it hard |
|---|---|---|---|
${docs.map((d) => `| ${d.id} | ${d.style} | ${d.vendor} | ${d.hard ?? "straightforward, a control"} |`).join("\n")}
`);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle0" });
await page.pdf({ path: OUT + "documents.pdf", format: "A4", printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log(JSON.stringify({ documents: docs.length, designs: Object.keys(byStyle).length, pages: pages.length + 1 }));
