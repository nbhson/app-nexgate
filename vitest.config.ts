import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";

/**
 * Source dùng import "*.js" (NodeNext ESM); khi test, map ".js" → ".ts"
 * resolve theo thư mục của importer.
 */
const jsToTs: Plugin = {
  name: "js-to-ts",
  enforce: "pre",
  resolveId(source, importer) {
    if (source.startsWith(".") && source.endsWith(".js") && importer) {
      const candidate = source.slice(0, -3) + ".ts";
      const importerPath = importer.startsWith("file:")
        ? fileURLToPath(importer)
        : importer;
      try {
        const abs = resolve(dirname(importerPath), candidate);
        if (existsSync(abs)) return abs;
      } catch {
        /* fallthrough */
      }
    }
    return null;
  },
};

export default defineConfig({
  plugins: [jsToTs],
  resolve: {
    extensions: [".ts", ".js", ".json", ".mjs"],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
