"use client";

import { ReactNode, useState } from "react";
import { addDays, emptyLine, FreeInvoiceDraft, FreeInvoiceLine, PAYMENT_TERMS, saveSignature, termsDays } from "@/lib/freeInvoiceDraft";
import { VAT_RATE_KINDS, VAT_RATE_LABELS } from "@/lib/vat";
import { Field, INPUT, NumberInput, Segmented, Toggle } from "@/components/free-invoice/fields";
import LayoutPicker from "@/components/free-invoice/LayoutPicker";
import SignaturePad from "@/components/free-invoice/SignaturePad";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

type Nullable<T> = { [K in keyof T]: string | null };

function TextFields<T extends Nullable<T>>({ value, fields, onChange }: {
  value: T;
  fields: { key: keyof T; label: string; type?: string; multiline?: boolean; hint?: string; span?: boolean }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {fields.map((f) => (
        <div key={String(f.key)} className={f.span || f.multiline ? "col-span-2" : ""}>
          <Field label={f.label} hint={f.hint}>
            {f.multiline ? (
              <textarea rows={3} className={INPUT} value={value[f.key] ?? ""} onChange={(e) => onChange({ ...value, [f.key]: e.target.value || null })} />
            ) : (
              <input type={f.type ?? "text"} className={INPUT} value={value[f.key] ?? ""} onChange={(e) => onChange({ ...value, [f.key]: e.target.value || null })} />
            )}
          </Field>
        </div>
      ))}
    </div>
  );
}

export default function DraftEditor({ draft, onChange }: { draft: FreeInvoiceDraft; onChange: (d: FreeInvoiceDraft) => void }) {
  const set = (patch: Partial<FreeInvoiceDraft>) => onChange({ ...draft, ...patch });
  const isPreset = (PAYMENT_TERMS as readonly string[]).includes(draft.paymentTerms);
  const [customTerms, setCustomTerms] = useState(!isPreset);
  const termsValue = customTerms || !isPreset ? "custom" : draft.paymentTerms;

  function setDate(date: string) {
    const days = termsDays(draft.paymentTerms);
    set({ date, dueDate: days === null ? draft.dueDate : addDays(date, days) });
  }

  function setTerms(v: string) {
    if (v === "custom") return setCustomTerms(true);
    setCustomTerms(false);
    set({ paymentTerms: v, dueDate: addDays(draft.date, termsDays(v)!) });
  }

  function setLine(i: number, patch: Partial<FreeInvoiceLine>) {
    set({ lines: draft.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  }

  const firstLineEmpty = !draft.lines[0]?.description.trim();

  return (
    <div className="space-y-4">
      <Card title="Layout">
        <LayoutPicker value={draft.layout} onChange={(layout) => set({ layout })} />
      </Card>

      <Card title="Your business">
        <TextFields
          value={draft.issuer}
          onChange={(issuer) => set({ issuer })}
          fields={[
            { key: "name", label: "Business name", span: true, hint: draft.issuer.name ? undefined : "Add your name so the customer knows who to pay." },
            { key: "address", label: "Address", multiline: true },
            { key: "email", label: "Email", type: "email" },
            { key: "phone", label: "Phone", type: "tel" },
            { key: "website", label: "Website" },
            { key: "utr", label: "UTR" },
            { key: "vatNumber", label: "VAT number" },
            { key: "companyNumber", label: "Company number" },
          ]}
        />
      </Card>

      <Card title="Invoice">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Invoice number">
            <input className={INPUT} placeholder="INV-001" value={draft.number} onChange={(e) => set({ number: e.target.value })} />
          </Field>
          <Field label="Currency symbol">
            <input className={INPUT} value={draft.currencySymbol} onChange={(e) => set({ currencySymbol: e.target.value })} />
          </Field>
          <Field label="Date">
            <input type="date" className={INPUT} value={draft.date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Due date">
            <input type="date" className={INPUT} value={draft.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
          </Field>
          <Field label="Payment terms">
            <select className={INPUT} value={termsValue} onChange={(e) => setTerms(e.target.value)}>
              {PAYMENT_TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
              <option value="custom">Custom…</option>
            </select>
          </Field>
          {termsValue === "custom" && (
            <Field label="Custom terms">
              <input className={INPUT} placeholder="e.g. 50% on completion" value={draft.paymentTerms} onChange={(e) => set({ paymentTerms: e.target.value })} />
            </Field>
          )}
        </div>
      </Card>

      <Card title="Bill to">
        <TextFields
          value={draft.customer}
          onChange={(customer) => set({ customer })}
          fields={[
            { key: "name", label: "Customer name", span: true },
            { key: "address", label: "Address", multiline: true },
            { key: "email", label: "Email", type: "email", span: true },
          ]}
        />
      </Card>

      <Card title="Options">
        <Toggle label="VAT registered" description="Adds your VAT number, a VAT column and the VAT total." checked={draft.vatRegistered} onChange={(vatRegistered) => set({ vatRegistered })} />
        {draft.vatRegistered && (
          <Toggle label="Reverse charge" description={`Charges no VAT on every line and prints "Reverse charge: VAT Act 1994 Section 55A applies".`} checked={draft.reverseCharge} onChange={(reverseCharge) => set({ reverseCharge })} />
        )}
        <Toggle label="CIS subcontractor" description="Splits labour from materials and shows the CIS deduction." checked={draft.cis.enabled} onChange={(enabled) => set({ cis: { ...draft.cis, enabled } })} />
        {draft.cis.enabled && (
          <div>
            <p className="text-xs text-neutral-500">CIS rate</p>
            <Segmented
              className="mt-1"
              label="CIS rate"
              value={String(draft.cis.rate)}
              options={[{ value: "20", label: "20%" }, { value: "30", label: "30%" }]}
              onChange={(v) => set({ cis: { ...draft.cis, rate: v === "30" ? 30 : 20 } })}
            />
          </div>
        )}
      </Card>

      <Card title="Lines">
        <div className="space-y-3">
          {draft.lines.map((l, i) => (
            <div key={i} className="space-y-2 rounded-lg border p-3">
              <Field label={`Line ${i + 1}`} hint={i === 0 && firstLineEmpty ? "Describe the work on the first line." : undefined}>
                <input className={INPUT} placeholder="Description of the work" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
              </Field>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[5rem] flex-1">
                  <Field label="Qty">
                    <NumberInput value={l.quantity} onChange={(quantity) => setLine(i, { quantity })} />
                  </Field>
                </div>
                <div className="min-w-[6rem] flex-1">
                  <Field label={`Unit price (${draft.currencySymbol})`}>
                    <NumberInput value={l.unitPrice} onChange={(unitPrice) => setLine(i, { unitPrice })} placeholder="0.00" />
                  </Field>
                </div>
                {draft.vatRegistered && !draft.reverseCharge && (
                  <div className="min-w-[8rem] flex-1">
                    <Field label="VAT rate">
                      <select className={INPUT} value={l.vatRate} onChange={(e) => setLine(i, { vatRate: e.target.value as FreeInvoiceLine["vatRate"] })}>
                        {VAT_RATE_KINDS.map((k) => <option key={k} value={k}>{VAT_RATE_LABELS[k]}</option>)}
                      </select>
                    </Field>
                  </div>
                )}
                {draft.cis.enabled && (
                  <div className="min-w-[7rem] flex-1">
                    <Field label="Type">
                      <select className={INPUT} value={l.kind} onChange={(e) => setLine(i, { kind: e.target.value as FreeInvoiceLine["kind"] })}>
                        <option value="labour">Labour</option>
                        <option value="materials">Materials</option>
                        <option value="other">Other</option>
                      </select>
                    </Field>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => set({ lines: draft.lines.filter((_, j) => j !== i) })}
                  disabled={draft.lines.length === 1}
                  aria-label={`Remove line ${i + 1}`}
                  className="rounded-lg border px-3 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => set({ lines: [...draft.lines, emptyLine()] })} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
          Add line
        </button>
      </Card>

      <Card title="Payment details">
        <TextFields
          value={draft.bank}
          onChange={(bank) => set({ bank })}
          fields={[
            { key: "accountName", label: "Account name", span: true },
            { key: "sortCode", label: "Sort code" },
            { key: "accountNumber", label: "Account number" },
            { key: "iban", label: "IBAN" },
            { key: "reference", label: "Reference", hint: "Left blank, the invoice number is used." },
          ]}
        />
      </Card>

      <Card title="Notes">
        <Field label="Notes" hint="Shown above the payment details.">
          <textarea rows={3} className={INPUT} placeholder="Thank you for your business." value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </Card>

      <Card title="Signature">
        <SignaturePad
          value={draft.signature}
          onChange={(signature) => {
            saveSignature(signature, draft.signedBy);
            set({ signature });
          }}
        />
        {draft.signature && (
          <Field label="Name under the signature" hint="Remembered on this device with your signature.">
            <input
              className={INPUT}
              placeholder={draft.issuer.name ?? "Your name"}
              value={draft.signedBy}
              onChange={(e) => {
                saveSignature(draft.signature, e.target.value);
                set({ signedBy: e.target.value });
              }}
            />
          </Field>
        )}
      </Card>

      <Card title="Footer">
        <Field label="Footer" hint="Small print at the very bottom, after your UTR, company and VAT numbers.">
          <textarea rows={2} className={INPUT} value={draft.footer} onChange={(e) => set({ footer: e.target.value })} />
        </Field>
      </Card>
    </div>
  );
}
