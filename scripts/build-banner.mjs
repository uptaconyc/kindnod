// Bundles banner/kindnod.ts into dist/kindnod.js (IIFE, ES2017, minified).
import { build, context } from "esbuild";
import { statSync } from "node:fs";

const watch = process.argv.includes("--watch");
const opts = {
  entryPoints: ["banner/kindnod.ts"],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2017"],
  outfile: "dist/kindnod.js",
  sourcemap: false,
  legalComments: "none",
  banner: { js: "/* Kindnod consent banner. MIT. https://kindnod.com */" },
};

if (watch) {
  const ctx = await context(opts);
  await ctx.watch();
  console.log("watching banner/kindnod.ts");
} else {
  await build(opts);
  const kb = (statSync("dist/kindnod.js").size / 1024).toFixed(1);
  console.log(`dist/kindnod.js ${kb} KB`);
}
