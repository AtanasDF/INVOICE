# Dead weight in `web/src`: report only, nothing removed

Cloud brief 7 (`notes/cloud-queue.md`), 2026-10-20, against `main` at `f08edea`.
**Nothing was deleted, unexported or edited** (hard rule 1). Removing anything is Atanas's
call. `fix/audit-components` and other branches waiting to merge touch many of the same
files, so any removal should come after those merges.

The brief asks for `notes/audit-dead-code.md`. The session that started this one asked for
`notes/dead-weight.md` on `wip/dead-weight`, and that request was followed. It is the same
report under a different name.

## The short answer

`web/src` carries very little dead weight. Every file is reached from a page or route,
every component is rendered and every dependency is imported. Five things are dead outright,
four exports are used only by the harness, and 102 exports are used only inside their own
file, so their `export` keyword is unnecessary.

| What | Count |
| --- | --- |
| Files in `web/src` imported by nothing / unreachable from a Next.js entry point | **0** of 319 |
| Components never rendered | **0** |
| Dependencies in `web/package.json` no import mentions | **0** of 22 |
| Dead outright: no caller in the app, the harness, `web/scripts` or `worker/` | **5** (2 exports, 2 re-exports, 1 script file) |
| Used only by a harness suite (counts as a caller under the brief; listed so it is known) | **4** |
| `export` surplus: used only inside the file that declares it | **102** (44 values, 58 types) in 60 files |
| Unused locals, imports or parameters (`tsc --noUnusedLocals --noUnusedParameters`) | **0** |
| Exports that lose their last caller when `fix/audit-components` merges | **0** |

## How it was proved

1. **Every export, every use, via the type checker.** A script built the TypeScript program
   from `web/tsconfig.json`, then walked every identifier in all 319 files and resolved each
   to its symbol, following import aliases through to the declaration. That covers named
   imports, `import * as` namespace access, JSX tags, shorthand properties and re-exports.
   Dynamic imports were resolved too. `const { x } = await import("@/lib/y")` marks `x`,
   `dynamic(() => import(...))` marks `default`, and `.then((m) => m.x)` resolves through
   the property access. Result: 1,061 exports, of which 354 have no use outside their own
   file. Of those, 203 are things Next.js itself calls (`default`, `metadata`, `GET`/`POST`,
   `maxDuration` and so on, in `page`/`layout`/`route`/`error`/`not-found`/`opengraph-image`/
   `robots`/`sitemap` files). That leaves 151 to check.
2. **The harness counts as a caller.** Suites import the compiled source from
   `./gen/lib/<name>.js` (statically, and sometimes with `await import`), and `mutate.mjs`
   and several suites read `.ts` files as text. All 151 names were grepped as whole words
   across `harness/` (minus `gen/`, `node_modules/` and `fixtures/`), `web/scripts/` and
   `worker/src/`. Each hit was then checked as a real import from that module, or a text
   read of that file. Eleven hits were the same word used for something else: `words`,
   `Skip`, `Point`, `Step`, `Job`, `longDate` from `reminderTemplates` rather than
   `DateConfirm`, and so on. Those were not counted as callers.
3. **Same-named copies elsewhere in `src` were checked by hand.** They turned out to be
   separate local declarations (see "Parallel copies" below), not uses.
4. **Files:** a reachability walk from all 111 Next.js entry files over the resolved import
   graph, static and dynamic, reached all 319.
5. **Dependencies:** each of the 22 names in `web/package.json` was matched against the
   resolved imports and also grepped as a module specifier across `src/`, `scripts/` and
   the config files (see the table below).
6. **Unused locals:** `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` exits 0 on
   `main`, and also on `fix/audit-components`.
7. **After the merge:** the same scan was run on a worktree of `origin/fix/audit-components`
   (`f0e4c06`, which carries `receiptAmounts.ts`, `expensePeriod.ts` and `roundMoney`) and
   its export uses were compared with `main`'s. No export used on `main` loses its last
   caller there. The branch itself removes the only two that would have, by deleting
   `amountOrNull` from `free-invoice/fields.tsx` and `money` from
   `quote/QuoteDocument.tsx`. The six receipt-maths copies it replaces were local, never
   exported, so nothing is left behind once it merges.

## 1. Dead outright: proposed for removal (5)

| Item | Evidence | Confidence |
| --- | --- | --- |
| `claimMessage()`, `lib/invites.ts:80` | No identifier resolves to it anywhere in `src`. Zero hits in `harness/`, `scripts/` and `worker/`. `SignInCard.tsx:207` calls `claimInvite` and does not show its result in words. Note: the wording for a wrong code or the person's own code exists but is shown nowhere, so this may be a missing piece of invite-a-friend (switched off: `NEXT_PUBLIC_INVITES` is not set) rather than leftover code. | High that it is unused. Ask whether it should be wired in rather than removed. |
| `type CurrencyCode`, `lib/fx.ts:31` | No use, either inside `fx.ts` or anywhere else. The only grep hit is its own declaration. | High |
| Re-export `export { REVERSE_CHARGE_WORDING }`, `components/invoice/InvoiceDocument.tsx:7` | Every importer of the constant takes it from `@/lib/reverseCharge` directly: `IssuedInvoice.tsx:9`, `InvoiceDocument.tsx:5` itself, and `test-reverse-charge.mjs` via `gen/lib/reverseCharge.js`. None imports it from `InvoiceDocument`. | High |
| Re-export `export { RECEIPTS_BUCKET }`, `lib/receiptImages.ts:4` | The constant lives in `lib/receiptsBucket.ts`, and every user (`receiptImages.ts`, `receiptImagesServer.ts`, `quoteRequests.ts`) imports it from there. No file imports it from `receiptImages`. The local import on line 2 is still needed; only the re-export line is surplus. | High |
| `web/scripts/copy-opencv.mjs` (whole file) | Replaced by `scripts/copy-vendor.mjs`, which copies the same OpenCV file plus the pdf.js worker. `package.json`'s `predev`/`prebuild` run only `copy-vendor.mjs`. Nothing else runs it: grep of the repo (minus `node_modules`) finds only two **stale comments** that still name it: `src/lib/opencv.ts:3` and `web/.gitignore:46`. Those comments should say `copy-vendor.mjs` whether or not the file goes. | High |

## 2. Used only by the harness (4): not dead by the brief's rule, but worth knowing

| Item | What the app does instead | Note |
| --- | --- | --- |
| `reverseChargeCreditNote()`, `lib/reverseCharge.ts:77` | **Nothing.** No credit-note screen or document calls it. Only `test-reverse-charge.mjs:70` uses it. | **Possibly a gap, not dead weight.** `notes/INVOICEOVER-GUIDE.md:1155` says a credit note against reverse-charged work carries this wording ("customer to account for the output tax adjustment of £X"). The code comment says HMRC expect it too. The suite proves the sentence is right, but no credit note ever prints it. Worth a look before anyone deletes it. |
| `reverseChargeVat()`, `lib/reverseCharge.ts:55` | `freeInvoiceDraft.ts:334` works out its own `round(subtotal * VAT_RATES.standard)`. That is correct there because the Free page forces every line to the 20% kind (line 307). The issued invoice prints `reverseChargeNote()`. | The suite tests a function the app does not call. Harmless today. If the Free page ever offers the 5% kind, line 334 is the copy that would be wrong. |
| `journey()`, `lib/helpJourneys.ts:126` | The help page and `Walkthrough` look journeys up themselves. | Used by `test-help.mjs:61` only. Low value either way. |
| `DEVICE_KEYS`, `lib/accountSwitch.ts:41` | Not read by the app on purpose. These are the localStorage keys that are deliberately *kept* when the account changes. | **Keep.** `test-account-switch.mjs:73` uses it to prove that every key the app writes has been sorted as personal or per-device. That check is its whole job. |

## 3. `export` surplus: used only inside its own file (102)

These are used by their own file, so none of them is dead code. Only the `export` keyword
is unnecessary. Dropping it would change nothing at runtime. It would only make the
module's public surface honest. **Low value**, and every one touches a file that a pending
branch may also touch, so the proposal is to leave these alone unless a file is being
edited anyway. Types are listed apart because exporting a type alongside the function that
uses it is ordinary practice. On the 44 values, the case is a little stronger.

| File | Values | Types |
| --- | --- | --- |
| `components/AddAnything.tsx` | — | `AddChoice` :12 |
| `components/RegisterBits.tsx` | `sinceDate` :9 | — |
| `components/SaveAsMenu.tsx` | — | `SaveKind` :7 |
| `components/SendInvoicePanel.tsx` | — | `SendDocType` :32, `DocumentPdf` :112 |
| `components/Turnstile.tsx` | `TURNSTILE_SITE_KEY` :19 | — |
| `components/quoteRequest/PublicRequestView.tsx` | `AnswerSummary` :15 | — |
| `components/scan/BatchReview.tsx` | `removeShot` :13 | — |
| `components/scan/CreditOfSelect.tsx` | `sortInvoicesForCredit` :13 | — |
| `components/scan/DateConfirm.tsx` | `longDate` :3 | — |
| `components/scan/PagesStrip.tsx` | `MAX_PAGES` :8 | — |
| `lib/addressLookup.ts` | — | `TypedParts` :208 |
| `lib/camera.ts` | — | `CameraPermission` :4, `CameraOpen` :105 |
| `lib/categories.ts` | `CATEGORY_SETS` :50 | — |
| `lib/companyRegister.ts` | — | `RegisterFacts` :64 |
| `lib/companyReport.ts` | `words` :95 | — |
| `lib/companyReportBuild.ts` | — | `Raw` :53 |
| `lib/contactExtraction.ts` | — | `ContactRole` :4 |
| `lib/convert.ts` | `readDataUrl` :55, `parseCsv` :138, `NO_CANVAS` :6, `NO_PICTURE` :7, `NO_PAGES` :8, `UNREADABLE` :9 | `Kind` :17 |
| `lib/documentDate.ts` | — | `ParsedDate` :8 |
| `lib/duplicates.ts` | — | `DuplicateCandidate` :4 |
| `lib/errorReport.ts` | — | `ErrorReport` :60 |
| `lib/extractors.ts` | `toGeminiSchema` :274, `CLAUDE_MODEL` :7 | `ExtractStructuredOptions` :12 |
| `lib/feedbackEmail.ts` | — | `FeedbackEmailInput` :7 |
| `lib/fileExport.ts` | — | `ExportFile` :23, `Gathered` :49 |
| `lib/freeInvoiceDraft.ts` | `currencySymbol` :64 | `FreeDocType` :10 |
| `lib/gettingStarted.ts` | — | `Step` :13, `Started` :21 |
| `lib/helpJourneys.ts` | — | `HelpStep` :18 |
| `lib/inboxToken.ts` | `INBOX_DOMAIN` :1 | — |
| `lib/install.ts` | `isStandalone` :32, `chooseInstallWay` :43, `installWay` :50 | `InstallWay` :10 |
| `lib/invites.ts` | `tidyCode` :18 | `ClaimResult` :53 |
| `lib/invoiceTemplate.ts` | `INVOICE_TEMPLATE_SCHEMA` :62 | — |
| `lib/jobs.ts` | — | `Job` :21 |
| `lib/mileage.ts` | `straightLineMiles` :78, `ROAD_FACTOR` :76 | `Trip` :27, `Claim` :56 |
| `lib/moneyScreen.ts` | — | `MoneyScreen` :23 |
| `lib/pagePrint.ts` | `PRINT_SUB` :53 | `Point` :40, `Quad` :41 |
| `lib/photoAgeing.ts` | — | `Skip` :21 |
| `lib/priceSearch.ts` | `searchWords` :26, `shoppingSearch` :36 | `SearchPlace` :8 |
| `lib/publicRead.ts` | `PublicReadFailed` :7 | — |
| `lib/quoteCompare.ts` | `similarity` :244, `VAT_RATE` :21 | `Cell` :28, `SupplierTotal` :53 |
| `lib/quoteRequests.ts` | `supplierFromRow` :91 | `AnswerStatus` :22, `AnswerSource` :23 |
| `lib/receiptImages.ts` | `isStoredRef` :15 | — |
| `lib/reverseCharge.ts` | `REVERSE_CHARGE_RATES` :23 | `ReverseChargeLine` :36 |
| `lib/reverseChargePrompt.ts` | — | `ReverseChargeAsk` :18 |
| `lib/sameAgain.ts` | — | `SameAgain` :19 |
| `lib/savedPrices.ts` | — | `SavedPrice` :14 |
| `lib/scanAllowance.ts` | — | `TopUp` :6 |
| `lib/scanClient.ts` | `batchPages` :14 | — |
| `lib/scanExtraction.ts` | `buildExtractionSchema` :276 | `ScanLineItem` :18, `ScanToolOutput` :42 |
| `lib/scanLimit.ts` | — | `ScanRefusal` :15 |
| `lib/sheetFile.ts` | — | `SheetTable` :11, `SheetBlock` :12, `SheetDoc` :13 |
| `lib/source.ts` | `tidySource` :16 | — |
| `lib/statement.ts` | — | `StatementLine` :10, `Ageing` :30 |
| `lib/storage.ts` | — | `SavableBusinessProfile` :992 |
| `lib/taxEstimate.ts` | `SA_NOTICE_DAYS` :44 | `TaxYear` :14 |
| `lib/theme.ts` | `applyTheme` :48, `DEFAULT_THEME` :17, `isTheme` :21, `isChoice` :22 | `ThemeId` :13, `ThemeChoice` :15 |
| `lib/vat.ts` | — | `VatBreakdownEntry` :39, `InvoiceTotals` :41 |
| `lib/vatNumber.ts` | — | `VatNumberCheck` :17 |
| `lib/vatReturn.ts` | — | `VatFigures` :12 |
| `lib/warmScanner.ts` | — | `NetworkHint` :23 |
| `lib/zip.ts` | `uniqueNames` :32 | — |

**Exported only for the harness (43): keep the `export`.** These are used in their own
file *and* imported by a suite from `gen/`. Removing the `export` would break the suite.
They are listed so nobody takes them for surplus:

- `lib/accountSwitch.ts`: `keysToClear`, `accountToRemember`, `LAST_ACCOUNT_KEY`, `PERSONAL_LOCAL_KEYS`, `PERSONAL_SESSION_KEYS`
- `lib/addressLookup.ts`: `typedWords`
- `lib/errorReport.ts`: `redactPath`
- `lib/extractors.ts`: `worthRetrying`
- `lib/feedbackEmail.ts`: `londonTime`
- `lib/freeInvoiceDraft.ts`: `stripNumberLabel`, `nextInvoiceNumber`
- `lib/fx.ts`: `MAX_RATE`
- `lib/helpFacts.ts`: `HELP_FACTS`
- `lib/helpPrompt.ts`: `grounding`
- `lib/invoicePdf.ts`: `pageSlices`
- `lib/jobs.ts`: `isJobTag`
- `lib/latePayment.ts`: `STATUTORY_MARGIN`
- `lib/pagePrint.ts`: `printDiff`, `PRINT_N`, `PRINT_INSET`, `PRINT_MIN_SPREAD`, `PRINT_DIFFERENT`, `PRINT_SETTLED`, `PRINT_STILL_PX`, `PRINT_NEAR_PX`
- `lib/photoAgeing.ts`: `EMAILABLE_TYPES`, `agedAlready`
- `lib/quoteCompare.ts`: `deliveryOf`
- `lib/reminderTemplates.ts`: `renderReminderTemplate`
- `lib/reverseCharge.ts`: `isReverseCharge`, `reverseChargeBreakdown`
- `lib/scanBudget.ts`: `readUnits`, `PDF_UNITS`, `READ_BASE_MS`, `READ_PER_UNIT_MS`, `READ_CEILING_MS`, `SLOW_READ_MS`
- `lib/scanExtraction.ts`: `ALLOWED_IMAGE_TYPES`
- `lib/taxEstimate.ts`: `taxYearOf`, `incomeTax`, `class4`
- `lib/vatNumber.ts`: `normaliseVatNumber`
- `lib/warmScanner.ts`: `worthWarming`

## 4. Files, components and dependencies (nothing to remove)

- **Files:** all 319 `.ts`/`.tsx` files under `web/src` are reached from the 111 Next.js
  entry files. No file is orphaned. `harness/tsconfig.logic.json` compiles 57 of them for
  the logic suites, and every one of those is also reached by the app.
- **Components:** every component's default export, and every named component (`icons.tsx`
  included), resolves to at least one use outside its file. Rendering inside a branch that
  can never be true was outside this check.
- **Dependencies:**

| Package | Used by |
| --- | --- |
| `@anthropic-ai/sdk` | `lib/extractors.ts` |
| `@google/genai` | `lib/extractors.ts`, `api/help-chat/route.ts` |
| `@supabase/supabase-js` | 32 files |
| `@techstark/opencv-js` | type-only in `lib/opencv.ts` and `DocumentCapture.tsx`. The real use is `scripts/copy-vendor.mjs`, which copies its `dist/opencv.js` into `public/vendor`. **Needed.** |
| `html-to-image` | `lib/saveFile.ts`, `lib/invoicePdf.ts` (dynamic) |
| `jspdf` | `lib/invoicePdf.ts` (dynamic) |
| `next`, `react`, `react-dom` | throughout |
| `pdf-lib` | `lib/documentPdf.ts`, `lib/convert.ts`, `lib/pdfPages.ts` |
| `pdfjs-dist` | `lib/convert.ts` (dynamic), and its worker via `copy-vendor.mjs` |
| `recharts` | `components/SpendChart.tsx` (via `next/dynamic` in `expenses/page.tsx`) |
| `web-push` | `lib/ownerPush.ts` and three notification routes |
| `@tailwindcss/postcss` | `postcss.config.mjs` |
| `tailwindcss` | `@import "tailwindcss"` in `app/globals.css` |
| `eslint`, `eslint-config-next` | `eslint.config.mjs` |
| `typescript`, `@types/node`, `@types/react`, `@types/react-dom`, `@types/web-push` | the toolchain and type resolution (the checker resolved `react`, `react-dom` and `web-push` imports to these) |

## Parallel copies (not dead, noted in passing)

Some names matched in step 3 are separate declarations of the same thing. They are not
uses, but each is a second copy that can drift:

- `MAX_PAGES = 20` is in both `components/scan/PagesStrip.tsx:8` (exported, used only
  there) and `app/api/scan/route.ts:32`. The client's cap and the server's refusal agree
  today only because both say 20. (`FreeInvoiceBuilder.tsx:36` and
  `api/invoice-template/route.ts:12` both say 3, the same pattern.)
- `type ScanLineItem` is declared in `lib/scanExtraction.ts:18` and again, with a narrower
  shape, in `app/invoices/new/page.tsx:31`.
- `type Quad` is declared in `lib/pagePrint.ts:41` and again in
  `components/DocumentCapture.tsx:27`.

## Rerunning it

The scanner (TypeScript compiler API, about 80 lines) was a scratch script and was not
committed, because the brief asked for a report. If Atanas wants it kept for a rerun after
the merges, it belongs at `harness/dead-weight.cjs`. It needs only `web/node_modules`.
