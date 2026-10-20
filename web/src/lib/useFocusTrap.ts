"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

// A modal that only says aria-modal still lets Tab walk out into the header,
// the footer and the Feedback pill under it, and leaves focus wherever it was
// when it opened (WCAG 2.4.3). This moves focus in, keeps Tab inside, and gives
// it back to whatever opened it. Escape stays with each dialog, which knows how
// it closes.
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const start = ref.current;
    if (!start) return;
    const was = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const opener = was && !start.contains(was) ? was : null;
    const items = (box: HTMLElement) =>
      [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest("[inert]") && el.getClientRects().length > 0);
    if (!start.contains(document.activeElement)) {
      const box = start;
      const first = items(box)[0];
      if (first) first.focus();
      else {
        if (!box.hasAttribute("tabindex")) box.tabIndex = -1;
        box.focus();
      }
    }
    // Read afresh on every key: the element can be swapped while the trap is
    // up (the camera falls back to its other screen), and a stale one would
    // hold Tab against nothing.
    const onKey = (e: KeyboardEvent) => {
      const box = ref.current;
      if (e.key !== "Tab" || !box?.isConnected) return;
      const list = items(box);
      if (!list.length) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const here = document.activeElement;
      if (!box.contains(here)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && here === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && here === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, [active, ref]);
}
