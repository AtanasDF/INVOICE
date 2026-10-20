import { CSV_BOM, csvCell } from "@/lib/csv";
import { saveText } from "@/lib/saveFile";

export function downloadCsv(filename: string, rows: Record<string, string | number>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((h) => csvCell(row[h] ?? "")).join(",")),
  ];
  saveText(filename, CSV_BOM + lines.join("\n"), "text/csv");
}
