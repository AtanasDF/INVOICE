// Where the site lives, for the absolute addresses that sharing and search
// need. Its own file because Next allows only its own known exports from a
// layout — a stray `export const` there is a type error, not a style choice.
// Overridable so a preview never advertises itself as production.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://invoice-omega-rust.vercel.app";
