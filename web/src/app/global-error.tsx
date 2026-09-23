"use client";

// error.tsx only catches what breaks inside the layout. If the layout itself
// throws there is no header, no styles and no app left -- so this one brings
// its own <html> and its own colours, and assumes nothing.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Arial, Helvetica, sans-serif", background: "#fafafa", color: "#171717" }}>
        <div style={{ maxWidth: 520, margin: "0 auto", padding: "48px 20px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>The app couldn&apos;t start</h1>
          <p style={{ marginTop: 8, color: "#525252", lineHeight: 1.5 }}>
            Nothing has been lost — your invoices and receipts are saved. Try again, and if it keeps happening, close the
            tab and open it fresh.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 20, background: "#171717", color: "#fff", border: 0, borderRadius: 8, padding: "10px 18px", fontSize: 15, fontWeight: 600 }}
          >
            Try again
          </button>
          {error.digest && <p style={{ marginTop: 14, fontSize: 12, color: "#737373" }}>Reference {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
