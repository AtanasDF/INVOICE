export const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
