import type { SupabaseClient } from "@supabase/supabase-js";
import { RECEIPTS_BUCKET } from "@/lib/receiptsBucket";

// The logo for a customer's /i/ or /q/ page, read with the service role and
// handed over inline. The service role reads any account's files, so a
// logo_url pointing outside the owner's own folder is refused: a profile row
// is the owner's to write, and it must not be a way to show someone else's
// photo on a public page.
export async function logoForOwner(admin: SupabaseClient, ownerId: string, ref: unknown): Promise<string | null> {
  if (typeof ref !== "string" || !ref.startsWith("storage:")) return null;
  const path = ref.slice("storage:".length);
  if (!path.startsWith(`${ownerId}/logo/`) || path.includes("..")) return null;
  try {
    const { data, error } = await admin.storage.from(RECEIPTS_BUCKET).download(path);
    if (error || !data || !/^image\/(png|jpeg|webp|gif)$/.test(data.type) || data.size > 1_000_000) return null;
    return `data:${data.type};base64,${Buffer.from(await data.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}
