// Bringing customers and suppliers in from a file: the rules imported from
// the app (src/lib/contactImport.ts), not copied. What matters is that the
// exports people actually have are read into the right boxes, that nothing is
// added twice, and that the account's own name is never offered back to it.
import { parseCsv } from "./gen/lib/convert.js";
import { fileWay, fromRows, fromScanned, fromVcf, settle, toClient } from "./gen/lib/contactImport.js";
import { NOT_EXCEL, readXlsx } from "./gen/lib/xlsx.js";
import { makeXlsx } from "./xlsx-fixture.mjs";

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const rows = (csv) => fromRows(parseCsv(csv));

// ---- Xero: *ContactName, two addresses (PO and SA) ---------------------------
const xero = rows(`*ContactName,EmailAddress,FirstName,LastName,POAddressLine1,POAddressLine2,POCity,PORegion,POPostalCode,POCountry,SAAddressLine1,SACity,SAPostalCode,PhoneNumber,TaxNumber
Skido Logistics Ltd,accounts@skido.example,Jana,Novak,Unit 4,Kingmoor Park,Carlisle,Cumbria,CA6 4SJ,United Kingdom,Elsewhere 9,Leeds,LS1 1AA,01228 000000,GB123456789
`);
check("Xero: one contact", xero.length === 1, xero.length);
check("Xero: the business name, not *ContactName's star", xero[0]?.name === "Skido Logistics Ltd", xero[0]?.name);
check("Xero: the person goes in contact person", xero[0]?.contactPerson === "Jana Novak", xero[0]?.contactPerson);
check("Xero: the postal address only, UK left off", xero[0]?.address === "Unit 4\nKingmoor Park\nCarlisle\nCumbria\nCA6 4SJ", JSON.stringify(xero[0]?.address));
check("Xero: email, phone and VAT number", xero[0]?.email === "accounts@skido.example" && xero[0]?.phone === "01228 000000" && xero[0]?.vatNumber === "GB123456789");
check("Xero: a Ltd is a company", xero[0]?.isCompany === true);

// ---- FreeAgent: Organisation plus first and last name ------------------------
const fa = rows(`Organisation,First name,Last name,Email,Address 1,Address 2,Town,Region,Postcode,Country,VAT Registration Number
,Sam,Hughes,sam@example.com,2 High St,,Penrith,,CA11 7AA,France,
Acme Builders,Pat,Lee,pat@acme.example,,,,,,,
`);
check("FreeAgent: a person with no organisation is named as themselves", fa[0]?.name === "Sam Hughes" && fa[0]?.isCompany === false && fa[0]?.contactPerson === "", JSON.stringify(fa[0]));
check("FreeAgent: a country other than the UK is kept", fa[0]?.address.endsWith("France"), JSON.stringify(fa[0]?.address));
check("FreeAgent: blank address lines leave no gaps", !fa[0]?.address.includes("\n\n"));
check("FreeAgent: an organisation is the name, the person its contact", fa[1]?.name === "Acme Builders" && fa[1]?.contactPerson === "Pat Lee" && fa[1]?.isCompany);

// ---- Google Contacts --------------------------------------------------------
const google = rows(`First Name,Last Name,Organization Name,E-mail 1 - Label,E-mail 1 - Value,Phone 1 - Label,Phone 1 - Value,Address 1 - Formatted
Ola,Brown,,* Home,ola@example.com ::: ola2@example.com,Mobile,07700 900123,"5 Mill Lane
Keswick CA12 5AA"
`);
check("Google: the value column, not the label", google[0]?.email === "ola@example.com" && google[0]?.phone === "07700 900123", JSON.stringify(google[0]));
check("Google: the formatted address", google[0]?.address === "5 Mill Lane\nKeswick CA12 5AA", JSON.stringify(google[0]?.address));

// ---- QuickBooks-ish and a hand-made sheet, semicolons -----------------------
const qb = rows(`Customer;Company;Email;Phone;Billing Address;Type
Bob's Vans;;bob@vans.example;;"1 Road, Town";Supplier
`);
check("semicolons, and a Type column that says Supplier", qb[0]?.name === "Bob's Vans" && qb[0]?.kind === "supplier", JSON.stringify(qb[0]));
check("a sheet with no Type is customers", rows("Name,Email\nJo,jo@x.example\n")[0]?.kind === "client");
check("a one-column list with no heading is a list of names", rows("Alpha Ltd\nBeta Ltd\n").map((c) => c.name).join("|") === "Alpha Ltd|Beta Ltd");
check("a sheet with no column of names gives nothing, not a guess", rows("Amount,Date\n12,2026-01-01\n").length === 0);

// ---- Excel, read as it is ---------------------------------------------------
const sheet = [
  ["Customer", "Email", "Phone", null, "Postcode"],
  ["Skido Logistics & Sons Ltd", "accounts@skido.example", 1228000000, null, "CA6 4SJ"],
  ["Ölzer <Penrith>", null, null, null, "CA11 7AA"],
];
const xs = readXlsx(makeXlsx(sheet));
check("Excel: the workbook's own first sheet, not whichever file is sheet1", xs[0]?.[0] === "Customer", JSON.stringify(xs[0]));
check("Excel: shared strings, rich text joined, & and < > kept", xs[1]?.[0] === "Skido Logistics & Sons Ltd" && xs[2]?.[0] === "Ölzer <Penrith>", JSON.stringify(xs.map((r) => r[0])));
check("Excel: an empty column keeps the ones after it in place", xs[1]?.[4] === "CA6 4SJ" && xs[2]?.[4] === "CA11 7AA", JSON.stringify(xs));
check("Excel: a number cell reads as its digits", xs[1]?.[2] === "1228000000");
const xi = readXlsx(makeXlsx(sheet, { inline: true }));
check("Excel: inline strings, as other apps write them", JSON.stringify(xi) === JSON.stringify(xs), JSON.stringify(xi));
const xc = fromRows(xs);
check("Excel: into contacts like any sheet", xc.length === 2 && xc[0].name === "Skido Logistics & Sons Ltd" && xc[0].email === "accounts@skido.example" && xc[0].address === "CA6 4SJ", JSON.stringify(xc[0]));
let refused = "";
try { readXlsx(new TextEncoder().encode("PK not really a zip")); } catch (e) { refused = e.message; }
check("Excel: a broken file says to save as CSV, in our words", refused === NOT_EXCEL, refused);

// ---- Phone contacts (vCard) -------------------------------------------------
const vcf = fromVcf(`BEGIN:VCARD\r
VERSION:3.0\r
N:Kovac;Ivan;;;\r
FN:Ivan Kovac\r
ORG:Kovac Couriers;\r
EMAIL;type=INTERNET;type=WORK;type=pref:ivan@kovac.ex\r
 ample\r
item1.TEL;type=pref:+44 7700 900456\r
item2.ADR;type=WORK;type=pref:;;1 Depot Way;Carlisle;;CA1 1AA;United Kingdom\r
END:VCARD\r
BEGIN:VCARD\r
VERSION:3.0\r
FN:Mum\\, home\r
END:VCARD\r
`);
check("vCard: two cards", vcf.length === 2, vcf.length);
check("vCard: the company is the name, the person its contact", vcf[0]?.name === "Kovac Couriers" && vcf[0]?.contactPerson === "Ivan Kovac" && vcf[0]?.isCompany);
check("vCard: a folded line is joined back", vcf[0]?.email === "ivan@kovac.example", vcf[0]?.email);
check("vCard: an iPhone's item1.TEL is read", vcf[0]?.phone === "+44 7700 900456", vcf[0]?.phone);
check("vCard: the address, UK left off", vcf[0]?.address === "1 Depot Way\nCarlisle\nCA1 1AA", JSON.stringify(vcf[0]?.address));
check("vCard: an escaped comma is a comma", vcf[1]?.name === "Mum, home", vcf[1]?.name);

// ---- What the reader found on photos ----------------------------------------
const seen = (name, role) => ({ name, role, isCompany: true, contactPerson: null, email: null, phone: null, address: null, vatNumber: null, companyNumber: null, website: null });
const scanned = fromScanned([seen("Kovac Couriers", "issuer"), seen("Skido Logistics Ltd", "recipient")], "KOVAC COURIERS");
check("the account's own name is never offered back to it", scanned.length === 1 && scanned[0].name === "Skido Logistics Ltd", JSON.stringify(scanned.map((c) => c.name)));
check("whoever an invoice went to is a customer", scanned[0]?.kind === "client");
check("whoever sent a bill is a supplier", fromScanned([seen("Shell UK", "issuer"), seen("Kovac Couriers", "recipient")], "Kovac Couriers")[0]?.kind === "supplier");

// ---- Settling the list ------------------------------------------------------
const a = { name: "Skido Logistics Ltd", kind: "client", isCompany: true, contactPerson: "", email: "", phone: "01228", address: "", vatNumber: "", companyNumber: "" };
const b = { ...a, name: "skido logistics ltd.", email: "accounts@skido.example", phone: "999" };
const s1 = settle([a, b], []);
check("the same business twice is one, blanks filled from the other", s1.fresh.length === 1 && s1.fresh[0].email === "accounts@skido.example" && s1.fresh[0].phone === "01228", JSON.stringify(s1.fresh));
const s2 = settle([a, b, { ...a, name: "New Co" }], [{ name: "SKIDO LOGISTICS LTD", kind: "client" }]);
check("someone already in the account is left out, and counted once", s2.fresh.length === 1 && s2.fresh[0].name === "New Co" && s2.already === 1, JSON.stringify(s2));
check("a supplier of the same name as a customer is not the same contact", settle([{ ...a, kind: "supplier" }], [{ name: a.name, kind: "client" }]).fresh.length === 1);
check("a row with no name is dropped", settle([{ ...a, name: "  " }], []).fresh.length === 0);

// ---- Into the store's shape -------------------------------------------------
const c = toClient({ ...a, email: "x@y.example" });
check("saved with reminders on, GBP, no reverse-charge declaration", c.remindersEnabled === true && c.defaultCurrency === "GBP" && c.endUserDeclared === false && !("archived" in c) && !("id" in c));

// ---- Which way a file is read ----------------------------------------------
check("file kinds", [
  fileWay({ name: "contacts.csv" }) === "rows",
  fileWay({ name: "Ivan.vcf" }) === "vcard",
  fileWay({ name: "x", type: "text/x-vcard" }) === "vcard",
  fileWay({ name: "Customers.xlsx" }) === "xlsx",
  fileWay({ name: "Old.xls" }) === "excel",
  fileWay({ name: "List.numbers" }) === "excel",
  fileWay({ name: "IMG_0001.HEIC" }) === "scan",
  fileWay({ name: "bill.pdf", type: "application/pdf" }) === "scan",
  fileWay({ name: "song.mp3", type: "audio/mpeg" }) === "other",
].every(Boolean));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
if (results.some((r) => !r)) process.exitCode = 1;
