import type { SupabaseClient } from "@supabase/supabase-js";
import { RECEIPTS_BUCKET } from "@/lib/receiptsBucket";

const EXTENSIONS: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

// The server's side of receiptImages.storeImages, for documents that arrive
// without a signed-in browser (the email inbox): uploaded with the service
// role into the owner's folder, returning the same "storage:" reference. If
// storage can't be reached the document stays inline rather than being lost.
export async function storeImageForUser(admin: SupabaseClient, userId: string, mimeType: string, base64: string): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}/1.${EXTENSIONS[mimeType] ?? "jpg"}`;
  const { error } = await admin.storage.from(RECEIPTS_BUCKET).upload(path, Buffer.from(base64, "base64"), { contentType: mimeType, upsert: false });
  return error ? `data:${mimeType};base64,${base64}` : `storage:${path}`;
}
