// Where one of several documents sits on a shared page or photo:
// [ymin, xmin, ymax, xmax] on 0-1000 of the page, top-left origin.
export type DocumentBox = [number, number, number, number];

// The box as fractions of the page with a few percent round it, so an edge
// the model drew a little tight isn't cut off.
export function padded(box: DocumentBox, pad = 0.03): DocumentBox {
  const [ymin, xmin, ymax, xmax] = box.map((v) => v / 1000);
  return [Math.max(0, ymin - pad), Math.max(0, xmin - pad), Math.min(1, ymax + pad), Math.min(1, xmax + pad)];
}
