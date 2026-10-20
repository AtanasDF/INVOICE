import { saveText } from "@/lib/saveFile";

export function downloadJson(filename: string, data: unknown) {
  saveText(filename, JSON.stringify(data, null, 2), "application/json");
}
