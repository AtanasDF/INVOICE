// The defects the component audit found outside its seven classes
// ("Real defects outside the seven classes", notes/audit-components.md). Most
// live in page state no logic suite can reach, so these read the source for
// the shape of the fix -- enough to fail the day somebody undoes one.
import fs from "node:fs";
import { REPO } from "./repo.mjs";

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const src = (f) => fs.readFileSync(`${REPO}/web/src/${f}`, "utf8").replace(/^\s*\/\/[^\n]*$/gm, "");
const fn = (s, name) => { const i = s.indexOf(name); return i < 0 ? "" : s.slice(i, s.indexOf("\n  }\n", i)); };

const { grossOf } = await import("./gen/lib/receiptAmounts.js");
check("a £12 receipt with £2 VAT shows £12 on its tile, not the net £10", grossOf({ amount: 10, vatAmount: 2 }) === 12);
check("and in whole pennies", grossOf({ amount: 16.659999999999997, vatAmount: 3.33 }) === 19.99);

const newClient = src("app/clients/new/page.tsx");
check("Clear form clears the end-user declaration (it turns the reverse charge off)", /setEndUserDeclared\(false\)/.test(fn(newClient, "function clearForm")));
check("a ticked declaration counts as something to clear", /const filled = [^;]*endUserDeclared/.test(newClient));

const settings = src("app/settings/page.tsx");
check("Settings never writes back the import address it loaded", /inboxToken:\s*current\.inboxToken/.test(settings) && !/^\s*inboxToken,\s*$/m.test(settings));

const shell = src("app/AppShell.tsx");
check("a stranger is not offered a link to /help, which sends them to /login", !/<Link href="\/help"[^>]*>How it works<\/Link>\s*\n\s*<Link href="\/how-to-invoice"/.test(shell) && /user \? <Link href="\/help"/.test(shell));

const free = src("components/free-invoice/FreeInvoiceBuilder.tsx");
check("the Free page reads with Gemini unless this device chose Claude", /useState<ScanEngine>\(chosenEngine === "claude" \? "claude" : "gemini"\)/.test(free));
check("its engine picker shows only where /scan?engine= set one", (free.match(/<EnginePicker value/g) ?? []).length === 2 && (free.match(/user && chosenEngine !== null &&/g) ?? []).length === 2);

const panel = src("components/SendInvoicePanel.tsx");
check("the send lock belongs to one invoice, so a new number can be sent", /useRef<string \| null>\(null\)/.test(panel) && /sending\.current === invoiceKey/.test(panel) && !/sending\.current = true/.test(panel));

check("the file strip shows what the document cost", /money\(grossOf\(r\)\)/.test(src("components/FileStrip.tsx")));
const files = src("app/files/page.tsx");
check("the file library tile and its preview do too", (files.match(/money\(grossOf\(/g) ?? []).length === 2 && !/money\(r\.amount\)|money\(preview\.amount\)/.test(files));

const vat = src("app/vat/page.tsx");
check("VAT's Copy says so when the clipboard refused", /\.then\(\(\) => setCopied\("yes"\), \(\) => setCopied\("no"\)\)/.test(vat) && !/\.catch\(\(\) => \{\}\)/.test(vat));

const mileage = src("app/mileage/page.tsx");
check("a negative mileage is no mileage", /const milesNum = Math\.max\(0, amountOrNull\(miles\) \?\? 0\)/.test(mileage) && !/parseFloat\(miles\)/.test(mileage));

const copy = src("app/copy/page.tsx");
check("/copy saves through saveFile.ts", /saveBlob\(m\.name, m\.blob\)/.test(copy) && !/createObjectURL/.test(copy));
check("saveFile waits before letting the blob go", /setTimeout\(\(\) => URL\.revokeObjectURL\(url\)/.test(src("lib/saveFile.ts")));

const passed = results.filter(Boolean).length;
console.log(JSON.stringify({ passed, total: results.length }));
process.exit(passed === results.length ? 0 : 1);
