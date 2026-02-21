import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { core: "src/core/index.ts" },
    format: ["esm"],
    dts: true,
    outDir: "dist",
    clean: true,
    sourcemap: true,
  },
  {
    entry: { "cli/index": "src/cli/index.ts" },
    format: ["esm"],
    outDir: "dist",
    banner: { js: "#!/usr/bin/env node" },
    sourcemap: true,
  },
]);
