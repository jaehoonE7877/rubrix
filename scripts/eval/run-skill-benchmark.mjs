#!/usr/bin/env node
/**
 * Iteration-1 skill benchmark runner.
 *
 * Spawns `claude -p` for each case×condition under controlled isolation:
 *   - with_skill: --plugin-dir <plugin-root>  (rubrix skills available)
 *   - baseline:   --bare                       (no plugins, no CLAUDE.md)
 *
 * Captures rubrix.json (final), stdout, stderr, timing into:
 *   <iteration>/eval-<case>/<condition>/outputs/{rubrix.json,stdout.txt,stderr.txt,timing.json}
 *
 * Usage:
 *   node scripts/eval/run-skill-benchmark.mjs \
 *        --iteration iteration-1 \
 *        --parallel 8 \
 *        [--only <case-id>[,<case-id>...]] \
 *        [--conditions with_skill,baseline] \
 *        [--budget-usd 5]
 */

import { promises as fs } from "node:fs";
import { mkdir, rm, cp, readFile, writeFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

function parseArgs(argv) {
  const args = {
    iteration: "iteration-1",
    parallel: 8,
    only: null,
    conditions: ["with_skill", "baseline"],
    budgetUsd: 1,
    timeoutMs: 6 * 60 * 1000,
    model: "sonnet",
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--iteration") args.iteration = argv[++i];
    else if (a === "--parallel") args.parallel = parseInt(argv[++i], 10);
    else if (a === "--only") args.only = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--conditions") args.conditions = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--budget-usd") args.budgetUsd = parseFloat(argv[++i]);
    else if (a === "--timeout-ms") args.timeoutMs = parseInt(argv[++i], 10);
    else if (a === "--model") args.model = argv[++i];
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: run-skill-benchmark.mjs --iteration <dir> [--parallel N] [--only id,id] [--conditions with_skill,baseline] [--budget-usd 5]\n",
      );
      process.exit(0);
    }
  }
  return args;
}

async function listCases(iterationDir) {
  const casesDir = join(iterationDir, "cases");
  const entries = await fs.readdir(casesDir, { withFileTypes: true });
  const cases = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const id = e.name;
    const promptPath = join(casesDir, id, "prompt.md");
    const fixtureDir = join(casesDir, id, "fixture");
    const prompt = (await readFile(promptPath, "utf8")).trim();
    cases.push({ id, prompt, fixtureDir });
  }
  cases.sort((a, b) => a.id.localeCompare(b.id));
  return cases;
}

async function pathExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function setupWorkspace({ iterationDir, caseId, condition, fixtureDir }) {
  const evalDir = join(iterationDir, `eval-${caseId}`, condition);
  const workspace = join(evalDir, "workspace");
  const outputs = join(evalDir, "outputs");
  await rm(evalDir, { recursive: true, force: true });
  await mkdir(workspace, { recursive: true });
  await mkdir(outputs, { recursive: true });
  // copy fixture contents into workspace (skip .gitkeep marker files)
  const items = await fs.readdir(fixtureDir, { withFileTypes: true });
  for (const item of items) {
    if (item.name === ".gitkeep") continue;
    const src = join(fixtureDir, item.name);
    const dest = join(workspace, item.name);
    await cp(src, dest, { recursive: true });
  }
  return { evalDir, workspace, outputs };
}

function buildPrompt({ userPrompt, caseId, hasInitialContract }) {
  const systemNote =
    "You are running inside an automated Rubrix skill benchmark.\n" +
    "The current working directory contains the test workspace.\n" +
    `${hasInitialContract ? "An initial rubrix.json is already present in the CWD." : "No rubrix.json exists yet in the CWD."}\n` +
    "When the task asks you to modify the rubrix.json contract, write the result to ./rubrix.json in the CWD using the rubrix CLI or your usual tools.\n" +
    "Do not edit files outside the CWD. Do not run the eval harness itself.\n" +
    "When you are finished, print a one-line summary of what you did.\n" +
    `Case: ${caseId}\n\n` +
    "User request follows.\n";
  return systemNote + "\n" + userPrompt + "\n";
}

function spawnClaude({ args, prompt, cwd, env, timeoutMs }) {
  return new Promise((resolvePromise) => {
    const startedAt = performance.now();
    const startedAtIso = new Date().toISOString();
    let stdoutBuf = "";
    let stderrBuf = "";
    let timer = null;
    let killed = false;
    const child = spawn("claude", args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        killed = true;
        child.kill("SIGKILL");
      }, timeoutMs);
    }
    child.stdout.on("data", (d) => (stdoutBuf += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderrBuf += d.toString("utf8")));
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      const endedAt = performance.now();
      const endedAtIso = new Date().toISOString();
      resolvePromise({
        exitCode: code,
        killed,
        stdout: stdoutBuf,
        stderr: stderrBuf,
        startedAtIso,
        endedAtIso,
        durationMs: Math.round(endedAt - startedAt),
      });
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function parseJsonOutput(stdoutText) {
  // claude -p --output-format json prints a single JSON object on stdout
  const trimmed = stdoutText.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // sometimes claude prints multiple JSON objects (one per turn) — take the last
    const lines = trimmed.split(/\r?\n/).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(lines[i]);
      } catch {
        // continue
      }
    }
  }
  return null;
}

async function runOne({ iterationDir, caseSpec, condition, budgetUsd, timeoutMs, model }) {
  const { id: caseId, prompt: userPrompt, fixtureDir } = caseSpec;
  const { workspace, outputs } = await setupWorkspace({
    iterationDir,
    caseId,
    condition,
    fixtureDir,
  });

  const initialContract = join(workspace, "rubrix.json");
  const hasInitialContract = await pathExists(initialContract);

  const prompt = buildPrompt({ userPrompt, caseId, hasInitialContract });

  const baseArgs = [
    "-p",
    "--output-format",
    "json",
    "--permission-mode",
    "bypassPermissions",
    "--max-budget-usd",
    String(budgetUsd),
    "--no-session-persistence",
    "--model",
    model,
  ];

  let conditionArgs;
  let conditionEnv = { ...process.env };
  if (condition === "with_skill") {
    // load the rubrix plugin from the worktree root
    conditionArgs = [...baseArgs, "--plugin-dir", REPO];
  } else if (condition === "baseline") {
    // skill-isolation only: --disable-slash-commands removes ALL slash skills
    // (including any user-installed ones) without breaking OAuth auth.
    // Do NOT pass --plugin-dir; do NOT use --bare (which forces API key auth).
    conditionArgs = [...baseArgs, "--disable-slash-commands"];
  } else {
    throw new Error(`Unknown condition: ${condition}`);
  }

  const result = await spawnClaude({
    args: conditionArgs,
    prompt,
    cwd: workspace,
    env: conditionEnv,
    timeoutMs,
  });

  // capture outputs
  const finalContract = join(workspace, "rubrix.json");
  const finalContractDest = join(outputs, "rubrix.json");
  if (await pathExists(finalContract)) {
    await cp(finalContract, finalContractDest);
  } else {
    await writeFile(finalContractDest, ""); // empty marker = file was never created
  }
  await writeFile(join(outputs, "stdout.txt"), result.stdout);
  await writeFile(join(outputs, "stderr.txt"), result.stderr);

  const parsed = parseJsonOutput(result.stdout);
  const totalTokens = parsed?.usage?.total_tokens ?? parsed?.total_tokens ?? null;
  const inputTokens = parsed?.usage?.input_tokens ?? null;
  const outputTokens = parsed?.usage?.output_tokens ?? null;
  const costUsd = parsed?.total_cost_usd ?? parsed?.cost_usd ?? null;
  const reportedModel = parsed?.model ?? Object.keys(parsed?.modelUsage || {})[0] ?? null;
  const numTurns = parsed?.num_turns ?? null;

  const timing = {
    case_id: caseId,
    condition,
    started_at: result.startedAtIso,
    ended_at: result.endedAtIso,
    duration_ms: result.durationMs,
    exit_code: result.exitCode,
    killed: result.killed,
    total_tokens: totalTokens,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: costUsd,
    model: reportedModel,
    requested_model: model,
    num_turns: numTurns,
    run_command: ["claude", ...conditionArgs].join(" "),
    final_contract_present: await pathExists(finalContract),
  };
  await writeFile(join(outputs, "timing.json"), JSON.stringify(timing, null, 2));

  return {
    caseId,
    condition,
    exitCode: result.exitCode,
    killed: result.killed,
    durationMs: result.durationMs,
    finalContractPresent: timing.final_contract_present,
  };
}

async function runWaves({ tasks, parallel, onComplete }) {
  const queue = [...tasks];
  const inflight = new Set();
  const results = [];
  while (queue.length > 0 || inflight.size > 0) {
    while (queue.length > 0 && inflight.size < parallel) {
      const task = queue.shift();
      const p = task()
        .then((r) => {
          inflight.delete(p);
          results.push(r);
          if (onComplete) onComplete(r);
        })
        .catch((err) => {
          inflight.delete(p);
          results.push({ error: err.message });
          if (onComplete) onComplete({ error: err.message });
        });
      inflight.add(p);
    }
    if (inflight.size > 0) await Promise.race(inflight);
  }
  return results;
}

async function main() {
  const args = parseArgs(process.argv);
  const iterationDir = resolve(REPO, args.iteration);
  if (!(await pathExists(iterationDir))) {
    process.stderr.write(`No such iteration dir: ${iterationDir}\n`);
    process.exit(2);
  }

  let cases = await listCases(iterationDir);
  if (args.only) {
    const set = new Set(args.only);
    cases = cases.filter((c) => set.has(c.id));
    if (cases.length === 0) {
      process.stderr.write(`No cases matched --only filter: ${args.only.join(",")}\n`);
      process.exit(2);
    }
  }

  const tasks = [];
  for (const c of cases) {
    for (const cond of args.conditions) {
      tasks.push(() =>
        runOne({
          iterationDir,
          caseSpec: c,
          condition: cond,
          budgetUsd: args.budgetUsd,
          timeoutMs: args.timeoutMs,
          model: args.model,
        }),
      );
    }
  }

  process.stdout.write(
    `Launching ${tasks.length} runs (${cases.length} cases × ${args.conditions.length} conditions), parallel=${args.parallel}\n`,
  );

  const startedAt = Date.now();
  let completed = 0;
  const results = await runWaves({
    tasks,
    parallel: args.parallel,
    onComplete: (r) => {
      completed++;
      const tag = r.error
        ? `ERROR: ${r.error}`
        : `${r.caseId} / ${r.condition} → exit=${r.exitCode}${r.killed ? " KILLED" : ""} (${r.durationMs}ms)`;
      process.stdout.write(`[${completed}/${tasks.length}] ${tag}\n`);
    },
  });
  const totalMs = Date.now() - startedAt;

  process.stdout.write(`\nAll runs done in ${(totalMs / 1000).toFixed(1)}s.\n`);

  // index summary
  const summary = {
    iteration: basename(iterationDir),
    started_at: new Date(startedAt).toISOString(),
    duration_ms: totalMs,
    parallel: args.parallel,
    cases: cases.map((c) => c.id),
    conditions: args.conditions,
    runs: results,
  };
  await writeFile(join(iterationDir, "run-index.json"), JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  process.stderr.write((err?.stack || String(err)) + "\n");
  process.exit(1);
});
