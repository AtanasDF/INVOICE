import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/siteName";

// What shows when the link is pasted into a WhatsApp group, which on a plan
// built on depot flyers and word of mouth is how most people will first see
// it. Drawn at request time rather than kept as a file, so it can never drift
// out of step with what the app says about itself.
export const alt = `${SITE_NAME} — invoices and receipts for the self-employed`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#fafafa",
          color: "#171717",
          padding: "72px 80px",
          fontFamily: "Helvetica, Arial, sans-serif",
        }}
      >
        <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>{SITE_NAME}</div>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.1, marginTop: 28, maxWidth: 900 }}>
          Invoices, receipts and what you&apos;re owed, in one place.
        </div>
        <div style={{ fontSize: 34, color: "#525252", marginTop: 28 }}>
          Photograph a bill and it reads itself. Free, on your phone.
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 44 }}>
          {["Make an invoice", "Photograph a receipt", "See what you're owed"].map((t) => (
            <div
              key={t}
              style={{
                fontSize: 26,
                color: "#404040",
                border: "2px solid #d4d4d4",
                borderRadius: 999,
                padding: "10px 24px",
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
