import { supabase } from "@/lib/supabaseClient";
import { RECEIPTS_BUCKET } from "@/lib/receiptsBucket";

export { RECEIPTS_BUCKET };

// Receipt photos and PDFs live in a private storage bucket, one folder per
// account; the receipt row keeps "storage:<path>" in image_data_url, where
// the photo itself used to be. Rows from before (and inbox imports) still
// hold a data: URL, and both kinds keep working.
const PREFIX = "storage:";
// A week: the app lives on a phone home screen and iOS resumes it without
// reloading, so links signed on Monday must still work on Friday.
const SIGNED_FOR_SECONDS = 7 * 24 * 60 * 60;

export function isStoredRef(value: string | null | undefined): value is string {
  return !!value && value.startsWith(PREFIX);
}

function extensionFor(type: string): string {
  if (type === "application/pdf") return "pdf";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "jpg";
}

// Uploads data: URLs and returns their references, in order. If storage
// can't be reached the photos stay inline, as before, rather than the
// receipt failing to save.
export async function storeImages(userId: string, dataUrls: (string | null)[]): Promise<(string | null)[]> {
  const folder = crypto.randomUUID();
  try {
    return await Promise.all(
      dataUrls.map(async (url, i) => {
        if (!url || !url.startsWith("data:")) return url;
        const blob = await (await fetch(url)).blob();
        const path = `${userId}/${folder}/${i + 1}.${extensionFor(blob.type)}`;
        const { error } = await supabase.storage.from(RECEIPTS_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
        if (error) throw error;
        return PREFIX + path;
      })
    );
  } catch (err) {
    console.error("receipt photo upload failed, keeping it inline:", err);
    return dataUrls;
  }
}

// Stored references become signed URLs for <img> and links; anything else
// passes through. One that can't be signed stays a "storage:" reference, so
// the page still knows a photo exists (it doesn't say "No attachment") and
// the export can refuse rather than leave it out.
export async function resolveImages(values: (string | null)[]): Promise<(string | null)[]> {
  const paths = [...new Set(values.filter(isStoredRef).map((v) => v.slice(PREFIX.length)))];
  if (!paths.length) return values;
  const { data, error } = await supabase.storage.from(RECEIPTS_BUCKET).createSignedUrls(paths, SIGNED_FOR_SECONDS);
  // A signing hiccup mustn't take the list down.
  if (error) console.error("receipt photos couldn't be signed:", error.message);
  const byPath = new Map((data ?? []).filter((d) => d.signedUrl && !d.error).map((d) => [d.path, d.signedUrl]));
  return values.map((v) => (isStoredRef(v) ? (byPath.get(v.slice(PREFIX.length)) ?? v) : v));
}

// For the data export: a stored photo is fetched and inlined so the export
// file holds the image itself, not a link that expires.
export async function inlineImage(url: string | null): Promise<string | null> {
  if (!url || url.startsWith("data:")) return url;
  if (isStoredRef(url)) throw new Error("A stored photo couldn't be reached, so the export was stopped rather than leave it out. Try again.");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`A stored photo couldn't be downloaded (${res.status}), so the export was stopped. Try again.`);
  const blob = await res.blob();
  if (!/^image\/|^application\/pdf/.test(blob.type)) throw new Error("A stored photo came back as something else, so the export was stopped. Try again.");
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Couldn't read a stored photo for the export."));
    reader.readAsDataURL(blob);
  });
}
