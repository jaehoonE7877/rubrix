import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PLUGIN_MANIFEST = join(REPO_ROOT, ".claude-plugin", "plugin.json");
const AGENTS_DIR = join(REPO_ROOT, "agents");

describe("plugin.json agents[] ↔ agents/ folder", () => {
  it("every *.md in agents/ is registered in plugin.json (v1.4.1 hotfix invariant)", () => {
    const manifest = JSON.parse(readFileSync(PLUGIN_MANIFEST, "utf8")) as { agents?: string[] };
    const listed = new Set(
      (manifest.agents ?? []).map((p) => basename(p, ".md")),
    );
    const onDisk = readdirSync(AGENTS_DIR)
      .filter((f) => f.endsWith(".md"))
      .map((f) => basename(f, ".md"));
    const missingFromManifest = onDisk.filter((a) => !listed.has(a));
    expect(missingFromManifest, "agents present on disk but absent from .claude-plugin/plugin.json").toEqual([]);
  });

  it("every entry in plugin.json agents[] points to a real file", () => {
    const manifest = JSON.parse(readFileSync(PLUGIN_MANIFEST, "utf8")) as { agents?: string[] };
    const onDisk = new Set(readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md")));
    const dangling = (manifest.agents ?? []).filter((p) => !onDisk.has(basename(p)));
    expect(dangling, "plugin.json lists agents that do not exist on disk").toEqual([]);
  });
});
