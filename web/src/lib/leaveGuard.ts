import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/signOut";

// A link tapped with no signal is not a client navigation any more: Next falls
// back to a full page load, the worker answers it with /offline.html, and a half
// typed receipt or invoice was gone under a page saying nothing had been lost
// (notes/audit-offline.md 4c). The browser's own "Leave this page?" stops that
// on a computer and on Android. iPhone Safari ignores beforeunload, so there
// the form is kept as it is typed instead (formDraft.ts) and offered back.
export function useLeaveGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const ask = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [dirty]);
}

export type LeaveTo = string | "back" | "signout";

// The rest of what leaving looks like, which beforeunload never sees: a
// tapped link, the header's Sign out and Back (or the iPhone's edge swipe),
// all of them client-side. Lifted from Settings, which had it first. Caught
// before React sees the click, so neither a plain link nor a Next one gets
// to navigate; `onLeave` is told where to and decides.
//
// Back is a route change with no click and no unload. A copy of this entry is
// pushed on top, so Back lands here again and can be asked about; Next's own
// state is kept in the copy, or it would reload the page. Going back for real
// is then two steps (leaveTo).
export function useNavigationGuard(dirty: boolean, onLeave: (to: LeaveTo) => void) {
  const ask = useRef(onLeave);
  useEffect(() => {
    ask.current = onLeave;
  });
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const signOutButton = target?.closest?.("button");
      if (signOutButton && signOutButton.textContent?.trim() === "Sign out") {
        e.preventDefault();
        e.stopPropagation();
        ask.current("signout");
        return;
      }
      const a = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === "_blank") return;
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("sms:")) return;
      // A link to this very page goes nowhere; let it be.
      if (new URL(a.href, window.location.href).pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      ask.current(href);
    };
    const onPop = () => {
      window.history.pushState({ ...(window.history.state ?? {}), unsaved: true }, "", window.location.href);
      ask.current("back");
    };
    window.history.pushState({ ...(window.history.state ?? {}), unsaved: true }, "", window.location.href);
    window.addEventListener("popstate", onPop);
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
}

// Where a guarded page goes once leaving is agreed. The copy pushed while
// dirty sits on top of the original, so Back is two steps.
export function leaveTo(to: LeaveTo, push: (href: string) => void, signOut: () => void) {
  if (to === "back") window.history.go(-2);
  else if (to === "signout") signOut();
  else push(to);
}

// The plain version for a short form with nothing kept behind it: the
// browser's own confirm, naming what goes. `question` is asked as it is.
export function useConfirmLeave(dirty: boolean, question: string) {
  const router = useRouter();
  const [released, setReleased] = useState(false);
  const pending = useRef<LeaveTo | null>(null);
  useNavigationGuard(dirty && !released, (to) => {
    if (!window.confirm(question)) return;
    pending.current = to;
    setReleased(true);
  });
  // Leave only once the guard is down, or its own listeners catch the
  // navigation it has just agreed to.
  useEffect(() => {
    const to = pending.current;
    if (!released || !to) return;
    pending.current = null;
    leaveTo(to, (href) => router.push(href), () => void signOut());
  }, [released, router]);
}
