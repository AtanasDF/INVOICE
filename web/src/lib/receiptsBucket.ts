// The private storage bucket for receipt photos and PDFs (migration-019).
export const RECEIPTS_BUCKET = "receipts";

// Kept out of the browser's own cache: a receipt photo opened on a shared
// computer stayed readable from it for an hour after signing out. Storage
// sends this as max-age; the signed link is what lets the owner in.
export const PRIVATE_FILE_CACHE = "0";
