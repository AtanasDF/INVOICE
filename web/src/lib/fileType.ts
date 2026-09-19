// An inline PDF, or a stored one's signed URL (its path ends in .pdf).
export function isPdfDataUrl(url: string | null | undefined): boolean {
  return !!url && (url.startsWith("data:application/pdf") || /\.pdf(\?|$)/i.test(url));
}
