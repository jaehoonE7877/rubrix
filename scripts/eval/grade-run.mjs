#!/usr/bin/env node
/**
 * Iteration-1 deterministic grader.
 *
 * Reads a case's assertions.json and an outputs/ directory; emits grading.json
 * with fields {text, passed, evidence} per assertion (skill-creator schema).
 *
 * Usage:
 *   node scripts/eval/grade-run.mjs --case <case-dir> --outputs <outputs-dir> --out <grading.json>
 *
 *   node scripts/eval/grade-run.mjs --iteration iteration-1
 *     -> grades EVERY eval-<case>/<condition>/outputs in iteration-1
 */

import { promises as fs } from "node:fs";
import { readFile, writeFile, stat } from "node:fs/promises";
import { resolve, join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

function parseArgs(argv) {
  const args = { case: null, outputs: null, out: null, iteration: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--case") args.case = argv[++i];
    else if (a === "--outputs") args.outputs = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--iteration") args.iteration = argv[++i];
  }
  return args;
}

async function pathExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson(p) {
  const txt = await readFile(p, "utf8");
  if (!txt.trim()) return null;
  return JSON.parse(txt);
}

async function readText(p) {
  if (!(await pathExists(p))) return "";
  return await readFile(p, "utf8");
}

/* ---------- JSONPath-lite ---------- */
// minimal subset: $, $.a.b.c, $.a[*].b, $.a[*]
function jsonGet(root, path) {
  if (!path || path === "$") return root;
  const parts = path.replace(/^\$\.?/, "").split(/\.(?![^\[]*\])/).filter(Boolean);
  let curr = root;
  for (const p of parts) {
    if (curr == null) return undefined;
    const m = p.match(/^([A-Za-z0-9_]+)?(\[[^\]]+\])?$/);
    if (!m) return undefined;
    const key = m[1];
    const idx = m[2];
    if (key) curr = curr[key];
    if (idx) {
      const inside = idx.slice(1, -1);
      if (inside === "*") {
        // returning array — caller handles
        if (!Array.isArray(curr)) return undefined;
      } else {
        const i = parseInt(inside, 10);
        if (!Array.isArray(curr)) return undefined;
        curr = curr[i];
      }
    }
  }
  return curr;
}

/* ---------- check implementations ---------- */
const checks = {
  file_exists({ assertion, contractPresent, sources }) {
    const src = assertion.source;
    if (src === "rubrix.json") return { passed: contractPresent, evidence: contractPresent ? "rubrix.json present" : "rubrix.json missing" };
    if (typeof src === "string" && src in sources) {
      const has = (sources[src] || "").length > 0 || src === "stderr.txt"; // empty stderr counts as present
      return { passed: has, evidence: has ? `${src} present` : `${src} missing/empty` };
    }
    return { passed: false, evidence: `unknown source ${JSON.stringify(src)}` };
  },

  json_parseable({ contract, contractPresent }) {
    if (!contractPresent) return { passed: false, evidence: "rubrix.json missing" };
    return { passed: contract !== null, evidence: contract !== null ? "JSON parsed" : "not JSON" };
  },

  json_path_equals({ assertion, contract }) {
    const v = jsonGet(contract, assertion.path);
    const ok = JSON.stringify(v) === JSON.stringify(assertion.expected);
    return {
      passed: ok,
      evidence: `${assertion.path} = ${JSON.stringify(v)} (expected ${JSON.stringify(assertion.expected)})`,
    };
  },

  json_paths_equal({ assertion, contract }) {
    const got = assertion.paths.map((p) => jsonGet(contract, p));
    const ok = got.every((v) => JSON.stringify(v) === JSON.stringify(assertion.expected));
    return {
      passed: ok,
      evidence: assertion.paths.map((p, i) => `${p}=${JSON.stringify(got[i])}`).join(", "),
    };
  },

  json_path_contains({ assertion, contract }) {
    const v = jsonGet(contract, assertion.path);
    if (typeof v !== "string") return { passed: false, evidence: `${assertion.path} not a string (got ${typeof v})` };
    const subs = assertion.expected_substrings_any || assertion.expected_substrings || [];
    const lower = v.toLowerCase();
    const hit = subs.some((s) => lower.includes(String(s).toLowerCase()));
    return {
      passed: hit,
      evidence: `${assertion.path}=${JSON.stringify(v).slice(0, 120)}; matched any-of ${JSON.stringify(subs)} = ${hit}`,
    };
  },

  json_path_absent({ assertion, contract }) {
    const v = jsonGet(contract, assertion.path);
    return { passed: v === undefined, evidence: `${assertion.path} = ${JSON.stringify(v)}` };
  },

  json_path_absent_or_empty({ assertion, contract }) {
    const v = jsonGet(contract, assertion.path);
    const ok = v === undefined || v === null || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && Object.keys(v).length === 0);
    return { passed: ok, evidence: `${assertion.path} = ${JSON.stringify(v)}` };
  },

  json_path_not_in({ assertion, contract }) {
    const v = jsonGet(contract, assertion.path);
    const disallowed = assertion.disallowed || [];
    const ok = !disallowed.includes(v);
    return { passed: ok, evidence: `${assertion.path}=${JSON.stringify(v)} (disallowed=${JSON.stringify(disallowed)})` };
  },

  json_array_length_equals({ assertion, contract }) {
    const v = jsonGet(contract, assertion.path);
    const len = Array.isArray(v) ? v.length : null;
    return { passed: len === assertion.expected, evidence: `${assertion.path}.length=${len} (expected ${assertion.expected})` };
  },

  json_array_length_at_least({ assertion, contract }) {
    const v = jsonGet(contract, assertion.path);
    const len = Array.isArray(v) ? v.length : null;
    return { passed: typeof len === "number" && len >= assertion.min, evidence: `${assertion.path}.length=${len} (min ${assertion.min})` };
  },

  json_array_length_between({ assertion, contract }) {
    const v = jsonGet(contract, assertion.path);
    const len = Array.isArray(v) ? v.length : null;
    const ok = typeof len === "number" && len >= assertion.min && len <= assertion.max;
    return { passed: ok, evidence: `${assertion.path}.length=${len} (range [${assertion.min},${assertion.max}])` };
  },

  json_array_lengths_equal({ assertion, contract }) {
    const lens = assertion.paths.map((p) => {
      const v = jsonGet(contract, p);
      return Array.isArray(v) ? v.length : null;
    });
    const ok = lens.every((l) => l !== null && l === lens[0]);
    return { passed: ok, evidence: assertion.paths.map((p, i) => `${p}.length=${lens[i]}`).join(", ") };
  },

  json_array_items_have_keys({ assertion, contract }) {
    const v = jsonGet(contract, assertion.path);
    if (!Array.isArray(v) || v.length === 0) return { passed: false, evidence: `${assertion.path} not a non-empty array` };
    const missing = [];
    for (let i = 0; i < v.length; i++) {
      const item = v[i];
      for (const k of assertion.keys) {
        if (item == null || typeof item !== "object" || !(k in item)) missing.push(`item[${i}].${k}`);
      }
    }
    return { passed: missing.length === 0, evidence: missing.length === 0 ? `all items have ${assertion.keys.join(",")}` : `missing: ${missing.slice(0, 5).join(", ")}` };
  },

  json_array_field_subset({ assertion, contract }) {
    const v = jsonGet(contract, assertion.path);
    if (!Array.isArray(v)) return { passed: false, evidence: `${assertion.path} not an array` };
    const allowed = new Set(assertion.allowed);
    const bad = v.map((item) => item?.[assertion.field]).filter((x) => !allowed.has(x));
    return { passed: bad.length === 0, evidence: bad.length === 0 ? `all ${assertion.field} ∈ ${JSON.stringify(assertion.allowed)}` : `out-of-set: ${JSON.stringify(bad).slice(0, 100)}` };
  },

  json_array_items_field_nonempty({ assertion, contract }) {
    const v = jsonGet(contract, assertion.path);
    if (!Array.isArray(v) || v.length === 0) return { passed: false, evidence: `${assertion.path} empty` };
    const empties = v.map((item, i) => ({ i, val: item?.[assertion.field] })).filter(({ val }) => val == null || (typeof val === "string" && val.trim() === ""));
    return { passed: empties.length === 0, evidence: empties.length === 0 ? `all .${assertion.field} non-empty` : `empty at indexes ${empties.map((e) => e.i).join(",")}` };
  },

  json_array_any_text_contains({ assertion, contract }) {
    const v = jsonGet(contract, assertion.path);
    if (!Array.isArray(v)) return { passed: false, evidence: `${assertion.path} not an array` };
    const subs = (assertion.expected_substrings || []).map((s) => String(s).toLowerCase());
    const hits = v.filter((item) => {
      const t = item?.[assertion.field];
      if (typeof t !== "string") return false;
      const lower = t.toLowerCase();
      return subs.some((s) => lower.includes(s));
    });
    return { passed: hits.length > 0, evidence: `matches=${hits.length} (subs=${JSON.stringify(assertion.expected_substrings)})` };
  },

  json_array_item_field_below({ assertion, contract }) {
    const v = jsonGet(contract, assertion.path);
    if (!Array.isArray(v)) return { passed: false, evidence: `${assertion.path} not an array` };
    const where = assertion.where || {};
    const matches = v.filter((item) => Object.entries(where).every(([k, val]) => item?.[k] === val));
    if (matches.length === 0) return { passed: false, evidence: `no item matched where=${JSON.stringify(where)}` };
    const ok = matches.every((m) => typeof m[assertion.field] === "number" && m[assertion.field] < assertion.threshold);
    return { passed: ok, evidence: `${matches.length} match(es); ${assertion.field} values=${JSON.stringify(matches.map((m) => m[assertion.field]))} (threshold<${assertion.threshold})` };
  },

  json_array_item_text_contains({ assertion, contract }) {
    const v = jsonGet(contract, assertion.path);
    if (!Array.isArray(v)) return { passed: false, evidence: `${assertion.path} not an array` };
    const where = assertion.where || {};
    const matches = v.filter((item) => Object.entries(where).every(([k, val]) => item?.[k] === val));
    if (matches.length === 0) return { passed: false, evidence: `no item matched where=${JSON.stringify(where)}` };
    const subs = (assertion.expected_substrings || []).map((s) => String(s).toLowerCase());
    const ok = matches.every((m) => {
      const t = m?.[assertion.field];
      if (typeof t !== "string") return false;
      const lower = t.toLowerCase();
      return subs.some((s) => lower.includes(s));
    });
    return { passed: ok, evidence: `matches=${matches.length}; subs=${JSON.stringify(assertion.expected_substrings)}` };
  },

  text_contains_any({ assertion, sources }) {
    const which = Array.isArray(assertion.source) ? assertion.source : [assertion.source];
    const subs = (assertion.expected_substrings || []).map((s) => String(s).toLowerCase());
    let hit = false;
    let where = "";
    for (const s of which) {
      const txt = (sources[s] || "").toLowerCase();
      const found = subs.find((sub) => txt.includes(sub));
      if (found) {
        hit = true;
        where = `${s} contains "${found}"`;
        break;
      }
    }
    return { passed: hit, evidence: hit ? where : `none of ${JSON.stringify(assertion.expected_substrings)} found in ${JSON.stringify(which)}` };
  },

  text_not_contains({ assertion, sources }) {
    const which = Array.isArray(assertion.source) ? assertion.source : [assertion.source];
    const subs = (assertion.expected_substrings || []).map((s) => String(s).toLowerCase());
    let bad = null;
    for (const s of which) {
      const txt = (sources[s] || "").toLowerCase();
      const found = subs.find((sub) => txt.includes(sub));
      if (found) {
        bad = `${s} contains forbidden "${found}"`;
        break;
      }
    }
    return { passed: bad === null, evidence: bad || `none of ${JSON.stringify(assertion.expected_substrings)} found` };
  },

  lock_state_equals({ assertion, contract }) {
    const got = contract?.locks || {};
    const want = assertion.expected || {};
    const ok = Object.keys(want).every((k) => got[k] === want[k]);
    return { passed: ok, evidence: `locks=${JSON.stringify(got)} (expected ${JSON.stringify(want)})` };
  },
};

/* ---------- run grading on one case ---------- */
async function gradeRun({ caseDir, outputsDir, outPath }) {
  const assertionsPath = join(caseDir, "assertions.json");
  const spec = await readJson(assertionsPath);
  if (!spec) throw new Error(`Could not read assertions from ${assertionsPath}`);

  const contractPath = join(outputsDir, "rubrix.json");
  const contractPresent = await pathExists(contractPath);
  let contract = null;
  if (contractPresent) {
    try {
      contract = await readJson(contractPath);
    } catch {
      contract = null;
    }
  }
  const sources = {
    "rubrix.json": contract ? JSON.stringify(contract, null, 2) : "",
    "stdout.txt": await readText(join(outputsDir, "stdout.txt")),
    "stderr.txt": await readText(join(outputsDir, "stderr.txt")),
  };

  const results = [];
  for (const a of spec.assertions) {
    const fn = checks[a.check];
    let res;
    if (!fn) {
      res = { passed: false, evidence: `no grader implementation for check=${a.check}` };
    } else {
      try {
        res = fn({ assertion: a, contract, contractPresent, sources });
      } catch (err) {
        res = { passed: false, evidence: `grader error: ${err.message}` };
      }
    }
    results.push({ id: a.id, text: a.text, passed: !!res.passed, evidence: res.evidence });
  }
  const summary = {
    case_id: spec.case_id,
    skill: spec.skill,
    summary: {
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      total: results.length,
    },
    assertions: results,
  };
  await writeFile(outPath, JSON.stringify(summary, null, 2));
  return summary;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.iteration) {
    const iterationDir = resolve(REPO, args.iteration);
    const casesDir = join(iterationDir, "cases");
    const cases = (await fs.readdir(casesDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
    let total = 0,
      okConditions = 0,
      failConditions = 0;
    const allSummaries = [];
    for (const caseId of cases) {
      const caseDir = join(casesDir, caseId);
      const evalDir = join(iterationDir, `eval-${caseId}`);
      if (!(await pathExists(evalDir))) continue;
      const conds = (await fs.readdir(evalDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
      for (const cond of conds) {
        const outputsDir = join(evalDir, cond, "outputs");
        if (!(await pathExists(outputsDir))) continue;
        const outPath = join(outputsDir, "grading.json");
        try {
          const summary = await gradeRun({ caseDir, outputsDir, outPath });
          total++;
          const allPassed = summary.summary.failed === 0;
          if (allPassed) okConditions++;
          else failConditions++;
          allSummaries.push({ caseId, condition: cond, ...summary.summary });
          process.stdout.write(`${caseId} / ${cond}: ${summary.summary.passed}/${summary.summary.total} passed\n`);
        } catch (err) {
          process.stderr.write(`${caseId} / ${cond}: GRADER ERROR ${err.message}\n`);
        }
      }
    }
    process.stdout.write(`\nGraded ${total} runs (all-pass: ${okConditions}, with-failures: ${failConditions})\n`);
    await writeFile(join(iterationDir, "grading-index.json"), JSON.stringify({ total, okConditions, failConditions, runs: allSummaries }, null, 2));
    return;
  }
  if (!args.case || !args.outputs || !args.out) {
    process.stderr.write("Usage: --case <dir> --outputs <dir> --out <file>  OR  --iteration <dir>\n");
    process.exit(2);
  }
  await gradeRun({ caseDir: args.case, outputsDir: args.outputs, outPath: args.out });
}

main().catch((err) => {
  process.stderr.write((err?.stack || String(err)) + "\n");
  process.exit(1);
});
