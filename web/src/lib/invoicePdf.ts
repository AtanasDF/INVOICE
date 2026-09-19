// The on-screen A4 sheet, photographed at 2x and cut into A4 pages. Image
// based rather than laid out as PDF text, so it is exactly what the preview
// shows on every layout.
export async function renderInvoicePdf(sheet: HTMLElement): Promise<{ base64: string; save: (filename: string) => void }> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const options = { pixelRatio: 2, backgroundColor: "#ffffff" };
  // Safari leaves images (the signature) out of the first capture.
  await toCanvas(sheet, options);
  const canvas = await toCanvas(sheet, options);

  const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const pxPerPt = canvas.width / pageW;
  const slice = Math.floor(pageH * pxPerPt);
  for (let y = 0, page = 0; y < canvas.height; y += slice, page++) {
    const h = Math.min(slice, canvas.height - y);
    // A sliver left over after the last full page is margin, not content.
    if (page > 0 && h < slice * 0.04) break;
    const part = document.createElement("canvas");
    part.width = canvas.width;
    part.height = h;
    part.getContext("2d")?.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    if (page > 0) pdf.addPage();
    pdf.addImage(part.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, pageW, h / pxPerPt);
  }
  return { base64: pdf.output("datauristring").split(",")[1], save: (filename) => pdf.save(filename) };
}
