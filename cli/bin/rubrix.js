#!/usr/bin/env node
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const distEntry = resolve(here, "../dist/cli.js");

if (!existsSync(distEntry)) {
  console.error(`[rubrix] missing CLI build at ${distEntry}`);
  console.error("[rubrix] run `npm --prefix cli run build` to produce cli/dist/.");
  process.exit(70);
}

await import(pathToFileURL(distEntry).href);
