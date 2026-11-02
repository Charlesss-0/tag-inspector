import { build, context } from "esbuild";
import { build as viteBuild } from "vite";

await viteBuild();
const options = {
  entryPoints: [
    "src/extension/background.ts",
    "src/extension/content.ts",
    "src/extension/main.ts",
  ],
  bundle: true,
  outdir: "dist",
  format: "iife",
  target: "chrome120",
  sourcemap: true,
};
if (process.argv.includes("--watch")) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("Watching extension scripts. Run pnpm build after UI edits.");
} else await build(options);
