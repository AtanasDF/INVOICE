export function isPdfDataUrl(url: string | null | undefined): boolean {
  return !!url && url.startsWith("data:application/pdf");
}
