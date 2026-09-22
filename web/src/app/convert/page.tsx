"use client";

import { useMemo, useRef, useState } from "react";
import EmailFileForm from "@/components/EmailFileForm";
import Tip from "@/components/Tip";
import { Made, TARGETS, Target, convertFiles, kindOf, targetsFor } from "@/lib/convert";
import { saveBlob } from "@/lib/saveFile";

const KIND_WORDS: Record<string, string> = {
  image: "picture",
  pdf: "PDF",
  text: "words or rows",
  other: "not one we can change",
};

const BIG = "flex min-h-14 items-center justify-center rounded-lg px-4 py-3 text-center text-base font-bold";

export default function ConvertPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [made, setMade] = useState<Made[]>([]);
  const [busy, setBusy] = useState<Target | null>(null);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const kinds = useMemo(() => files.map((f) => kindOf(f)), [files]);
  const targets = useMemo(() => targetsFor(kinds), [kinds]);
  const stuck = files.length > 0 && targets.length === 0;

  function add(picked: FileList | null) {
    if (!picked?.length) return;
    setFiles((prev) => [...prev, ...Array.from(picked)]);
    setMade([]);
    setError(null);
  }

  function remove(i: number) {
    setFiles((prev) => prev.filter((_, n) => n !== i));
    setMade([]);
  }

  async function run(target: Target) {
    setBusy(target);
    setError(null);
    setMade([]);
    try {
      setMade(await convertFiles(files, target));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Those files couldn't be changed. Try one at a time.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-[2rem] font-bold leading-tight sm:text-4xl">Change a file</h1>
        <p className="mt-2 text-lg text-neutral-700">
          Turn a photo into a PDF, a PDF into pictures or words, a spreadsheet into data. It happens on your own phone or
          computer: nothing is sent anywhere.
        </p>
      </div>
      <Tip id="convert-how">How it works: choose your files, pick what you want them to become, then save what comes out or email it.</Tip>

      <div className="space-y-4 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <input
          ref={picker}
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
        <button type="button" onClick={() => picker.current?.click()} className={`${BIG} w-full bg-neutral-900 text-white`}>
          Choose files
        </button>

        {files.length > 0 && (
          <ul className="divide-y border-t">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium wrap-anywhere">{f.name}</span>
                  <span className="block text-xs text-neutral-500">{KIND_WORDS[kinds[i]]} · {Math.max(1, Math.round(f.size / 1024))} KB</span>
                </span>
                <button type="button" onClick={() => remove(i)} className="shrink-0 text-sm font-medium text-neutral-600 underline">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {stuck && <p className="text-base text-neutral-700">We can change pictures, PDFs, and files of words or rows. That one we can&apos;t.</p>}

        {targets.length > 0 && (
          <div>
            <p className="text-base font-medium text-neutral-800">Turn {files.length === 1 ? "it" : "them"} into</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {TARGETS.filter((t) => targets.includes(t.target)).map((t) => (
                <button
                  key={t.target}
                  type="button"
                  disabled={!!busy}
                  onClick={() => void run(t.target)}
                  className="flex flex-col items-start rounded-lg border px-4 py-3 text-left hover:bg-neutral-50 disabled:opacity-50"
                >
                  <span className="text-base font-medium">
                    {busy === t.target ? "Changing…" : t.label} <span className="font-normal text-neutral-500">{t.ending}</span>
                  </span>
                  <span className="text-sm text-neutral-600">{t.note}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p role="alert" className="text-base text-red-600">{error}</p>}
      </div>

      {made.length > 0 && (
        <div className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
          <h2 className="font-semibold">{made.length === 1 ? "Your file is ready" : `Your ${made.length} files are ready`}</h2>
          <ul className="divide-y border-t">
            {made.map((m, i) => (
              <li key={`${m.name}-${i}`} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0 truncate text-sm font-medium wrap-anywhere">{m.name}</span>
                <button type="button" onClick={() => saveBlob(m.name, m.blob)} className="shrink-0 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
                  Save
                </button>
              </li>
            ))}
          </ul>
          {made.length > 1 && (
            <button type="button" onClick={() => made.forEach((m) => saveBlob(m.name, m.blob))} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
              Save all {made.length}
            </button>
          )}
          {made.length === 1 && made[0].name.endsWith(".pdf") && <EmailFileForm file={async () => made[0]} idPrefix="convert" />}
        </div>
      )}
    </div>
  );
}
