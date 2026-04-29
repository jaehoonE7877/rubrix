#!/usr/bin/env node
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const tsEntry = resolve(here, "../src/cli.ts");

if (!existsSync(tsEntry)) {
  console.error(`[rubrix] missing CLI source at ${tsEntry}`);
  process.exit(70);
}

try {
  await import("tsx/esm");
} catch (err) {
  console.error("[rubrix] failed to load tsx loader. Run `npm install` inside cli/.");
  console.error(err instanceof Error ? err.message : err);
  process.exit(70);
}

await import(pathToFileURL(tsEntry).href);
