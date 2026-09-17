import type { CVModule } from "./opencv";

// @techstark/opencv-js 5.x sets module.exports to a Promise of the
// runtime. Turbopack's import() namespace copies every prototype property
// of module.exports as a getter, so the namespace itself gets a `then`
// and the import() rejects with "Promise.prototype.then called on
// incompatible receiver". require() hands module.exports back untouched.
export function load(): CVModule | Promise<CVModule> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@techstark/opencv-js");
}
