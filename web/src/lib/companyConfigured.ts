import { useEffect, useState } from "react";

// Until the server has a Companies House key every register field is a
// plain input. One check per page load says whether lookup is on; a failed
// check is retried on the next mount rather than switching lookup off for
// the visit.
let status: Promise<boolean> | null = null;

export function useCompanyLookup(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    status ??= fetch("/api/company-search")
      .then((r) => r.json())
      .then((b: { configured?: boolean }) => b.configured === true)
      .catch(() => {
        status = null;
        return false;
      });
    status.then((v) => {
      if (live) setOn(v);
    });
    return () => {
      live = false;
    };
  }, []);
  return on;
}
