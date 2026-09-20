import type { NextConfig } from "next";

// Deliberately no Permissions-Policy: the scanner needs the camera, and a
// wrong value there breaks it silently on the one feature he uses most.
const SECURITY_HEADERS = [
  // Nothing here is meant to be framed. Without this, a page anywhere can
  // put the app in an invisible frame and collect taps meant for something
  // else -- on invoices, "Mark as paid" and "Remove" are taps worth stealing.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  // A private invoice link is a secret in a URL. The /i/ and /q/ pages
  // already send no referrer at all; this keeps the rest of the app from
  // handing its addresses to anywhere a customer clicks through to.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const nextConfig: NextConfig = {
  headers() {
    return Promise.resolve([
      {
        source: "/vendor/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      { source: "/:path*", headers: SECURITY_HEADERS },
    ]);
  },
};

export default nextConfig;
