// Stub for Node builtins (fs/path/crypto) that @techstark/opencv-js
// references inside an `if (ENVIRONMENT_IS_NODE)` branch for isomorphic
// use. That branch never runs in the browser, so this module's contents
// are never actually called -- it only needs to exist so Turbopack can
// resolve the import when bundling for the browser.
const emptyShim = {};
export default emptyShim;
