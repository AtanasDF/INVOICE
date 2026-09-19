import { supabase } from "@/lib/supabaseClient";

// Receipt photos and PDFs live in a private storage bucket, one folder per
// account; the receipt row keeps "storage:<path>" in image_data_url, where
// the photo itself used to be. Rows from before (and inbox imports) still
// hold a data: URL, and both kinds keep working.
export const RECEIPTS_BUCKET = "receipts";
const PREFIX = "storage:";
// Long enough for a page left open all day.
const SIGNED_FOR_SECONDS = 12 * 60 * 60;

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

// Stored references become short-lived signed URLs for <img> and links
// (null if one can't be signed); anything else passes through.
export async function resolveImages(values: (string | null)[]): Promise<(string | null)[]> {
  const paths = [...new Set(values.filter(isStoredRef).map((v) => v.slice(PREFIX.length)))];
  if (!paths.length) return values;
  const { data, error } = await supabase.storage.from(RECEIPTS_BUCKET).createSignedUrls(paths, SIGNED_FOR_SECONDS);
  // A signing hiccup hides the photos for now; it mustn't take the list down.
  if (error) console.error("receipt photos couldn't be signed:", error.message);
  const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return values.map((v) => (isStoredRef(v) ? (byPath.get(v.slice(PREFIX.length)) ?? null) : v));
}

// For the data export: a stored photo is fetched and inlined so the export
// file holds the image itself, not a link that expires.
export async function inlineImage(url: string | null): Promise<string | null> {
  if (!url || url.startsWith("data:")) return url;
  const blob = await (await fetch(url)).blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Couldn't read a stored photo for the export."));
    reader.readAsDataURL(blob);
  });
}
