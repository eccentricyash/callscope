import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native addon — it must be required at runtime,
  // not bundled by webpack/turbopack.
  serverExternalPackages: ["better-sqlite3"],
  // the db file is opened via a runtime path the bundler can't trace,
  // so serverless deploys must be told to ship it
  outputFileTracingIncludes: {
    "/": ["./data/**"],
    "/api/metrics": ["./data/**"],
  },
};

export default nextConfig;
