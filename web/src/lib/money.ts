export function money(n: number): string {
  return n < 0 ? `−£${(-n).toFixed(2)}` : `£${n.toFixed(2)}`;
}
