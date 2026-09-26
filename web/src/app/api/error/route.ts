import { NextResponse } from "next/server";
import { ERROR_LIMITS, errorKey, tidyReport } from "@/lib/errorReport";
import { addressKey, allowShared } from "@/lib/rateLimit";
import { SITE_NAME } from "@/lib/siteName";

export const runtime = "nodejs";
export const maxDuration = 15;

const HOUR = 60 * 60 * 1000;
const FROM = `${SITE_NAME} <feedback@invoiceover.com>`;

// Deliberately NOT signed-in only, unlike every other route that does work.
//
// The failures worth hearing about most are the ones where somebody cannot get
// in: a sign-in that throws, a front door that will not render, the app failing
// before there is a session to check. Requiring a bearer here would silence
// exactly those. The fences are the rate limits instead, and the payload is
// tiny and fixed.
export async function POST(req: Request) {
  const ip = addressKey(req.headers.get("x-forwarded-for"));
  if (!(await allowShared(`err:ip:${ip}`, ERROR_LIMITS.perIp, HOUR))) return NextResponse.json({ ok: true });
  if (!(await allowShared("err:global", ERROR_LIMITS.global, HOUR))) return NextResponse.json({ ok: true });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const report = tidyReport((body ?? {}) as Record<string, string>);
  // Noise, or nothing to say. Answered with ok so a broken page never sees an
  // error about its error.
  if (!report) return NextResponse.json({ ok: true });

  // Every report reaches the log. This is the line to grep in Vercel:
  // one prefix, one line, no interpolation of anything unbounded.
  console.error(
    `[app-error] ${report.kind} path=${report.path} digest=${report.digest || "-"} ua=${(req.headers.get("user-agent") ?? "").slice(0, 80)} :: ${report.message}\n${report.stack}`
  );

  // Emails are capped far harder than reports: a render that throws in a loop
  // would otherwise mail itself hundreds of times, which is worse than the bug
  // it is reporting. Keyed by the fault, so the same one does not arrive twice
  // while a different one still gets through.
  const key = errorKey(report);
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.FEEDBACK_TO;
  if (apiKey && to && (await allowShared(`err:mail:${key}`, 1, HOUR)) && (await allowShared("err:mail", ERROR_LIMITS.emailsPerHour, HOUR))) {
    const text = [
      `${report.message}`,
      ``,
      `where: ${report.path}`,
      `kind:  ${report.kind}`,
      report.digest ? `digest: ${report.digest}` : "",
      `agent: ${(req.headers.get("user-agent") ?? "").slice(0, 200)}`,
      `build: ${(process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || "local"}`,
      ``,
      report.stack,
    ].filter(Boolean).join("\n");
    try {
      await fetch(`${process.env.RESEND_API_BASE ?? "https://api.resend.com"}/emails`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [to], subject: `App error: ${report.message.slice(0, 80)}`, text }),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      // The log already has it; an unreachable Resend must not turn an error
      // report into a second error.
    }
  }

  return NextResponse.json({ ok: true });
}
