// A zip file, written in the browser. Store-only, no compression: every
// file going into one of these is a JPEG, a PNG or a PDF, all of which are
// compressed already -- deflating them again would cost seconds on a phone
// and save nothing. No dependency for the same reason.

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array<ArrayBuffer>): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { name: string; bytes: Uint8Array<ArrayBuffer> };

// The plain zip format keeps its offsets and counts in 32 and 16 bits. Past
// either, a reader is handed a file that opens to nothing or to the wrong
// files, which is worse than being told it is too big to make.
const MAX_FILES = 65535;
const MAX_BYTES = 0xffffffff;

// Two files cannot share a name inside a zip, and several receipts from one
// supplier on one day is the ordinary case, not an edge.
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const key = name.toLowerCase();
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    if (n === 0) return name;
    const dot = name.lastIndexOf(".");
    return dot > 0 ? `${name.slice(0, dot)} (${n + 1})${name.slice(dot)}` : `${name} (${n + 1})`;
  });
}

export function makeZip(entries: ZipEntry[]): Blob {
  if (entries.length > MAX_FILES) {
    throw new Error(`That is ${entries.length.toLocaleString()} files, and a zip holds ${MAX_FILES.toLocaleString()}. Narrow the dates and save it in two goes.`);
  }
  const encoder = new TextEncoder();
  const names = uniqueNames(entries.map((e) => e.name));
  const locals: Uint8Array<ArrayBuffer>[] = [];
  const centrals: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  entries.forEach((entry, i) => {
    const name = encoder.encode(names[i]);
    const crc = crc32(entry.bytes);
    const size = entry.bytes.length;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    // Bit 11: the name is UTF-8, so a supplier with an accent in its name
    // does not come out as mojibake on someone else's machine.
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    locals.push(local, entry.bytes);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length + size;
    if (offset > MAX_BYTES) {
      throw new Error("That is more than a plain zip file can hold. Narrow the dates and save it in two goes.");
    }
  });

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...locals, ...centrals, end], { type: "application/zip" });
}
