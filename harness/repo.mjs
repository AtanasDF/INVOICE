// Where the project is, worked out rather than written down.
//
// Every suite used to carry "/Users/nasko/Desktop/INVOICE" as a literal --
// 87 times across 39 files -- so moving the folder broke the whole harness at
// once, and moving it is something that has to happen: the project sits on an
// iCloud-synced Desktop, and on 2026-09-25 iCloud duplicated two git ref files
// and stopped `git fetch` working at all.
//
// import.meta.url is this file's own address, so the answer follows the folder
// wherever it goes, and does not depend on where anything was run from.
//
// It earned that on 2026-09-27: the folder moved from the Desktop to ~/INVOICE and the
// harness needed no change at all.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

export const HARNESS = dirname(fileURLToPath(import.meta.url));
export const REPO = dirname(HARNESS);
export const APP = join(REPO, "web");
export const SRC = join(APP, "src");

// Where a suite's Chrome profile goes, and why it is NOT in the harness folder.
//
// The profiles lived beside the suites, and on an iCloud-synced Desktop that is
// not a safe place to put a directory Chrome writes constantly: a freshly made
// profile picked up 346 duplicated entries within one run -- "Default 2",
// "SingletonLock 3", "SingletonSocket 2". Chrome then behaves oddly in ways
// that look exactly like an app bug. test-check-company was the visible
// casualty: it failed every time in the working tree with the page throwing
// "Lazy element type must resolve to a class or function", and passed 54/54
// from a checkout of the same commits under /private/tmp -- with every one of
// tonight's source changes applied. Hours could go into the wrong file.
//
// So they go under the OS temp directory, keyed by the repo path so two
// checkouts do not share one. They are disposable, gitignored and rebuilt on
// demand; nothing was ever gained by keeping them in the tree. HARNESS_PROFILES
// overrides it, and setting it back to the harness folder restores the old
// behaviour exactly.
export const PROFILES =
  process.env.HARNESS_PROFILES ?? join(tmpdir(), `invoicer-harness-profiles-${createHash("sha1").update(REPO).digest("hex").slice(0, 10)}`);

export function profileDir(name) {
  mkdirSync(PROFILES, { recursive: true });
  return join(PROFILES, name.replace(/^\/+/, ""));
}
