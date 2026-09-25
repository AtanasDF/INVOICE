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
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const HARNESS = dirname(fileURLToPath(import.meta.url));
export const REPO = dirname(HARNESS);
export const APP = join(REPO, "web");
export const SRC = join(APP, "src");
