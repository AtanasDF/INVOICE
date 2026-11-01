import { PERSONAL_LABEL, categoryChoices } from "@/lib/categories";

// The <option>s for a category drop-down: the account's own list, then
// personal spending in a group of its own, so a business list never mixes
// the two on one level and a personal category is still there to pick.
export default function CategoryOptions({ list, current }: { list: string[]; current: string | null | undefined }) {
  const { main, personal } = categoryChoices(list, current);
  return (
    <>
      {main.map((c) => <option key={c} value={c}>{c}</option>)}
      {personal.length > 0 && (
        <optgroup label={PERSONAL_LABEL}>
          {personal.map((c) => <option key={c} value={c}>{c}</option>)}
        </optgroup>
      )}
    </>
  );
}
