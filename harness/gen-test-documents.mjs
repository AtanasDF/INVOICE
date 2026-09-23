// A hundred fake documents to print, crumple and scan (Atanas, 2026-09-23).
// Every sheet says FAKE on its face: these get photographed into an accounting
// app, and a test document that could pass for a real one has no place near it.
//
// Printed at the size the real thing is, not stretched to fill A4 — a till
// receipt is 80mm wide and that narrowness is half of what makes it hard. Small
// ones are laid several to a page with dashed lines to cut along; A4 documents
// get a page each. Each carries its id in small print at the foot so a cut-out
// pile can still be matched to expected.json.
//
//   node gen-test-documents.mjs            -> test-documents/{documents.pdf,expected.json,index.md}
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const OUT = new URL("./test-documents/", import.meta.url).pathname;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const money = (n) => n.toFixed(2);
// net is in pence, the answer in pounds; without the inner /100 the VAT came
// out a hundredfold, on the printed sheets as well as in the answer key.
const vatOf = (netPence, rate) => Math.round((netPence * rate) / 100) / 100;
// Day-first, the way a UK document prints it.
const uk = (d) => `${String(d[2]).padStart(2, "0")}/${String(d[1]).padStart(2, "0")}/${d[0]}`;
const long = (d) => {
  const m = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${d[2]} ${m[d[1] - 1]} ${d[0]}`;
};

const docs = [];
let n = 0;
const add = (spec) => {
  n += 1;
  docs.push({ id: `D-${String(n).padStart(3, "0")}`, ...spec });
};

// ---------------------------------------------------------------- thermal
// Narrow, monospaced, no supplier address, the total often unlabelled. The
// commonest thing a driver actually has in the glovebox.
const till = (vendor, place, date, lines, opts = {}) => {
  const net = lines.reduce((t, l) => t + l[1], 0);
  const rate = opts.rate ?? 20;
  const vat = opts.noVat ? 0 : vatOf(net * 100, rate);
  const gross = opts.gross ?? Math.round((net + vat) * 100) / 100;
  add({
    kind: "till",
    width: 80,
    hard: opts.hard,
    vendor,
    date,
    expect: { vendor, date: uk(date), gross, vat: opts.noVat ? null : vat, type: "receipt" },
    html: `
      <div class="till${opts.faded ? " faded" : ""}${opts.invert ? " invert" : ""}">
        <div class="c b">${vendor.toUpperCase()}</div>
        <div class="c s">${place}</div>
        <div class="c s">VAT ${opts.vatNo ?? "GB 412 7755 19"}</div>
        <div class="rule"></div>
        ${lines.map((l) => `<div class="row"><span>${l[0]}</span><span>${money(l[1])}</span></div>`).join("")}
        <div class="rule"></div>
        ${opts.totalLabel === false
          ? `<div class="row big"><span></span><span>${money(gross)}</span></div>`
          : `<div class="row big"><span>TOTAL</span><span>${money(gross)}</span></div>`}
        ${opts.noVat ? `<div class="s c">No VAT breakdown shown</div>` : `<div class="row s"><span>VAT @ ${rate}%</span><span>${money(vat)}</span></div><div class="row s"><span>NET</span><span>${money(net)}</span></div>`}
        <div class="rule"></div>
        <div class="c s">${opts.paid ?? "CARD  **** 4417"}</div>
        <div class="c s">${uk(date)}   ${opts.time ?? "14:32"}</div>
        <div class="c s">THANK YOU</div>
      </div>`,
  });
};

till("Bramley Mini Market", "14 Foss Road, Carlisle", [2026, 4, 3], [["MILK 2PT", 1.35], ["SANDWICH", 3.2], ["CRISPS", 0.95]], { hard: "faint print, ambiguous date 03/04" });
till("Corner Cafe", "Botchergate, Carlisle", [2026, 4, 14], [["BACON ROLL", 3.5], ["TEA", 1.4]], { hard: "no VAT breakdown, tiny", noVat: true });
till("Hilltop Hardware", "Denton Holme", [2026, 5, 2], [["SCREWS 5x70", 4.85], ["SEALANT", 6.4], ["GLOVES", 3.25]], {});
till("Nisa Local", "Kingstown", [2026, 5, 19], [["WATER 6PK", 2.5], ["BANANAS", 1.1], ["COFFEE", 4.75], ["BREAD", 1.2], ["HAM", 2.4], ["CHEESE", 3.1], ["YOGHURT", 1.85], ["APPLES", 1.6]], { hard: "long receipt, many lines" });
till("Greggs", "The Lanes, Carlisle", [2026, 6, 8], [["SAUSAGE ROLL", 1.3], ["COFFEE", 2.1]], { hard: "total not labelled", totalLabel: false });
till("Tool Stop", "Willowholme Ind Est", [2026, 6, 23], [["DRILL BITS", 12.99], ["TAPE MEASURE", 8.5]], {});
till("Spar", "London Road", [2026, 7, 1], [["LUNCH DEAL", 4.0]], { hard: "single line, very short" });
till("Halfords", "Kingstown Retail Pk", [2026, 7, 16], [["WIPER BLADES", 18.99], ["SCREENWASH", 5.49], ["BULB H7", 7.25]], {});
till("Wilko", "English Street", [2026, 8, 4], [["STORAGE BOX", 6.0], ["BIN BAGS", 3.5], ["BATTERIES AA", 4.25]], {});
till("Costa Coffee", "M6 Southwaite Services", [2026, 8, 21], [["FLAT WHITE", 3.45], ["PANINI", 5.95]], { time: "06:14" });
till("Morrisons", "Kingstown, Carlisle", [2026, 9, 2], [["DIESEL 42.11L", 60.42], ["SANDWICH", 3.0]], { hard: "fuel and food on one receipt" });
till("Poundland", "The Lanes", [2026, 9, 9], [["CABLE TIES", 1.0], ["MARKER PEN", 1.0], ["TAPE", 1.0]], { hard: "round numbers, no pence" });
till("Boots", "English Street", [2026, 3, 11], [["PARACETAMOL", 2.19], ["PLASTERS", 3.29]], { hard: "part zero-rated, VAT does not match 20% of total", rate: 20 });
till("Market Stall 14", "Carlisle Market Hall", [2026, 2, 28], [["WORK SOCKS x3", 10.0]], { hard: "cash, no VAT number", noVat: true, paid: "CASH", vatNo: "not shown" });

// ------------------------------------------------------------------- fuel
// The pump number sits where a total normally goes, and litres look like money.
const fuel = (vendor, place, date, litres, ppl, opts = {}) => {
  const gross = Math.round(litres * ppl) / 100;
  const net = Math.round((gross / 1.2) * 100) / 100;
  add({
    kind: "till",
    width: 80,
    hard: opts.hard ?? "litres and pence-per-litre look like amounts",
    vendor,
    date,
    expect: { vendor, date: uk(date), gross, vat: Math.round((gross - net) * 100) / 100, type: "receipt" },
    html: `
      <div class="till">
        <div class="c b">${vendor.toUpperCase()}</div>
        <div class="c s">${place}</div>
        <div class="rule"></div>
        <div class="row"><span>PUMP</span><span>${opts.pump ?? 4}</span></div>
        <div class="row"><span>${opts.grade ?? "DIESEL"}</span><span></span></div>
        <div class="row"><span>LITRES</span><span>${litres.toFixed(2)}</span></div>
        <div class="row"><span>P/LITRE</span><span>${ppl.toFixed(1)}</span></div>
        <div class="rule"></div>
        <div class="row big"><span>FUEL SALE</span><span>&pound;${money(gross)}</span></div>
        <div class="row s"><span>VAT 20%</span><span>${money(Math.round((gross - net) * 100) / 100)}</span></div>
        <div class="c s">VAT REG 243 8817 02</div>
        <div class="c s">${uk(date)} ${opts.time ?? "07:41"}</div>
      </div>`,
  });
};
fuel("BP Kingstown", "Carlisle CA3 0HA", [2026, 4, 9], 54.22, 148.9);
fuel("Shell Rosehill", "Carlisle CA1 2RW", [2026, 5, 14], 48.06, 151.9, { grade: "DIESEL", pump: 7 });
fuel("Esso Warwick Road", "Carlisle", [2026, 6, 2], 61.4, 146.9, { pump: 2 });
fuel("Applegreen M6 J38", "Tebay", [2026, 7, 8], 70.11, 159.9, { hard: "motorway price, large total", pump: 11 });
fuel("Asda Fuel", "Carlisle CA2 5JX", [2026, 8, 12], 39.88, 142.9, { pump: 6 });
fuel("Gulf Brampton", "Brampton CA8 1SH", [2026, 9, 1], 45.0, 154.9, { hard: "exact litres, suspicious round number", pump: 1 });

// ------------------------------------------------------- small tickets
// Card-sized, almost no text, often no supplier address at all.
const ticket = (title, sub, date, gross, opts = {}) => {
  add({
    kind: "ticket",
    width: 62,
    height: 105,
    hard: opts.hard ?? "tiny, no supplier address",
    vendor: title,
    date,
    expect: { vendor: title, date: uk(date), gross, vat: opts.noVat ? null : Math.round((gross - gross / 1.2) * 100) / 100, type: "receipt" },
    html: `
      <div class="ticket">
        <div class="c b">${title}</div>
        <div class="c s">${sub}</div>
        <div class="rule"></div>
        ${opts.body ?? ""}
        <div class="c amount">&pound;${money(gross)}</div>
        <div class="rule"></div>
        <div class="c s">${uk(date)}</div>
        <div class="c s">${opts.foot ?? ""}</div>
      </div>`,
  });
};
ticket("CARLISLE CITY COUNCIL", "Devonshire Walk Car Park", [2026, 4, 17], 3.6, { body: `<div class="c s">ARRIVED 09:12</div><div class="c s">EXPIRES 13:12</div>`, foot: "DISPLAY FACE UP", hard: "no VAT, council parking is exempt", noVat: true });
ticket("NCP", "Viaduct Car Park", [2026, 5, 6], 7.5, { body: `<div class="c s">4 HOURS</div>`, foot: "VAT 234 5566 77" });
ticket("M6 TOLL", "Northbound", [2026, 6, 19], 7.1, { body: `<div class="c s">CLASS 2</div>` });
ticket("CONGESTION CHARGE", "Transport for London", [2026, 7, 3], 15.0, { body: `<div class="c s">VRM LV21 KNX</div>`, hard: "no VAT, a charge not a supply", noVat: true });
ticket("DART CHARGE", "Dartford Crossing", [2026, 8, 7], 2.5, { body: `<div class="c s">VRM LV21 KNX</div>` });
ticket("CARLISLE STATION", "Car Park - 24hr", [2026, 9, 4], 9.0, { body: `<div class="c s">BAY 22</div>` });

// ----------------------------------------------------- trade counter (A5)
const trade = (vendor, addr, no, date, due, lines, opts = {}) => {
  const net = lines.reduce((t, l) => t + l.qty * l.price, 0);
  const vat = Math.round(net * 20) / 100;
  const gross = Math.round((net + vat) * 100) / 100;
  add({
    kind: "a5",
    hard: opts.hard,
    vendor,
    date,
    expect: { vendor, date: uk(date), invoiceNumber: no, net: Math.round(net * 100) / 100, vat, gross, type: "invoice", dueDate: due ? uk(due) : null },
    html: `
      <div class="sheet a5">
        <div class="head"><div><div class="name">${vendor}</div><div class="s">${addr}</div><div class="s">VAT ${opts.vatNo ?? "GB 553 2210 88"}</div></div>
        <div class="r"><div class="doctype">${opts.title ?? "INVOICE"}</div><div class="s">No. ${no}</div><div class="s">${uk(date)}</div></div></div>
        <div class="to s">To: Fragov Services Ltd, Unit 3 Willowholme, Carlisle CA2 5RT${opts.account ? `<br>Account: ${opts.account}` : ""}</div>
        <table>
          <tr><th>Description</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr>
          ${lines.map((l) => `<tr><td>${l.d}</td><td class="r">${l.qty}</td><td class="r">${money(l.price)}</td><td class="r">${money(l.qty * l.price)}</td></tr>`).join("")}
        </table>
        <div class="totals">
          <div class="row"><span>Goods</span><span>&pound;${money(net)}</span></div>
          <div class="row"><span>VAT 20%</span><span>&pound;${money(vat)}</span></div>
          <div class="row b"><span>${opts.dueLabel ?? "Total due"}</span><span>&pound;${money(gross)}</span></div>
        </div>
        <div class="s foot">${due ? `Payment due ${uk(due)}. ` : ""}${opts.terms ?? "E&OE. Goods remain our property until paid for."}</div>
      </div>`,
  });
};
trade("Travis Perkins", "Currock Road, Carlisle CA2 4BN", "TP-884120", [2026, 4, 12], [2026, 5, 12], [
  { d: "Cement 25kg", qty: 10, price: 6.4 }, { d: "Sharp sand bulk bag", qty: 2, price: 48.0 }, { d: "Blocks 100mm", qty: 60, price: 1.95 },
]);
trade("Screwfix", "Kingstown Broadway, Carlisle", "SF-220417", [2026, 5, 8], null, [
  { d: "Cordless drill 18V", qty: 1, price: 119.99 }, { d: "Drill bit set", qty: 1, price: 24.99 },
], { account: "SF-77412", hard: "no due date printed" });
trade("Jewson", "Brunthill Road, Carlisle", "JW/55231", [2026, 6, 4], [2026, 7, 4], [
  { d: "Timber 47x100 3.6m", qty: 24, price: 8.75 }, { d: "OSB3 18mm sheet", qty: 8, price: 28.4 },
]);
trade("Toolstation", "Willowholme, Carlisle", "TS-9910442", [2026, 6, 27], [2026, 7, 27], [
  { d: "Safety boots size 10", qty: 1, price: 42.5 }, { d: "Hi-vis jacket", qty: 2, price: 18.0 }, { d: "Knee pads", qty: 1, price: 14.99 },
]);
trade("City Plumbing", "Junction Street, Carlisle", "CP-117845", [2026, 7, 21], [2026, 8, 21], [
  { d: "Copper pipe 15mm 3m", qty: 12, price: 9.4 }, { d: "Elbow 15mm", qty: 40, price: 0.85 }, { d: "Flux", qty: 2, price: 6.2 },
], { hard: "many small unit prices" });
trade("Edmundson Electrical", "Montgomery Way, Carlisle", "EE-40128", [2026, 8, 13], [2026, 9, 13], [
  { d: "T&E 2.5mm 100m", qty: 2, price: 78.0 }, { d: "Consumer unit 10 way", qty: 1, price: 96.5 },
]);
trade("Howdens", "Kingstown, Carlisle", "HD-77120", [2026, 9, 5], [2026, 10, 5], [
  { d: "Base unit 600mm", qty: 6, price: 54.0 }, { d: "Worktop 3m laminate", qty: 2, price: 89.0 },
]);
trade("SIG Roofing", "Brunthill Road, Carlisle", "SIG-3391", [2026, 3, 19], [2026, 4, 19], [
  { d: "Slate 500x250", qty: 300, price: 1.42 }, { d: "Felt 1m x 10m", qty: 6, price: 22.0 },
], { hard: "large quantity, the line total is the trap" });

// ------------------------------------------------------- full VAT invoice (A4)
const invoice = (vendor, addr, no, date, due, lines, opts = {}) => {
  let net = 0, vat = 0;
  for (const l of lines) { const amt = l.qty * l.price; net += amt; vat += vatOf(amt * 100, l.rate ?? 20); }
  net = Math.round(net * 100) / 100; vat = Math.round(vat * 100) / 100;
  const gross = Math.round((net + vat) * 100) / 100;
  add({
    kind: "a4",
    hard: opts.hard,
    vendor,
    date,
    expect: { vendor, date: uk(date), invoiceNumber: no, net, vat, gross, type: opts.type ?? "invoice", dueDate: due ? uk(due) : null },
    html: `
      <div class="sheet a4">
        <div class="head"><div><div class="name big">${vendor}</div><div class="s">${addr}</div><div class="s">VAT Reg No: ${opts.vatNo ?? "GB 771 4402 55"}</div>${opts.coNo ? `<div class="s">Company No: ${opts.coNo}</div>` : ""}</div>
        <div class="r"><div class="doctype">${opts.title ?? "VAT INVOICE"}</div><div class="s">Invoice No: ${no}</div><div class="s">Date: ${opts.longDate ? long(date) : uk(date)}</div>${due ? `<div class="s">Due: ${uk(due)}</div>` : ""}</div></div>
        <div class="to">Invoice to:<br><b>Fragov Services Ltd</b><br>Unit 3 Willowholme Industrial Estate<br>Carlisle CA2 5RT</div>
        <table>
          <tr><th>Description</th><th class="r">Qty</th><th class="r">Unit</th><th class="r">VAT</th><th class="r">Amount</th></tr>
          ${lines.map((l) => `<tr><td>${l.d}</td><td class="r">${l.qty}</td><td class="r">${money(l.price)}</td><td class="r">${l.rate ?? 20}%</td><td class="r">${money(l.qty * l.price)}</td></tr>`).join("")}
        </table>
        <div class="totals wide">
          <div class="row"><span>Subtotal</span><span>&pound;${money(net)}</span></div>
          <div class="row"><span>VAT</span><span>&pound;${money(vat)}</span></div>
          <div class="row b"><span>Total</span><span>&pound;${money(gross)}</span></div>
        </div>
        <div class="s foot">${opts.foot ?? "Payment by BACS. Sort 20-45-77 Account 40112288. Please quote the invoice number."}</div>
      </div>`,
  });
};
invoice("Northgate Vehicle Hire", "Kingstown Ind Est, Carlisle CA3 0HA", "NVH-2026-4471", [2026, 4, 1], [2026, 4, 30], [{ d: "Van hire, 4 weeks, LWB Transit", qty: 4, price: 210.0 }, { d: "Insurance waiver", qty: 4, price: 28.0 }], { coNo: "04471220" });
invoice("Clarke & Sons Accountants", "12 Lowther Street, Carlisle CA3 8DA", "CS-1188", [2026, 5, 30], [2026, 6, 29], [{ d: "Self Assessment return 2025/26", qty: 1, price: 350.0 }, { d: "Bookkeeping, quarterly", qty: 1, price: 180.0 }], { longDate: true, hard: "date written out in words" });
invoice("Border Skip Hire", "Rockcliffe, Carlisle CA6 4AA", "BSH-9920", [2026, 6, 11], [2026, 6, 25], [{ d: "8 yard skip, 7 day hire", qty: 1, price: 245.0 }, { d: "Permit", qty: 1, price: 35.0 }]);
invoice("Hire Station", "Brunthill Road, Carlisle", "HS-330117", [2026, 7, 14], [2026, 8, 14], [{ d: "Breaker hire, 3 days", qty: 3, price: 48.0 }, { d: "Points and chisels", qty: 1, price: 22.0 }, { d: "Delivery and collection", qty: 1, price: 40.0 }]);
invoice("Mixed Supplies Ltd", "Dalston Road, Carlisle", "MS-7781", [2026, 8, 2], [2026, 9, 1], [{ d: "Insulation board", qty: 20, price: 24.5, rate: 20 }, { d: "Printed safety notices", qty: 100, price: 0.4, rate: 0 }, { d: "Protective overalls", qty: 6, price: 12.0, rate: 20 }], { hard: "two VAT rates on one invoice" });
invoice("Cumbria Signs", "Botcherby, Carlisle", "CSG-4412", [2026, 8, 26], [2026, 9, 26], [{ d: "Van livery, both sides", qty: 1, price: 480.0 }, { d: "Rear door decal", qty: 1, price: 95.0 }]);
invoice("Solway Training", "Rosehill, Carlisle CA1 2RS", "ST-2026-118", [2026, 9, 7], [2026, 10, 7], [{ d: "CSCS card renewal course", qty: 2, price: 165.0 }], { hard: "small invoice, two of one line" });
invoice("Eden Waste Services", "Penrith CA11 9EH", "EWS-55021", [2026, 3, 5], [2026, 4, 5], [{ d: "Waste transfer, 12 months", qty: 1, price: 180.0 }, { d: "Duty of care documentation", qty: 1, price: 25.0 }]);
invoice("Lakeland Fixings", "Workington CA14 3YA", "LF-88213", [2026, 2, 17], [2026, 3, 17], [{ d: "Resin anchors M12", qty: 50, price: 3.2 }, { d: "Wedge anchors M10", qty: 100, price: 1.15 }, { d: "Carriage", qty: 1, price: 9.5 }]);
invoice("Pennine Plant Ltd", "Brampton CA8 1QW", "PP-6640", [2026, 9, 12], [2026, 10, 12], [{ d: "Mini digger 1.5t, weekly", qty: 2, price: 320.0 }, { d: "Transport", qty: 2, price: 65.0 }, { d: "Fuel surcharge", qty: 1, price: 48.75 }]);

// ------------------------------------------------------------------- CIS
const cis = (vendor, no, date, labour, materials, rate, opts = {}) => {
  const net = labour + materials;
  const vat = Math.round(net * 20) / 100;
  const deduction = Math.round(labour * rate) / 100;
  const due = Math.round((net + vat - deduction) * 100) / 100;
  add({
    kind: "a4",
    hard: opts.hard ?? `CIS ${rate}% held back from labour only`,
    vendor,
    date,
    expect: { vendor, date: uk(date), invoiceNumber: no, net: Math.round(net * 100) / 100, vat, gross: Math.round((net + vat) * 100) / 100, cis: deduction, payable: due, type: "invoice" },
    html: `
      <div class="sheet a4">
        <div class="head"><div><div class="name big">${vendor}</div><div class="s">${opts.addr ?? "Unit 7 Kingmoor Park, Carlisle CA6 4SD"}</div><div class="s">VAT Reg No: GB 448 9012 33</div><div class="s">UTR: 4417 822 991</div></div>
        <div class="r"><div class="doctype">INVOICE</div><div class="s">No: ${no}</div><div class="s">${uk(date)}</div></div></div>
        <div class="to">To: Fragov Services Ltd, Carlisle CA2 5RT</div>
        <table>
          <tr><th>Description</th><th class="r">Amount</th></tr>
          <tr><td>Labour &mdash; ${opts.work ?? "groundworks, phase 1"}</td><td class="r">${money(labour)}</td></tr>
          <tr><td>Materials</td><td class="r">${money(materials)}</td></tr>
        </table>
        <div class="totals wide">
          <div class="row"><span>Net</span><span>&pound;${money(net)}</span></div>
          <div class="row"><span>VAT 20%</span><span>&pound;${money(vat)}</span></div>
          <div class="row"><span>Gross</span><span>&pound;${money(Math.round((net + vat) * 100) / 100)}</span></div>
          <div class="row"><span>Less CIS @ ${rate}% on labour</span><span>&minus;&pound;${money(deduction)}</span></div>
          <div class="row b"><span>Payable</span><span>&pound;${money(due)}</span></div>
        </div>
        <div class="s foot">Construction Industry Scheme. Deduction is from labour only; materials are not liable.</div>
      </div>`,
  });
};
cis("J. Hetherington Groundworks", "JH-1142", [2026, 4, 22], 2400, 860, 20);
cis("Border Brickwork", "BB-3301", [2026, 5, 27], 1750, 2240, 20, { work: "blockwork to DPC" });
cis("R. Scott Roofing", "RS-770", [2026, 6, 30], 3100, 1890.5, 30, { hard: "30% rate, unverified subcontractor" });
cis("Eden Joinery", "EJ-2218", [2026, 7, 29], 980, 430.75, 20, { work: "first fix carpentry" });
cis("Cumbria Plastering", "CPL-5512", [2026, 8, 30], 1420, 0, 20, { hard: "labour only, no materials line" });

// ---------------------------------------------------------- handwritten
const hand = (vendor, no, date, lines, opts = {}) => {
  const total = opts.total ?? lines.reduce((t, l) => t + l[1], 0);
  add({
    kind: "a5",
    hard: opts.hard ?? "handwritten, no VAT number",
    vendor,
    date,
    expect: { vendor, date: uk(date), invoiceNumber: no, gross: Math.round(total * 100) / 100, vat: null, type: "invoice" },
    html: `
      <div class="sheet a5 pad">
        <div class="written">
          <div class="hw name">${vendor}</div>
          <div class="hw s">${opts.addr ?? "17 Scotby Road, Carlisle"}</div>
          <div class="hw s">${opts.phone ?? "07700 900412"}</div>
          <div class="hrule"></div>
          <div class="hw">Invoice no ${no}</div>
          <div class="hw">Date ${uk(date)}</div>
          <div class="hw">To: Fragov Services</div>
          <div class="hrule"></div>
          ${lines.map((l) => `<div class="hw row"><span>${l[0]}</span><span>${money(l[1])}</span></div>`).join("")}
          <div class="hrule"></div>
          <div class="hw row big"><span>TOTAL</span><span>&pound;${money(total)}</span></div>
          <div class="hw s">${opts.foot ?? "Cash or bank transfer please"}</div>
        </div>
      </div>`,
  });
};
hand("A. Murray Gardening", "112", [2026, 4, 6], [["Clearing site", 180], ["Waste removal", 65]]);
hand("Dave's Van Repairs", "77", [2026, 5, 11], [["Brake pads + fitting", 145], ["Oil change", 55], ["MOT prep", 40]]);
hand("S. Bell Window Cleaning", "8", [2026, 6, 15], [["Monthly clean x3", 90]], { hard: "very short, number is one digit" });
hand("Tommy Fix Ltd", "4419", [2026, 7, 20], [["Labour 3 days", 540], ["Materials", 212.4], ["Skip", 180]], { total: 940, hard: "the lines do not add up to the printed total" });
hand("K. Walsh Haulage", "301", [2026, 8, 18], [["Delivery Carlisle-Leeds", 320], ["Waiting time 2hr", 70]], { addr: "Unit 2 Kingmoor, Carlisle", phone: "07700 900855" });
hand("Old Mill Joinery", "26", [2026, 1, 9], [["Made to measure door", 285], ["Fitting", 120]], { hard: "old date, previous tax year" });

// ------------------------------------------------------------ restaurant
const restaurant = (vendor, place, date, lines, opts = {}) => {
  const sub = lines.reduce((t, l) => t + l[1], 0);
  const service = opts.service ?? 0;
  const gross = Math.round((sub + service) * 100) / 100;
  add({
    kind: "till",
    width: 80,
    hard: opts.hard ?? "optional service charge added after the total",
    vendor,
    date,
    expect: { vendor, date: uk(date), gross, vat: Math.round((gross - gross / 1.2) * 100) / 100, type: "receipt" },
    html: `
      <div class="till">
        <div class="c b">${vendor}</div>
        <div class="c s">${place}</div>
        <div class="c s">Table ${opts.table ?? 6} &middot; ${opts.covers ?? 2} covers</div>
        <div class="rule"></div>
        ${lines.map((l) => `<div class="row"><span>${l[0]}</span><span>${money(l[1])}</span></div>`).join("")}
        <div class="rule"></div>
        <div class="row"><span>Subtotal</span><span>${money(sub)}</span></div>
        ${service ? `<div class="row"><span>Service 12.5%</span><span>${money(service)}</span></div>` : ""}
        <div class="row big"><span>TOTAL</span><span>${money(gross)}</span></div>
        <div class="c s">VAT incl @ 20% &middot; GB 337 9911 04</div>
        <div class="c s">${uk(date)} ${opts.time ?? "13:04"}</div>
        ${opts.tipLine ? `<div class="rule"></div><div class="row s"><span>Tip</span><span>________</span></div><div class="row s"><span>Total</span><span>________</span></div>` : ""}
      </div>`,
  });
};
restaurant("The Crown Inn", "Wetheral, Carlisle", [2026, 4, 25], [["Steak pie", 14.5], ["Fish & chips", 13.95], ["2 x Coke", 5.0]], { service: 4.18 });
restaurant("Nawab", "Botchergate, Carlisle", [2026, 5, 29], [["Chicken korma", 11.95], ["Pilau rice", 3.5], ["Naan", 3.2], ["Lager", 4.6]], { tipLine: true, hard: "blank tip and total lines below the real total" });
restaurant("Cafe Solo", "Warwick Road", [2026, 6, 18], [["Breakfast x2", 17.0], ["Coffee x2", 5.4]], { time: "08:22" });
restaurant("Wetherspoons", "The Woodrow Wilson", [2026, 7, 26], [["Burger meal", 9.49], ["Pint", 3.95]], { table: 41 });
restaurant("Pizza Express", "English Street", [2026, 9, 3], [["Margherita", 12.45], ["Dough balls", 5.95], ["Sparkling water", 3.1]], { service: 2.69 });

// ----------------------------------------------------------- credit notes
const credit = (vendor, no, date, against, lines, opts = {}) => {
  const net = lines.reduce((t, l) => t + l.qty * l.price, 0);
  const vat = Math.round(net * 20) / 100;
  add({
    kind: "a5",
    hard: opts.hard ?? "a credit note: every amount must be stored negative",
    vendor,
    date,
    expect: { vendor, date: uk(date), invoiceNumber: no, net: -Math.round(net * 100) / 100, vat: -vat, gross: -Math.round((net + vat) * 100) / 100, type: "credit_note" },
    html: `
      <div class="sheet a5">
        <div class="head"><div><div class="name">${vendor}</div><div class="s">VAT GB 553 2210 88</div></div>
        <div class="r"><div class="doctype red">CREDIT NOTE</div><div class="s">No. ${no}</div><div class="s">${uk(date)}</div></div></div>
        <div class="to s">Against invoice ${against}</div>
        <table>
          <tr><th>Description</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr>
          ${lines.map((l) => `<tr><td>${l.d}</td><td class="r">${l.qty}</td><td class="r">${money(l.price)}</td><td class="r">${money(l.qty * l.price)}</td></tr>`).join("")}
        </table>
        <div class="totals">
          <div class="row"><span>Goods</span><span>&pound;${money(net)}</span></div>
          <div class="row"><span>VAT 20%</span><span>&pound;${money(vat)}</span></div>
          <div class="row b"><span>${opts.label ?? "Total credited"}</span><span>&pound;${money(Math.round((net + vat) * 100) / 100)}</span></div>
        </div>
        <div class="s foot">${opts.foot ?? "This is a credit note. Do not pay."}</div>
      </div>`,
  });
};
credit("Travis Perkins", "CN-4471", [2026, 4, 29], "TP-884120", [{ d: "Blocks 100mm returned", qty: 20, price: 1.95 }]);
credit("Jewson", "JW/CN/881", [2026, 6, 20], "JW/55231", [{ d: "OSB3 18mm damaged", qty: 2, price: 28.4 }]);
credit("City Plumbing", "CP-CR-220", [2026, 8, 1], "CP-117845", [{ d: "Copper pipe over-supplied", qty: 4, price: 9.4 }], { hard: "the word CREDIT appears only once, small" });
credit("Toolstation", "TS-CN-5512", [2026, 8, 24], "TS-9910442", [{ d: "Hi-vis jacket wrong size", qty: 1, price: 18.0 }]);
credit("Pennine Plant Ltd", "PP-CN-118", [2026, 9, 18], "PP-6640", [{ d: "Transport charged twice", qty: 1, price: 65.0 }], { label: "Amount refunded" });

// ------------------------------------------------------- foreign currency
const foreign = (vendor, addr, no, date, symbol, code, lines, opts = {}) => {
  const net = lines.reduce((t, l) => t + l.qty * l.price, 0);
  const tax = Math.round(net * (opts.rate ?? 21)) / 100;
  add({
    kind: "a5",
    hard: opts.hard ?? `${code}, not sterling: a rate has to be fetched for the date`,
    vendor,
    date,
    expect: { vendor, date: uk(date), invoiceNumber: no, currency: code, gross: Math.round((net + tax) * 100) / 100, type: "invoice" },
    html: `
      <div class="sheet a5">
        <div class="head"><div><div class="name">${vendor}</div><div class="s">${addr}</div><div class="s">${opts.taxLabel ?? "BTW/TVA"} ${opts.taxNo ?? "NL 8812 4471 B01"}</div></div>
        <div class="r"><div class="doctype">${opts.title ?? "INVOICE"}</div><div class="s">${no}</div><div class="s">${opts.dateFmt ? opts.dateFmt : uk(date)}</div></div></div>
        <table>
          <tr><th>Description</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr>
          ${lines.map((l) => `<tr><td>${l.d}</td><td class="r">${l.qty}</td><td class="r">${symbol}${money(l.price)}</td><td class="r">${symbol}${money(l.qty * l.price)}</td></tr>`).join("")}
        </table>
        <div class="totals">
          <div class="row"><span>Net</span><span>${symbol}${money(net)}</span></div>
          <div class="row"><span>${opts.taxLabel ?? "VAT"} ${opts.rate ?? 21}%</span><span>${symbol}${money(tax)}</span></div>
          <div class="row b"><span>Total ${code}</span><span>${symbol}${money(Math.round((net + tax) * 100) / 100)}</span></div>
        </div>
      </div>`,
  });
};
foreign("Van Dijk Gereedschap BV", "Rotterdam, Netherlands", "NL-2026-4412", [2026, 5, 4], "€", "EUR", [{ d: "Pneumatic wrench", qty: 1, price: 289.0 }, { d: "Shipping", qty: 1, price: 42.0 }]);
foreign("Schmidt Werkzeuge GmbH", "München, Germany", "DE-88120", [2026, 6, 26], "€", "EUR", [{ d: "Laser level", qty: 1, price: 410.0 }], { rate: 19, taxLabel: "MwSt", taxNo: "DE 224 118 990" });
foreign("Northline Tools Inc", "Buffalo, NY, USA", "US-55120", [2026, 7, 11], "$", "USD", [{ d: "Impact driver kit", qty: 1, price: 219.0 }, { d: "Freight", qty: 1, price: 88.0 }], { rate: 0, taxLabel: "Sales tax", taxNo: "n/a", dateFmt: "07/11/2026", hard: "US date order: 07/11/2026 is 11 July, not 7 November" });
foreign("Dublin Site Supplies Ltd", "Dublin 12, Ireland", "IE-7741", [2026, 8, 9], "€", "EUR", [{ d: "Scaffold boards", qty: 30, price: 18.5 }], { rate: 23, taxLabel: "VAT", taxNo: "IE 4471220T" });
foreign("Zurich Precision AG", "Zürich, Switzerland", "CH-2026-77", [2026, 9, 15], "CHF ", "CHF", [{ d: "Measuring instrument", qty: 1, price: 640.0 }], { rate: 8, taxLabel: "MWST", taxNo: "CHE-114.221.880" });

// --------------------------------------------------- not a bill at all
// The reader must refuse these rather than file them as something owed.
const notABill = (title, vendor, date, body, why) => {
  add({
    kind: "a5",
    hard: why,
    vendor,
    date,
    expect: { vendor, date: uk(date), type: "other", shouldNotBeFiledAsBill: true },
    html: `
      <div class="sheet a5">
        <div class="head"><div><div class="name">${vendor}</div><div class="s">VAT GB 771 4402 55</div></div>
        <div class="r"><div class="doctype">${title}</div><div class="s">${uk(date)}</div></div></div>
        ${body}
        <div class="s foot">This document is for information. ${title === "STATEMENT" ? "Do not pay from this statement." : ""}</div>
      </div>`,
  });
};
notABill("STATEMENT", "Travis Perkins", [2026, 6, 30],
  `<table><tr><th>Date</th><th>Ref</th><th class="r">Charge</th><th class="r">Paid</th><th class="r">Balance</th></tr>
   <tr><td>12/04/2026</td><td>TP-884120</td><td class="r">309.60</td><td class="r">309.60</td><td class="r">0.00</td></tr>
   <tr><td>29/04/2026</td><td>CN-4471</td><td class="r">-46.80</td><td class="r">0.00</td><td class="r">-46.80</td></tr>
   <tr><td>03/06/2026</td><td>TP-891044</td><td class="r">522.00</td><td class="r">0.00</td><td class="r">475.20</td></tr></table>
   <div class="totals"><div class="row b"><span>Balance owing</span><span>&pound;475.20</span></div></div>`,
  "a statement, not an invoice: filing it would double-count invoices already entered");
notABill("DELIVERY NOTE", "Jewson", [2026, 6, 4],
  `<table><tr><th>Description</th><th class="r">Qty</th></tr><tr><td>Timber 47x100 3.6m</td><td class="r">24</td></tr><tr><td>OSB3 18mm sheet</td><td class="r">8</td></tr></table>
   <div class="s">No prices shown. Goods received in good condition.</div><div class="sign">Signature: ____________________</div>`,
  "a delivery note with no prices: nothing to file");
notABill("QUOTATION", "Cumbria Signs", [2026, 8, 14],
  `<table><tr><th>Description</th><th class="r">Amount</th></tr><tr><td>Full van wrap</td><td class="r">1,240.00</td></tr></table>
   <div class="totals"><div class="row b"><span>Estimate total</span><span>&pound;1,488.00 inc VAT</span></div></div>
   <div class="s">Valid 30 days. This is an estimate, not an invoice.</div>`,
  "a quotation: money not yet owed");
notABill("PRO FORMA", "Lakeland Fixings", [2026, 9, 10],
  `<table><tr><th>Description</th><th class="r">Amount</th></tr><tr><td>Resin anchors M12 x 100</td><td class="r">320.00</td></tr></table>
   <div class="totals"><div class="row b"><span>Pro forma total</span><span>&pound;384.00</span></div></div>
   <div class="s">Payment in advance. A VAT invoice will follow on payment.</div>`,
  "pro forma: a VAT invoice will follow, so filing both double-counts");

// ------------------------------------------------------------- utilities
const bill = (vendor, no, date, due, period, lines, opts = {}) => {
  const net = lines.reduce((t, l) => t + l[1], 0);
  const rate = opts.rate ?? 20;
  const vat = Math.round(net * rate) / 100;
  add({
    kind: "a4",
    hard: opts.hard ?? "a period, not a date: the bill date is easily confused with the period",
    vendor,
    date,
    expect: { vendor, date: uk(date), invoiceNumber: no, net: Math.round(net * 100) / 100, vat, gross: Math.round((net + vat) * 100) / 100, dueDate: uk(due), type: "invoice" },
    html: `
      <div class="sheet a4">
        <div class="head"><div><div class="name big">${vendor}</div><div class="s">${opts.addr ?? "PO Box 1122, Sunderland SR1 1AA"}</div><div class="s">VAT ${opts.vatNo ?? "GB 220 4417 88"}</div></div>
        <div class="r"><div class="doctype">${opts.title ?? "BILL"}</div><div class="s">Account ${opts.account ?? "8812447"}</div><div class="s">Bill number ${no}</div><div class="s">Bill date ${uk(date)}</div></div></div>
        <div class="to">For: Fragov Services Ltd, Unit 3 Willowholme, Carlisle CA2 5RT<br><b>Period: ${period}</b></div>
        <table>
          <tr><th>Charge</th><th class="r">Amount</th></tr>
          ${lines.map((l) => `<tr><td>${l[0]}</td><td class="r">${money(l[1])}</td></tr>`).join("")}
        </table>
        <div class="totals wide">
          <div class="row"><span>Charges</span><span>&pound;${money(net)}</span></div>
          <div class="row"><span>VAT ${rate}%</span><span>&pound;${money(vat)}</span></div>
          <div class="row b"><span>Amount due by ${uk(due)}</span><span>&pound;${money(Math.round((net + vat) * 100) / 100)}</span></div>
        </div>
        <div class="s foot">${opts.foot ?? "Paid by Direct Debit. No action needed."}</div>
      </div>`,
  });
};
bill("Northern Power", "NP-8841-0426", [2026, 4, 28], [2026, 5, 14], "01 Mar 2026 to 31 Mar 2026", [["Electricity, unit 4 workshop", 182.4], ["Standing charge", 14.6]], { rate: 5, hard: "5% VAT, not 20%" });
bill("Cumbria Water", "CW-220115", [2026, 5, 20], [2026, 6, 10], "Q1 2026", [["Water supply", 96.0], ["Waste water", 64.5]], { rate: 0, hard: "water is zero-rated: VAT is 0.00 and that is correct" });
bill("EE Business", "EE-77120448", [2026, 6, 6], [2026, 6, 20], "06 May to 05 Jun 2026", [["Mobile, 3 lines", 63.0], ["Data add-on", 10.0], ["Calls outside plan", 4.82]]);
bill("Virgin Media Business", "VMB-55210", [2026, 7, 5], [2026, 7, 19], "Jul 2026", [["Broadband 500Mb", 42.0], ["Static IP", 5.0]]);

// ----------------------------------------------------- online / emailed
const online = (vendor, no, date, lines, opts = {}) => {
  const net = lines.reduce((t, l) => t + l[1], 0);
  const vat = Math.round(net * 20) / 100;
  add({
    kind: "a5",
    hard: opts.hard ?? "an emailed receipt printed out: no letterhead, plain layout",
    vendor,
    date,
    expect: { vendor, date: uk(date), invoiceNumber: no, net: Math.round(net * 100) / 100, vat, gross: Math.round((net + vat) * 100) / 100, type: "receipt" },
    html: `
      <div class="sheet a5 plain">
        <div class="email">
          <div class="s">From: billing@${opts.domain ?? "example"}.com</div>
          <div class="s">Subject: Your receipt from ${vendor}</div>
          <div class="hrule"></div>
          <div class="name">${vendor}</div>
          <div class="s">Receipt ${no} &middot; ${uk(date)}</div>
          <div class="hrule"></div>
          ${lines.map((l) => `<div class="row"><span>${l[0]}</span><span>&pound;${money(l[1])}</span></div>`).join("")}
          <div class="hrule"></div>
          <div class="row"><span>VAT 20%</span><span>&pound;${money(vat)}</span></div>
          <div class="row b"><span>Paid</span><span>&pound;${money(Math.round((net + vat) * 100) / 100)}</span></div>
          <div class="s">Paid by card ending 4417. ${opts.foot ?? "This is your VAT receipt."}</div>
        </div>
      </div>`,
  });
};
online("Amazon Business", "AMZ-2026-771204", [2026, 4, 19], [["Storage boxes x4", 31.96], ["Label printer", 64.0]], { domain: "amazon" });
online("Dropbox Business", "DBX-118240", [2026, 5, 1], [["Standard, 3 users, monthly", 36.0]], { domain: "dropbox" });
online("Adobe", "ADB-5512094", [2026, 6, 1], [["Acrobat Pro, monthly", 15.17]], { domain: "adobe" });
online("Screwfix Online", "SFO-9920117", [2026, 7, 23], [["Site light 110V", 78.0], ["Extension lead", 22.5], ["Delivery", 5.0]], { domain: "screwfix" });
online("Vistaprint", "VP-441028", [2026, 8, 28], [["Business cards x500", 34.0], ["Flyers A5 x1000", 78.0]], { domain: "vistaprint", hard: "the flyer order for the depots, as it happens" });

// -------------------------------------------------- deliberately awkward
add({
  id: `D-${String(n + 1).padStart(3, "0")}`,
  kind: "a5",
  hard: "no year on the date at all",
  vendor: "P. Nixon Fencing",
  date: [2026, 5, 16],
  expect: { vendor: "P. Nixon Fencing", date: null, gross: 640.0, type: "invoice", note: "date prints as 16 May with no year: must be asked, never assumed" },
  html: `
    <div class="sheet a5">
      <div class="head"><div><div class="name">P. Nixon Fencing</div><div class="s">Dalston, Carlisle</div></div>
      <div class="r"><div class="doctype">INVOICE</div><div class="s">No. 55</div><div class="s">16 May</div></div></div>
      <table><tr><th>Description</th><th class="r">Amount</th></tr><tr><td>Close board fencing, 18m</td><td class="r">540.00</td></tr><tr><td>Concrete posts</td><td class="r">100.00</td></tr></table>
      <div class="totals"><div class="row b"><span>Total</span><span>&pound;640.00</span></div></div>
      <div class="s foot">Not VAT registered.</div>
    </div>`,
});
n += 1;

add({
  id: `D-${String(n + 1).padStart(3, "0")}`,
  kind: "a5",
  hard: "two totals on one document: one before a discount, one after",
  vendor: "Border Fixings",
  date: [2026, 7, 2],
  expect: { vendor: "Border Fixings", date: "02/07/2026", gross: 235.2, type: "invoice", note: "the payable figure is the one after the discount" },
  html: `
    <div class="sheet a5">
      <div class="head"><div><div class="name">Border Fixings</div><div class="s">VAT GB 118 2204 77</div></div>
      <div class="r"><div class="doctype">INVOICE</div><div class="s">BF-7720</div><div class="s">02/07/2026</div></div></div>
      <table><tr><th>Description</th><th class="r">Amount</th></tr><tr><td>Fixings, assorted</td><td class="r">220.00</td></tr></table>
      <div class="totals">
        <div class="row"><span>Goods</span><span>&pound;220.00</span></div>
        <div class="row"><span>Total before discount</span><span>&pound;264.00</span></div>
        <div class="row"><span>Settlement discount 10%</span><span>&minus;&pound;28.80</span></div>
        <div class="row b"><span>Pay this amount</span><span>&pound;235.20</span></div>
      </div>
    </div>`,
});
n += 1;

add({
  id: `D-${String(n + 1).padStart(3, "0")}`,
  kind: "till",
  width: 80,
  hard: "reverse charge: VAT shown as zero with a note, not an error",
  vendor: "Kirk Construction Services",
  date: [2026, 8, 6],
  expect: { vendor: "Kirk Construction Services", date: "06/08/2026", gross: 1850.0, vat: 0, type: "invoice", note: "domestic reverse charge, customer accounts for the VAT" },
  html: `
    <div class="till">
      <div class="c b">KIRK CONSTRUCTION SERVICES</div>
      <div class="c s">VAT GB 990 1122 33</div>
      <div class="rule"></div>
      <div class="row"><span>Site labour</span><span>1850.00</span></div>
      <div class="rule"></div>
      <div class="row big"><span>TOTAL</span><span>1850.00</span></div>
      <div class="row s"><span>VAT</span><span>0.00</span></div>
      <div class="c s">Domestic reverse charge applies. Customer to account for VAT to HMRC.</div>
      <div class="c s">06/08/2026</div>
    </div>`,
});
n += 1;

// ------------------------------------------ things that test the app, not the eye
// A reading can be perfect and the app still wrong: a duplicate filed twice, a
// paid bill chased for payment, an exempt supply given 20% VAT.
trade("Travis Perkins", "Currock Road, Carlisle CA2 4BN", "TP-884120", [2026, 4, 12], [2026, 5, 12], [
  { d: "Cement 25kg", qty: 10, price: 6.4 }, { d: "Sharp sand bulk bag", qty: 2, price: 48.0 }, { d: "Blocks 100mm", qty: 60, price: 1.95 },
], { hard: "a second copy of D-021, same number and total: must be caught as a duplicate, not filed twice" });
invoice("Solway Tyres", "Willowholme, Carlisle CA2 5RT", "SWT-44120", [2026, 5, 22], null, [{ d: "Van tyres 215/65 R16C", qty: 4, price: 118.0 }, { d: "Fitting and balancing", qty: 4, price: 12.0 }], { hard: "stamped PAID: the app must not then chase it for payment", foot: "PAID IN FULL BY CARD, 22/05/2026. THIS IS YOUR RECEIPT." });
invoice("Kingmoor Motors", "Kingstown, Carlisle", "KM-77211", [2026, 6, 13], [2026, 7, 13], [{ d: "Van service, full", qty: 1, price: 285.0 }, { d: "MOT", qty: 1, price: 54.85, rate: 0 }, { d: "Brake discs and pads", qty: 1, price: 219.4 }], { hard: "MOT is outside the scope of VAT while the rest is standard-rated" });
invoice("Cumberland Insurance Brokers", "Lowther Street, Carlisle CA3 8DA", "CIB-2026-881", [2026, 4, 5], [2026, 4, 19], [{ d: "Commercial van policy, 12 months", qty: 1, price: 1240.0, rate: 0 }, { d: "Public liability, 12 months", qty: 1, price: 385.0, rate: 0 }], { hard: "insurance is exempt: no VAT at all, and IPT is not VAT", foot: "Insurance Premium Tax included where applicable. IPT is not recoverable as VAT." });
invoice("Fleet Finance Ltd", "Leeds LS1 4AP", "FF-2026-04-118", [2026, 4, 1], [2026, 4, 8], [{ d: "Vehicle lease, monthly, LV21 KNX", qty: 1, price: 389.0 }, { d: "Maintenance package", qty: 1, price: 62.0 }], { hard: "one of twelve identical monthly invoices: only the number and date differ" });
invoice("Border Scaffolding", "Dalston Road, Carlisle", "BSC-9912", [2026, 7, 6], [2026, 8, 6], [{ d: "Scaffold erect, 3 storey frontage", qty: 1, price: 1850.0 }, { d: "Hire, first 4 weeks", qty: 1, price: 420.0 }, { d: "Dismantle", qty: 1, price: 480.0 }]);
invoice("Safety First Supplies", "Workington CA14 3YA", "SFS-44021", [2026, 8, 17], [2026, 9, 17], [{ d: "Hard hats", qty: 8, price: 9.5 }, { d: "Safety boots", qty: 4, price: 48.0, rate: 0 }, { d: "Gloves, box of 50", qty: 2, price: 34.0 }], { hard: "protective boots are zero-rated, hard hats are not" });
invoice("M. Reed Mobile Welding", "Brampton CA8 1SH", "MRW-118", [2026, 9, 8], [2026, 9, 22], [{ d: "On-site welding, gates and railings", qty: 1, price: 640.0 }, { d: "Callout", qty: 1, price: 85.0 }]);
invoice("Sage", "Newcastle upon Tyne NE13 9AA", "SGE-2026-77412", [2026, 3, 1], [2026, 3, 15], [{ d: "Accounting subscription, 12 months in advance", qty: 1, price: 336.0 }], { hard: "a year paid up front: the cost belongs to twelve months, not to March" });
invoice("Border Aggregates", "Longtown CA6 5NA", "BA-55120", [2026, 6, 9], [2026, 7, 9], [{ d: "MOT Type 1, 20 tonne loads", qty: 14, price: 218.0 }, { d: "Haulage", qty: 14, price: 96.0 }], { hard: "five figures: a total far larger than anything else in the pile" });
invoice("Goodwill Repairs Ltd", "Carlisle CA1 2RW", "GR-0042", [2026, 8, 11], null, [{ d: "Remedial work, under warranty", qty: 1, price: 0.0 }], { hard: "a zero total: nothing is owed and nothing should be filed as owing", foot: "No charge. Issued for your records." });
till("Fell View Stores", "Caldbeck, Wigton", [2026, 5, 24], [["TEA 80 BAGS", 3.49], ["SUGAR 1KG", 1.29], ["MILK 4PT", 1.75]], { hard: "VAT included but never stated: no VAT line anywhere", noVat: true, vatNo: "not shown" });
till("Quick Stop", "Harraby, Carlisle", [2026, 7, 31], [["SANDWICH", 3.25], ["DRINK", 1.5], ["CRISPS", 1.0]], { hard: "faded thermal print, the fourth line has almost gone", faded: true });
till("Lune Valley Cafe", "M6 J36", [2026, 8, 15], [["BREAKFAST", 8.95], ["TEA", 1.8]], { hard: "printed white on black: inverted, which defeats most thresholding", invert: true });
hand("B. Little Groundcare", "19", [2026, 6, 21], [["Hedge cutting", 240], ["Green waste", 60]], { hard: "handwritten, and a note scrawled across it after the fact", foot: "PAID CASH 21/6 - thanks B" });
hand("Nixon & Son", "88", [2026, 9, 19], [["Repair to flat roof", 480], ["Materials", 165.5]], { hard: "handwritten with a total that reads either 645.50 or 845.50" });

// ------------------------------------------------------------ the sheet
const CSS = `
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Helvetica Neue", Arial, sans-serif; color: #111; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .flow { display: flex; flex-wrap: wrap; align-content: flex-start; gap: 6mm; }
  .cut { border: 1px dashed #aaa; padding: 3mm; background: #fff; break-inside: avoid; }
  .stamp { font-size: 6pt; color: #999; letter-spacing: .5px; text-align: center; padding-top: 1.5mm; border-top: 1px dotted #ddd; margin-top: 2mm; }
  .till { font-family: "Courier New", monospace; font-size: 8.5pt; line-height: 1.35; }
  /* Real difficulty, printed in: a receipt that has sat in a glovebox, and the
     dot-matrix tills that print light on dark. Both defeat simple thresholding. */
  .till.faded { color: #9a9a9a; }
  .till.faded .s { color: #b4b4b4; }
  .till.invert { background: #111; color: #f2f2f2; padding: 3mm; }
  .till.invert .s { color: #ccc; }
  .till.invert .rule { border-top-color: #777; }
  .till .c { text-align: center; }
  .till .b, .b { font-weight: 700; }
  .till .s, .s { font-size: 7pt; color: #444; }
  .rule { border-top: 1px dashed #999; margin: 1.5mm 0; }
  .hrule { border-top: 1px solid #bbb; margin: 2mm 0; }
  .row { display: flex; justify-content: space-between; gap: 4mm; }
  .row.big { font-size: 11pt; font-weight: 700; }
  .ticket { font-family: "Courier New", monospace; font-size: 8pt; text-align: center; }
  .ticket .amount { font-size: 15pt; font-weight: 700; margin: 3mm 0; }
  .sheet { font-size: 9pt; }
  .sheet.a5 { width: 132mm; }
  .sheet.a4 { width: 190mm; font-size: 10pt; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 2mm; margin-bottom: 3mm; }
  .name { font-size: 13pt; font-weight: 700; }
  .name.big { font-size: 17pt; }
  .doctype { font-size: 12pt; font-weight: 700; letter-spacing: 1px; }
  .doctype.red { color: #b00; }
  .r { text-align: right; }
  .to { margin: 3mm 0; }
  table { width: 100%; border-collapse: collapse; margin: 3mm 0; }
  th { text-align: left; border-bottom: 1px solid #111; padding: 1mm 2mm 1mm 0; font-size: 8pt; text-transform: uppercase; }
  td { padding: 1.2mm 2mm 1.2mm 0; border-bottom: 1px solid #eee; }
  .totals { margin-left: auto; width: 62mm; }
  .totals.wide { width: 78mm; }
  .totals .row { padding: .8mm 0; }
  .totals .row.b { border-top: 1.5px solid #111; padding-top: 1.5mm; font-size: 11pt; }
  .foot { margin-top: 4mm; color: #444; }
  .pad { background: #fffef7; }
  .written { font-family: "Bradley Hand", "Segoe Script", "Comic Sans MS", cursive; font-size: 11pt; line-height: 1.6; }
  .written .name { font-size: 15pt; }
  .written .s { font-size: 9pt; }
  .plain .email { font-family: Arial, sans-serif; font-size: 9pt; }
  .sign { margin-top: 8mm; }
  .cover { font-family: Arial, sans-serif; padding: 10mm; }
  .cover h1 { font-size: 20pt; margin: 0 0 4mm; }
  .cover p { font-size: 10pt; line-height: 1.5; max-width: 150mm; }
  .cover td, .cover th { font-size: 8pt; }
`;

// A4 documents take a page each; everything small flows and is cut out.
const pages = [];
let flow = [];
let used = 0;
const CAP = 250; // mm of usable height per page, roughly
const heightOf = (d) => (d.kind === "till" ? 95 : d.kind === "ticket" ? 115 : 105);
for (const d of docs) {
  const box = `<div class="cut" style="${d.width ? `width:${d.width}mm;` : ""}">${d.html}<div class="stamp">FAKE TEST DOCUMENT &middot; ${d.id}</div></div>`;
  if (d.kind === "a4") {
    if (flow.length) { pages.push(`<div class="page"><div class="flow">${flow.join("")}</div></div>`); flow = []; used = 0; }
    pages.push(`<div class="page">${box}</div>`);
    continue;
  }
  const h = heightOf(d);
  if (used + h > CAP && flow.length) { pages.push(`<div class="page"><div class="flow">${flow.join("")}</div></div>`); flow = []; used = 0; }
  flow.push(box);
  used += d.kind === "a5" ? h : h / 2;
}
if (flow.length) pages.push(`<div class="page"><div class="flow">${flow.join("")}</div></div>`);

const cover = `
  <div class="page cover">
    <h1>${docs.length} fake documents, for testing the scanner</h1>
    <p><b>Every sheet on the following pages is invented.</b> No supplier, customer, address,
    VAT number or amount here belongs to a real business, and nothing here records a real
    transaction. They exist so the reader can be tested against the kinds of paper it will
    actually meet.</p>
    <p>Print on A4, cut along the dashed lines, and crumple them — a flat sheet under a desk
    lamp is not the test. Each carries its id in small print at the foot, which matches
    <code>expected.json</code>, so a cut-out pile can still be checked.</p>
    <p><b>A document the reader cannot manage is the most useful sheet in the pile.</b> Write
    down what it got wrong, not just that it failed.</p>
    <table>
      <tr><th>Kind</th><th>How many</th><th>What makes it hard</th></tr>
      ${Object.entries(docs.reduce((m, d) => { const k = d.kind === "till" ? "narrow receipt" : d.kind === "ticket" ? "small ticket" : d.kind === "a4" ? "full page" : "half page"; m[k] = (m[k] || 0) + 1; return m; }, {}))
        .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td><td class="s">see expected.json</td></tr>`).join("")}
    </table>
  </div>`;

fs.mkdirSync(OUT, { recursive: true });
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${cover}${pages.join("")}</body></html>`;
fs.writeFileSync(OUT + "documents.html", html);

fs.writeFileSync(OUT + "expected.json", JSON.stringify(docs.map((d) => ({ id: d.id, kind: d.kind, hard: d.hard ?? null, ...d.expect })), null, 2));

fs.writeFileSync(OUT + "index.md", `# The ${docs.length} test documents

Generated by \`harness/gen-test-documents.mjs\`. Every one is invented and every printed
sheet says so. \`expected.json\` holds what a correct reading looks like, keyed by the id
printed at the foot of each document.

Print \`documents.pdf\` on A4, cut along the dashed lines, and age them by hand — a flat
sheet under a lamp is not the test. **Write down what a failure got wrong, not just that it
failed**; that list is what the next scanner work is built from.

| id | what it is | what makes it hard |
|---|---|---|
${docs.map((d) => `| ${d.id} | ${d.vendor} | ${d.hard ?? "straightforward, a control"} |`).join("\n")}
`);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle0" });
await page.pdf({ path: OUT + "documents.pdf", format: "A4", printBackground: true, preferCSSPageSize: true });
await browser.close();

console.log(JSON.stringify({ documents: docs.length, pages: pages.length + 1, out: OUT }));
