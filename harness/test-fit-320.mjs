// The same sweep as test-fit-sweep, at 320px: an iPhone SE, and the
// narrowest screen worth supporting. Kept as its own suite so run-all.sh
// covers both widths every time rather than only when someone remembers
// to set WIDTH.
process.env.WIDTH = "320";
await import("./test-fit-sweep.mjs");
