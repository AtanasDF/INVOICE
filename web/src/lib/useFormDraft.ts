import { useEffect, useRef, useState } from "react";
import { autosaveStep, clearFormDraft, hasWork, readFormDraft, writeFormDraft, type DraftKind, type FieldsOf, type SavedDraft } from "@/lib/formDraft";

// Keeps the form in localStorage on every change and offers a kept one back.
// The rules are in formDraft.ts; this only wires them to React.
//
// `scope` is the record being edited. `baseline` is what the form opened
// with, for a form that loads a record after its first render: then only a
// difference from it is work, and a kept draft identical to it is not offered.
export function useFormDraft<K extends DraftKind>(kind: K, fields: FieldsOf<K>, paused: boolean, opts: { scope?: string; baseline?: string } = {}) {
  const { scope, baseline } = opts;
  const [read, setRead] = useState<SavedDraft<K> | null>(() => readFormDraft(kind, scope));
  const snapshot = JSON.stringify(fields);
  const [opened] = useState(snapshot);
  const changed = snapshot !== (baseline ?? opened);
  const work = hasWork(kind, fields) && (baseline === undefined || changed);
  const offer = read && baseline !== undefined && JSON.stringify(read.fields) === baseline ? null : read;
  const done = useRef(false);

  // Typing over the offer keeps the newest work, so the offer goes.
  if (read && work && changed && !paused) setRead(null);

  useEffect(() => {
    if (done.current) return;
    const step = autosaveStep({ work, changed, offerPending: !!offer, paused });
    if (step === "write") writeFormDraft(kind, JSON.parse(snapshot), scope);
    else if (step === "clear") clearFormDraft(kind, scope);
  }, [kind, scope, snapshot, work, changed, offer, paused]);

  return {
    offer,
    take() {
      setRead(null);
      return offer?.fields ?? null;
    },
    discard() {
      setRead(null);
      clearFormDraft(kind, scope);
    },
    // Saved for real: the draft goes and nothing writes it back on the way out.
    finish() {
      done.current = true;
      clearFormDraft(kind, scope);
    },
  };
}
