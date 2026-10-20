// The first n characters as a reader counts them: slice(0, n) counts UTF-16
// units, and could end a file name on half an emoji or a letter without its
// accent. A file of its own because both the server's PDF code and the
// browser's saving code need it, and neither may import the other.
export function firstChars(s: string, n: number): string {
  return [...new Intl.Segmenter().segment(s)].slice(0, n).map((x) => x.segment).join("");
}
