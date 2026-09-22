import { supabase } from "@/lib/supabaseClient";
import { RECEIPTS_BUCKET } from "@/lib/receiptsBucket";
import { inlineImage, resolveImages } from "@/lib/receiptImages";

// The business logo (Settings; Atanas's list, item 40). Stored like receipt
// photos: in the private bucket under the account's own folder, the profile
// keeping "storage:<path>" in logo_url. The invoice and quote sheets are
// given it as a data: URL, so the PDF (drawn from the page) never needs a
// cross-origin image, and a signed link never goes stale on a sheet.
const MAX_SIDE = 600;
const cache = new Map<string, Promise<string | null>>();

/** A stored logo as a data: URL for the sheets; null when there's none or it can't be fetched. */
export function logoSrc(ref: string | null | undefined): Promise<string | null> {
  if (!ref) return Promise.resolve(null);
  if (ref.startsWith("data:image/")) return Promise.resolve(ref);
  let hit = cache.get(ref);
  if (!hit) {
    hit = (async () => {
      try {
        const [signed] = await resolveImages([ref]);
        if (!signed || signed.startsWith("storage:")) return null;
        return await inlineImage(signed);
      } catch {
        return null;
      }
    })();
    cache.set(ref, hit);
  }
  return hit;
}

/** A picked image made small enough for a letterhead, PNG kept as PNG so a clear background stays clear. */
export async function prepareLogo(file: File): Promise<{ dataUrl: string; blob: Blob; ext: "png" | "jpg" }> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error("A logo has to be a picture: PNG or JPEG.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That picture couldn't be opened."));
      el.src = url;
    });
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = file.type !== "image/jpeg";
    const dataUrl = canvas.toDataURL(png ? "image/png" : "image/jpeg", 0.9);
    const blob = await (await fetch(dataUrl)).blob();
    return { dataUrl, blob, ext: png ? "png" : "jpg" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Uploads a prepared logo; returns the "storage:" reference for logo_url. */
export async function uploadLogo(userId: string, blob: Blob, ext: "png" | "jpg"): Promise<string> {
  const path = `${userId}/logo/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(RECEIPTS_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw error;
  return `storage:${path}`;
}
