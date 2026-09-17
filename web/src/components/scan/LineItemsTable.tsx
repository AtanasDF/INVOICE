"use client";

export type EditableLine = { description: string; quantity: string; unitPrice: string; lineTotal: number | null };

export function lineTotalOf(line: EditableLine): number {
  return line.lineTotal ?? (parseFloat(line.quantity) || 0) * (parseFloat(line.unitPrice) || 0);
}

const cell = "w-full rounded-lg border px-2 py-1.5";

export default function LineItemsTable({ lines, currency, onChange }: {
  lines: EditableLine[];
  currency: string;
  onChange: (index: number, patch: Partial<EditableLine>) => void;
}) {
  return (
    <div>
      <label className="text-xs text-neutral-500">Line items</label>
      <table className="mt-1 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-neutral-500">
            <th className="py-2 font-medium">Item</th>
            <th className="w-16 py-2 text-right font-medium">Qty</th>
            <th className="w-24 py-2 text-right font-medium">Price</th>
            <th className="w-24 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="py-1 pr-2">
                <input className={cell} value={line.description} onChange={(e) => onChange(i, { description: e.target.value })} />
              </td>
              <td className="py-1 pr-2">
                <input
                  className={`${cell} text-right`}
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(e) => onChange(i, { quantity: e.target.value, lineTotal: null })}
                />
              </td>
              <td className="py-1 pr-2">
                <input
                  className={`${cell} text-right`}
                  inputMode="decimal"
                  value={line.unitPrice}
                  onChange={(e) => onChange(i, { unitPrice: e.target.value, lineTotal: null })}
                />
              </td>
              <td className="py-1 text-right tabular-nums">
                {currency === "GBP" ? "£" : `${currency} `}{lineTotalOf(line).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-neutral-500">
        Correct a misread here. Lines can&apos;t be removed — the scan is a record of the document.
      </p>
    </div>
  );
}
