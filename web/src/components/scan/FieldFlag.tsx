export type Confidence = "high" | "low";

export default function FieldFlag({ confidence }: { confidence: Confidence | null }) {
  if (confidence !== "low") return null;
  return (
    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
      double-check this
    </span>
  );
}
