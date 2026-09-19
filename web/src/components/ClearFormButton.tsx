"use client";

// Empties a form being filled in. It sits beside Save, so it asks first.
export default function ClearFormButton({ onClear, disabled = false, className = "" }: { onClear: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (window.confirm("Clear the form? Everything you've entered here will be removed.")) onClear();
      }}
      className={`rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-40 ${className}`}
    >
      Clear form
    </button>
  );
}
