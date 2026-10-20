import { useEffect, useRef, useState } from "react";
import { autosaveStep, clearFormDraft, hasWork, readFormDraft, writeFormDraft, type DraftKind, type InvoiceDraftFields, type ReceiptDraftFields, type SavedDraft } from "@/lib/formDraft";

type FieldsOf<K extends DraftKind> = K extends "receipt" ? ReceiptDraftFields : InvoiceDraftFields;

// Keeps the form in localStorage on every change and offers a kept one back.
// The rules are in formDraft.ts; this only wires them to React.
export function useFormDraft<K extends DraftKind>(kind: K, fields: FieldsOf<K>, paused: boolean) {
  const [offer, setOffer] = useState<SavedDraft<K> | null>(() => readFormDraft(kind));
  const snapshot = JSON.stringify(fields);
  const [opened] = useState(snapshot);
  const work = hasWork(kind, fields);
  const changed = snapshot !== opened;
  const done = useRef(false);

  // Typing over the offer keeps the newest work, so the offer goes.
  if (offer && work && changed && !paused) setOffer(null);

  useEffect(() => {
    if (done.current) return;
    const step = autosaveStep({ work, changed, offerPending: !!offer, paused });
    if (step === "write") writeFormDraft(kind, JSON.parse(snapshot));
    else if (step === "clear") clearFormDraft(kind);
  }, [kind, snapshot, work, changed, offer, paused]);

  return {
    offer,
    take() {
      setOffer(null);
      return offer?.fields ?? null;
    },
    discard() {
      setOffer(null);
      clearFormDraft(kind);
    },
    // Saved for real: the draft goes and nothing writes it back on the way out.
    finish() {
      done.current = true;
      clearFormDraft(kind);
    },
  };
}
