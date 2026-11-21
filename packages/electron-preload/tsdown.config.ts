import { defineConfig } from "tsdown";

export default defineConfig({
  exports: true,
  platform: "browser",
  outDir: "build",
  format: "cjs",
  noExternal: [/.*/],
  external: ["electron"],
  minify: true,
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV || "production",
    ),
  },
  sourcemap: true,
});
