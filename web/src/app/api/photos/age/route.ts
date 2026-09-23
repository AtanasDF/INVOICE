import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { pagesToPdf, type DocPage } from "@/lib/documentPdf";
import { todayISO } from "@/lib/today";
import { cutoffFor, sortOut, forOwner, emailSubject, emailBody, type AgeableRow } from "@/lib/photoAgeing";

// Letting old photographs go (notes/ageing-photos-design.md).
//
// TWO LOCKS, NOT ONE. `CLAUDE.md` rule 1 is that nothing in this project is
// deleted; this is the one exception he has asked for, so it is switched on in
// two stages:
//
//   PHOTO_AGEING=on          the job runs at all
//   PHOTO_AGEING_DELETE=on   and only then is a single file removed
//
// With the first on and the second off it does the whole job -- finds what is
// old, builds the PDF, sends the email -- and removes nothing, answering with a
// report instead. That is how it ships, and how it should stay until he has
// read a report and agreed with it.
//
// THE RULE EVERYTHING ELSE SERVES: nothing is removed that has not first been
// emailed successfully. Not "we think it sent" -- accepted by Resend, or the
// photographs stay and tomorrow's run tries again. Storage is pennies; a
// receipt somebody needed for HMRC is not.
export const runtime = "nodejs";
export const maxDuration = 300;

const ON = process.env.PHOTO_AGEING === "on";
const DELETING = process.env.PHOTO_AGEING_DELETE === "on";
const DAYS = Number(process.env.PHOTO_AGEING_DAYS ?? 92);
// A run that tries to email a year of receipts at once times out and achieves
// nothing. Oldest first, a bite at a time, every day.
const PER_OWNER = 200;
const FROM = "documents@invoiceover.com";

type Row = AgeableRow & { vendor: string | null; amount: number | null };

const stored = (v: string | null | undefined) => (v ?? "").startsWith("storage:");
const pathOf = (v: string) => v.slice("storage:".length);

async function pageFor(admin: SupabaseClient, ref: string): Promise<DocPage | null> {
  if (!stored(ref)) return ref.startsWith("data:") ? { dataUrl: ref, mediaType: ref.slice(5).split(";")[0] } : null;
  const { data, error } = await admin.storage.from("receipts").download(pathOf(ref));
  if (error || !data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  const type = data.type || "image/jpeg";
  return { dataUrl: `data:${type};base64,${buf.toString("base64")}`, mediaType: type };
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!ON) {
    return NextResponse.json({ skipped: "PHOTO_AGEING is not on. Nothing was looked at." });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: "Not fully configured." }, { status: 500 });
  if (!resendApiKey) return NextResponse.json({ skipped: "No RESEND_API_KEY, so nothing could be emailed -- and nothing is removed without emailing it first." });

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const cutoff = cutoffFor(todayISO(), DAYS);
  const report: Record<string, unknown>[] = [];

  try {
    // Only what still has a photograph, is old enough, and has been checked.
    const { data, error } = await admin
      .from("receipts")
      .select("id,user_id,date,created_at,vendor,amount,image_data_url,details,needs_review")
      .lt("date", cutoff)
      .not("image_data_url", "is", null)
      .or("needs_review.is.null,needs_review.eq.false")
      .order("date", { ascending: true })
      .limit(2000);
    if (error) throw error;

    // Every rule about what may go lives in src/lib/photoAgeing.ts, where the
    // harness can hold it to account. Nothing here decides anything.
    const { candidates: rows, skipped } = sortOut((data ?? []) as Row[], cutoff);

    // Anyone paying keeps their photographs.
    const owners = [...new Set(rows.map((r) => r.user_id))];
    const paid = new Set<string>();
    if (owners.length) {
      const { data: profiles } = await admin.from("business_profile").select("user_id,plan").in("user_id", owners);
      for (const p of (profiles ?? []) as { user_id: string; plan: string | null }[]) if (p.plan === "paid") paid.add(p.user_id);
    }

    for (const owner of owners) {
      const mine = forOwner(rows, owner, paid, PER_OWNER) as Row[];
      if (!mine.length) {
        report.push({ owner, skipped: paid.has(owner) ? "paid plan -- photographs are kept" : "nothing old enough" });
        continue;
      }

      const { data: userInfo } = await admin.auth.admin.getUserById(owner);
      const to = userInfo?.user?.email;
      if (!to) {
        report.push({ owner, skipped: "no email address, so nothing could be sent -- and nothing removed" });
        continue;
      }

      const pages: DocPage[] = [];
      const kept: Row[] = [];
      for (const r of mine) {
        const page = await pageFor(admin, r.image_data_url!);
        // A photograph that cannot be fetched is left exactly where it is: it
        // is the one thing that must not be removed on a guess.
        if (page) {
          pages.push(page);
          kept.push(r);
        }
      }
      if (!pages.length) {
        report.push({ owner, skipped: "no photographs could be read" });
        continue;
      }

      const oldest = kept[0].date;
      const newest = kept[kept.length - 1].date;
      const pdf = await pagesToPdf(pages, `Receipt photographs ${oldest} to ${newest}`);

      if (!DELETING) {
        report.push({ owner, to, wouldEmail: kept.length, oldest, newest, pdfBytes: pdf.byteLength, removed: 0, note: "PHOTO_AGEING_DELETE is off: nothing was emailed or removed" });
        continue;
      }

      const res = await fetch(`${process.env.RESEND_API_BASE ?? "https://api.resend.com"}/emails`, {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM,
          to,
          subject: emailSubject(oldest, newest),
          text: emailBody(kept.length, oldest, newest),
          attachments: [{ filename: `receipts-${oldest}-to-${newest}.pdf`, content: Buffer.from(pdf).toString("base64") }],
        }),
      }).catch(() => null);

      if (!res || !res.ok) {
        // The whole point: a failed send means the photographs stay.
        report.push({ owner, to, attempted: kept.length, emailed: false, removed: 0, note: `send failed (${res?.status ?? "no answer"}) — photographs kept` });
        continue;
      }

      let removed = 0;
      for (const r of kept) {
        const ref = r.image_data_url!;
        if (stored(ref)) {
          const { error: rmError } = await admin.storage.from("receipts").remove([pathOf(ref)]);
          if (rmError) continue;
        }
        const details = { ...(r.details ?? {}), photoAgedAt: todayISO() };
        const { error: upError } = await admin.from("receipts").update({ image_data_url: null, details }).eq("id", r.id).eq("user_id", owner);
        if (!upError) removed += 1;
      }
      report.push({ owner, to, emailed: true, sent: kept.length, removed, oldest, newest });
    }

    return NextResponse.json({
      ran: true,
      deleting: DELETING,
      cutoff,
      days: DAYS,
      owners: owners.length,
      candidates: rows.length,
      keptBack: skipped.length,
      report,
    });
  } catch (err) {
    console.error("photos/age:", err);
    return NextResponse.json({ error: "The run failed. Nothing was removed.", report }, { status: 500 });
  }
}
