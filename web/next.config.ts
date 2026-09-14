import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // @techstark/opencv-js references fs/path/crypto inside an
    // `if (ENVIRONMENT_IS_NODE)` branch for isomorphic (Node + browser)
    // use. That branch never runs in the browser, but Turbopack still
    // needs these to resolve to *something* when bundling for it.
    resolveAlias: {
      fs: { browser: "./src/lib/empty-node-shim.js" },
      path: { browser: "./src/lib/empty-node-shim.js" },
      crypto: { browser: "./src/lib/empty-node-shim.js" },
    },
  },
};

export default nextConfig;
