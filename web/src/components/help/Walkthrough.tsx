"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { frameSrc, type HelpJourney } from "@/lib/helpJourneys";
import { readTheme, subscribeTheme } from "@/lib/theme";
import { useReducedMotion } from "@/lib/reducedMotion";

// One walkthrough, stepped by hand.
//
// Nothing plays by itself. A loop that moves at somebody else's pace is the
// opposite of help for the person this is for, and `prefers-reduced-motion`
// has to be honoured by anything that moves at all -- so there is a Play, it
// is off until asked, and it is not offered at all to somebody who has
// turned motion down.
//
// Every step's words are on the page whether the picture loads or not: they
// are the walkthrough on a bad connection, and the alternative for anyone
// who cannot see it.
export default function Walkthrough({ journey }: { journey: HelpJourney }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const reduced = useReducedMotion();
  // The resolved theme, not the phone's: somebody who picked Dark on a light
  // phone must get the dark frames, and the theme is the only thing that knows
  // both. Subscribed rather than read into state in an effect, so changing the
  // colour while a walkthrough is open swaps the pictures with it. The server
  // has no theme, so it renders the light set and the browser corrects it --
  // frames only load once a journey is opened, so nothing flashes.
  const dark = useSyncExternalStore(subscribeTheme, () => readTheme() === "dark", () => false);
  const [broken, setBroken] = useState(false);
  const last = journey.steps.length - 1;

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      setStep((s) => (s >= last ? s : s + 1));
      setPlaying((p) => (step >= last - 1 ? false : p));
    }, 3200);
    return () => clearTimeout(t);
  }, [playing, step, last]);

  return (
    <section className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
      <h2 className="text-lg font-bold">{journey.title}</h2>
      <p className="mt-1 text-sm text-neutral-600">{journey.summary}</p>

      {/* The picture illustrates; the words below ARE the step. If the frames
          have never been recorded the walkthrough still works. */}
      {!broken && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={frameSrc(journey.id, step, dark)}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
          className="mt-4 w-full max-w-sm rounded-lg border bg-neutral-50"
        />
      )}

      <ol className="mt-4 space-y-2">
        {journey.steps.map((s, i) => (
          <li key={i} className={`flex gap-3 text-sm ${i === step ? "font-medium text-neutral-900" : "text-neutral-500"}`}>
            <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${i === step ? "bg-neutral-900 text-white" : "bg-neutral-100"}`}>
              {i + 1}
            </span>
            <button type="button" onClick={() => { setStep(i); setPlaying(false); }} className="min-h-6 wrap-anywhere text-left">
              {s.caption}
            </button>
          </li>
        ))}
      </ol>

      {/* Read out as it changes, for somebody stepping through by keyboard
          with the pictures off. */}
      <p role="status" className="sr-only">
        Step {step + 1} of {journey.steps.length}. {journey.steps[step].caption}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => { setStep((s) => Math.max(0, s - 1)); setPlaying(false); }}
          disabled={step === 0}
          className="min-h-11 rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-40"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => { setStep((s) => Math.min(last, s + 1)); setPlaying(false); }}
          disabled={step === last}
          className="min-h-11 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Next
        </button>
        {/* Not offered at all to somebody who has asked for less movement: a
            disabled Play would just be a puzzle. */}
        {!reduced && (
          <button type="button" onClick={() => setPlaying((p) => !p)} className="min-h-11 text-sm font-medium text-neutral-700 underline">
            {playing ? "Stop" : "Play it through"}
          </button>
        )}
        <Link href={journey.start} className="min-h-11 text-sm font-medium text-neutral-700 underline">
          Do it now
        </Link>
      </div>
    </section>
  );
}
