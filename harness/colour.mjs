// Turning any CSS colour into real sRGB bytes, inside the page.
//
// Tailwind v4 emits colours in modern spaces, and Chrome serialises them
// back as `lab(37.88 37.17 52.27)` and `oklch(...)`. Every contrast check
// here matched /rgba?\(([^)]+)\)/ and returned null otherwise -- so an
// element whose colour is lab() was SKIPPED rather than measured. With
// Tailwind v4 that is every amber, red, green and blue in the app: the
// overdue banner, the paid badge, the needs-review pill. test-readable has
// been reporting green while never looking at any of them.
//
// Drawing the colour onto a 1x1 canvas and reading the pixel back is the
// one method that cannot care what space it was written in: the browser
// does the conversion because it has to paint it.
export const COLOUR_FN = `(() => {
  const __c = document.createElement("canvas");
  __c.width = 1; __c.height = 1;
  const __x = __c.getContext("2d", { willReadFrequently: true });
  const toRgb = (css) => {
    if (!css || /transparent/.test(css)) return null;
    const m = css.match(/rgba?\\(([^)]+)\\)/);
    if (m) {
      const p = m[1].split(/[,\\s\\/]+/).filter(Boolean).map(Number);
      if (p[3] === 0) return null;
      return [p[0], p[1], p[2]];
    }
    __x.clearRect(0, 0, 1, 1);
    __x.fillStyle = "#000";
    const before = __x.fillStyle;
    __x.fillStyle = css;
    // A colour the browser cannot read leaves fillStyle untouched.
    if (__x.fillStyle === before && css !== "#000000" && css !== "black") return null;
    __x.fillRect(0, 0, 1, 1);
    const d = __x.getImageData(0, 0, 1, 1).data;
    return d[3] === 0 ? null : [d[0], d[1], d[2]];
  };
  const luminance = (rgb) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  };
  const contrast = (a, b) => {
    const l1 = luminance(a), l2 = luminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const behind = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = toRgb(getComputedStyle(n).backgroundColor);
      if (c) return c;
    }
    return [255, 255, 255];
  };
  // Returned rather than left as bindings: a const declared inside eval()
  // does not escape it, so the first version defined everything and the
  // page then reported "toRgb is not defined".
  return { toRgb, luminance, contrast, behind };
})()`;
