# The first page — research for the redesign

Written 2026-09-22, 02:30, from Atanas's brief that night: one page for strangers with
Free invoice and Check a company together, a nice picture of the scan, one or two
buttons, every word polite and plain, "three old kids should be able to do that". Four
research agents (what the page shows today; GOV.UK / WCAG / older-and-young-user rules;
the simplest consumer tools' first screens; a copywriter) and one synthesis. Nothing
here is built yet; it is the design to react to.

## 1. Today
- A stranger who types the address is bounced to the sign-in form: "Sign in", "Welcome back.", two boxes, seven things to tap. The free tools are the two smallest links on the page.
- The free invoice page then asks "How do you want to start?" with four choices, a tip box and a 31-word sentence about scanning.
- Its words include PDF, scan, quote, register, LLPs, sole trader. Text and buttons are 14px.
- The company check is switched off (no Companies House key), so that page talks about an "API" and a "key".

## 2. The recommended first page
One column, nothing else above the fold. `/` shows this to a signed-out visitor; signed-in users keep the dashboard. Both buttons are plain `<a>` links, so they work before the page finishes loading.

Top to bottom:
1. Top right, small, the only header item: **Sign in**
2. Headline (32px+ bold): **Make an invoice. Check a company.**
3. Line (18–19px): **Both are free. Nothing to join. Nothing to pay.**
4. The picture (full width on a phone, about a third of the screen tall; to the right of the words on a wide screen).
5. Button 1 (full width, dark, 64px tall, 20px bold): **Make an invoice**
   Under it: **Say what you did and what it costs. Then print it or email it.**
6. Button 2 (full width, white with a dark border, same size): **Check a company**
   Under it: **See if a company is real, still trading, and who runs it.**
   Small grey: **The facts come from Companies House.**
7. Foot, small: **We do not keep anything you type unless you ask us to.**

The picture: a phone held flat over one paper invoice on a plain table, seen from slightly above. The phone's screen shows the same sheet with the scanner's green outline round it. No readable words on the sheet (grey lines), no buttons, icons, face, logo or text drawn into the image. Alt text: "A phone held over a paper invoice. The screen shows the page found with a green outline." It is decoration; the buttons alone must explain the page. If the picture is not ready, ship the same page without it.

## 3. After each button
**Make an invoice** opens a page titled **How would you like to start?** with two big buttons: **Take a photo of an old invoice** ("We copy your details in. You check them. Your phone will ask to use the camera.") and **Type it in** ("Fill in a few boxes. We build the invoice as you go."), plus a small **Back** link. "Start a quote" becomes a small link here, not a button. This replaces today's cards and tip box. The editor should open with the four fields that make an invoice (your name, who it is for, what you did, how much) and fold the rest under "Add more details"; on a phone "Print or save" is a visible button, not under "More". Email still needs a free sign-in: say so at the send button, as now, never on the first page.

**Check a company** opens a page titled **What is the company called?** One big box, label "Company name, or its number", example "Smith Building Ltd, or 01234567", one button **Check**. Under it: "Not sure of the spelling? Type what you have. We show the close matches." Accept spaces, hyphens, any case, numbers with or without leading zeros. No match: "We could not find that name. Check the spelling, or type the company number. Only limited companies are on the list." Until the Companies House key is set, either leave this button off the first page or word the fallback: "This check is coming soon. For now you can look the company up on the official site."

## 4. Accessibility checklist for the build
- Body 18–19px, line height 1.5, headline 32px+, nothing under 16px [GOV.UK type scale]
- Text contrast at least 4.5:1, aim near 7:1; no `text-neutral-500` body copy [WCAG 1.4.3; W3C older users]
- Buttons at least 44×44 CSS px, here 64px tall, full width, 16px apart [WCAG 2.5.5; NN/g touch targets]
- One primary button per page; sentence case; verb first [GOV.UK button]
- Every icon has a permanent visible text label [NN/g icon usability]
- Focus ring 2px+, 3:1 against the page, on every button and link [WCAG 2.4.7, 2.4.13; GOV.UK focus states]
- Usable at 320px wide with no sideways scroll, and at 200% zoom [WCAG 1.4.10, 1.4.4]
- No text inside the picture; alt text as above [WCAG 1.4.5]
- Lines under 60 characters [Baymard]
- Sentences under 15 words, reading age 9, "you", active voice, no "please", no "e.g." [GDS writing for everyone; NHS how we write]
- One column, nothing moving, both buttons above the fold on a 667px-tall phone [NN/g lower-literacy users]
- Links work before JavaScript; no data loads before paint [GOV.UK start button]
- One site name everywhere (tab title, header and manifest currently differ)
- Before shipping: Hemingway grade 4–6, Lighthouse clean, tab through, read aloud with VoiceOver

## 5. Three things to avoid
1. A form, or a four-way choice, on the first page (Zoho, invoice-generator.com, and today's free-invoice page).
2. Two same-weight buttons that read as a choice to decode, "Start free" beside "See plans", logo strips or audience tabs above the button (remove.bg, qr-code-generator).
3. These words anywhere on the first page: PDF, scan, upload, template, generate, account, sign up, register, VAT, CIS, UTR, officers, API, instantly, easy.

## 6. Guess or sourced
Sourced: sizes, contrast, target and reflow rules (WCAG, GOV.UK, NN/g); one main button and the start-page shape (GOV.UK); reading age 9 and 1 in 7 adults (GDS, Literacy Trust); what the pages show today (read from the code). Measured by us, not published: the reading-age scores of today's copy and the draft (Flesch-Kincaid script). Guesses: the exact button words ("Make an invoice" versus the app's "Write an invoice"; pick one and use it everywhere), whether the picture helps or distracts, and whether anyone freezes between two buttons. The test is cheap: one older person, one child, one non-technical adult, on a phone, asked only "what does this do, and what would you press?"

## Sources
- design-system.service.gov.uk/patterns/start-using-a-service/ ; /components/button/ ; /styles/type-scale/ ; /get-started/focus-states/
- gds.blog.gov.uk/2016/02/23/writing-content-for-everyone/
- service-manual.nhs.uk/content/how-we-write
- literacytrust.org.uk/parents-and-families/adult-literacy/what-do-adult-literacy-levels-mean/
- w3.org/WAI/WCAG22/Understanding/ target-size-minimum, target-size-enhanced, reflow, focus-visible, images-of-text ; w3.org/WAI/older-users/developing/
- nngroup.com/articles/ usability-for-senior-citizens, writing-for-lower-literacy-users, icon-usability, touch-target-size, kids-cognition
- baymard.com/blog/line-length-readability
- Code: web/src/app/AppShell.tsx, login/page.tsx, free-invoice/page.tsx, components/free-invoice/FreeInvoiceBuilder.tsx, components/check-company/CompanyChecker.tsx
