// The email Atanas gets for every piece of feedback (2026-09-22: "I want to
// be able to receive them on emails, so you can see them, and then we can
// work on them"). Everything in it was typed by the sender, so it is all
// escaped; the layout is plain on purpose, it is a note, not a newsletter.
export const FEEDBACK_MAX = 5000;

export type FeedbackEmailInput = {
  message: string;
  category: string;
  page: string;
  senderEmail: string;
  senderId: string;
  at: string;
  userAgent: string;
  commit: string;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function londonTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function feedbackEmailSubject(i: Pick<FeedbackEmailInput, "category" | "page">): string {
  return `Feedback: ${i.category || "Other"} — ${i.page || "unknown page"}`;
}

const lines = (i: FeedbackEmailInput) => [
  `From: ${i.senderEmail || "unknown"} (${i.senderId})`,
  `Page: ${i.page || "unknown"}`,
  `When: ${londonTime(i.at)} (London)`,
  `Browser: ${i.userAgent || "unknown"}`,
  `Build: ${i.commit || "unknown"}`,
];

export function feedbackEmailText(i: FeedbackEmailInput): string {
  return `${i.message}\n\n---\n${lines(i).join("\n")}\n`;
}

export function feedbackEmailHtml(i: FeedbackEmailInput): string {
  return (
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#171717">` +
    `<pre style="white-space:pre-wrap;font:inherit;margin:0 0 16px">${esc(i.message)}</pre>` +
    `<p style="margin:0;color:#525252;font-size:13px">${lines(i).map(esc).join("<br>")}</p>` +
    `</div>`
  );
}
