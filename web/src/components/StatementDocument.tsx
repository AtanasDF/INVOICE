import type { BusinessProfile, Client } from "@/lib/storage";
import { money } from "@/lib/money";
import type { Statement } from "@/lib/statement";
import { shortDate } from "@/lib/quoteStatus";



// The statement as it prints: who it's from, who it's for, every issued
// invoice with what came off it, and what is still owed.
export default function StatementDocument({ statement, client, profile, asAt }: {
  statement: Statement;
  client: Client;
  profile: BusinessProfile | null;
  asAt: string;
}) {
  const { lines, outstanding, ageing } = statement;
  return (
    <div className="text-neutral-900">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-xl font-bold">Statement of account</h1>
          <p className="mt-1 text-sm text-neutral-600">As at {shortDate(asAt)}</p>
        </div>
        <div className="text-right text-sm">
          <p className="font-semibold">{profile?.businessName || "Your business"}</p>
          {profile?.address?.split("\n").map((l, i) => (
            <p key={i} className="text-neutral-600">{l}</p>
          ))}
          {profile?.vatNumber && <p className="text-neutral-600">VAT {profile.vatNumber}</p>}
        </div>
      </div>

      <div className="mt-6 text-sm">
        <p className="text-xs uppercase tracking-wide text-neutral-500">For</p>
        <p className="font-semibold">{client.name}</p>
        {client.address?.split("\n").map((l, i) => (
          <p key={i} className="text-neutral-600">{l}</p>
        ))}
      </div>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-neutral-500">
            <th className="py-2">Date</th>
            <th className="py-2">Invoice</th>
            <th className="py-2 text-right">Charged</th>
            <th className="py-2 text-right">Credited</th>
            <th className="py-2 text-right">Paid</th>
            <th className="py-2 text-right">Owing</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b">
              <td className="py-2 align-top">{shortDate(l.date)}</td>
              <td className="py-2 align-top">
                {l.number}
                {l.daysLate > 0 && <span className="block text-xs text-neutral-500">{l.daysLate} days late</span>}
              </td>
              <td className="py-2 text-right align-top">{money(l.charged)}</td>
              <td className="py-2 text-right align-top">{l.credited ? `−${money(l.credited)}` : "—"}</td>
              <td className="py-2 text-right align-top">{l.paid ? money(l.paid) : "—"}</td>
              <td className="py-2 text-right align-top font-medium">{money(l.balance)}</td>
            </tr>
          ))}
          {!lines.length && (
            <tr>
              <td colSpan={6} className="py-3 text-neutral-600">No invoices yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="w-64 text-sm">
          <div className="flex justify-between border-t py-2 text-base font-bold">
            <span>Total owing</span>
            <span>{money(outstanding)}</span>
          </div>
        </div>
      </div>

      {outstanding > 0 && (
        <div className="mt-4 text-sm">
          <p className="text-xs uppercase tracking-wide text-neutral-500">How old it is</p>
          <div className="mt-1 grid grid-cols-4 gap-2 text-center">
            {[
              { label: "Not yet late", value: ageing.current },
              { label: "30+ days", value: ageing.d30 },
              { label: "60+ days", value: ageing.d60 },
              { label: "90+ days", value: ageing.d90 },
            ].map((b) => (
              <div key={b.label} className="rounded-lg border p-2">
                <p className="text-xs text-neutral-500">{b.label}</p>
                <p className="font-medium">{money(b.value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {profile?.bankDetails && outstanding > 0 && (
        <div className="mt-6 text-sm">
          <p className="text-xs uppercase tracking-wide text-neutral-500">How to pay</p>
          {profile.bankDetails.split("\n").map((l, i) => (
            <p key={i} className="text-neutral-700">{l}</p>
          ))}
        </div>
      )}
    </div>
  );
}
