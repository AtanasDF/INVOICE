"use client";

import { useEffect, useRef } from "react";

// Asks before leaving a page whose work lives only in memory: a link, the
// header's Sign out, the browser's Back or a swipe back on the phone. The
// same catch as Settings' unsaved-changes bar (settings/page.tsx), asked with
// window.confirm, because the pages that use this already ask their other
// questions that way. `onLeave` runs once leaving is agreed to.
export function useLeaveGuard(active: boolean, question: string, onLeave?: () => void) {
  const onLeaveRef = useRef(onLeave);
  useEffect(() => {
    onLeaveRef.current = onLeave;
  });

  useEffect(() => {
    if (!active) return;
    const beforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    // Caught before React sees the click, so neither a plain link nor a
    // Next.js one gets to navigate unless the answer is yes.
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const button = target?.closest?.("button");
      const signOut = !!button && button.textContent?.trim() === "Sign out";
      if (!signOut) {
        const a = target?.closest?.("a[href]") as HTMLAnchorElement | null;
        if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === "_blank") return;
        const href = a.getAttribute("href") ?? "";
        if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("sms:")) return;
        if (new URL(a.href, window.location.href).pathname === window.location.pathname) return;
      }
      if (window.confirm(question)) {
        onLeaveRef.current?.();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    };
    // Back is a route change with no click and no unload. A copy of this
    // entry sits on top (Next's own state kept in it, or it would reload the
    // page), so Back lands here again and can be asked about.
    let leaving = false;
    const onPop = () => {
      if (leaving) return;
      if (window.confirm(question)) {
        leaving = true;
        onLeaveRef.current?.();
        window.history.back();
        return;
      }
      window.history.pushState({ ...(window.history.state ?? {}), unsaved: true }, "", window.location.href);
    };
    if (!window.history.state?.unsaved) {
      window.history.pushState({ ...(window.history.state ?? {}), unsaved: true }, "", window.location.href);
    }
    window.addEventListener("popstate", onPop);
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [active, question]);
}
