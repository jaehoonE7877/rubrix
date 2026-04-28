#!/usr/bin/env node
/**
 * Aggregate iteration-N runs into benchmark.json + benchmark.md.
 *
 * Reads:
 *   <iter>/eval-<case>/<cond>/outputs/{grading.json, timing.json}
 *
 * Writes:
 *   <iter>/benchmark.json
 *   <iter>/benchmark.md
 */
import { promises as fs } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

function parseArgs(argv) {
  const args = { iteration: "iteration-1", skillName: "rubrix-skills" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--iteration") args.iteration = argv[++i];
    else if (a === "--skill-name") args.skillName = argv[++i];
  }
  return args;
}

async function readJson(p) {
  try {
    return JSON.parse(await readFile(p, "utf8"));
  } catch {
    return null;
  }
}

function pct(num, den) {
  if (!den) return 0;
  return Math.round((1000 * num) / den) / 10;
}

function fmtPct(p) {
  return `${p.toFixed(1)}%`;
}

function fmtMs(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtUsd(n) {
  if (n == null) return "—";
  return `$${n.toFixed(4)}`;
}

async function main() {
  const args = parseArgs(process.argv);
  const iterationDir = resolve(REPO, args.iteration);

  const casesDir = join(iterationDir, "cases");
  const cases = (await fs.readdir(casesDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const conditions = ["with_skill", "baseline"];

  const runs = [];
  for (const caseId of cases) {
    for (const cond of conditions) {
      const outputsDir = join(iterationDir, `eval-${caseId}`, cond, "outputs");
      const grading = await readJson(join(outputsDir, "grading.json"));
      const timing = await readJson(join(outputsDir, "timing.json"));
      if (!grading || !timing) continue;
      const skill = grading.skill || caseId.split("-")[0];
      runs.push({
        case_id: caseId,
        skill,
        condition: cond,
        passed: grading.summary.passed,
        total: grading.summary.total,
        pass_rate: pct(grading.summary.passed, grading.summary.total),
        duration_ms: timing.duration_ms,
        cost_usd: timing.cost_usd,
        input_tokens: timing.input_tokens,
        output_tokens: timing.output_tokens,
        num_turns: timing.num_turns,
        model: timing.model,
        exit_code: timing.exit_code,
        final_contract_present: timing.final_contract_present,
      });
    }
  }

  // overall
  function tally(filter) {
    const xs = runs.filter(filter);
    const passed = xs.reduce((s, r) => s + r.passed, 0);
    const total = xs.reduce((s, r) => s + r.total, 0);
    const dur = xs.reduce((s, r) => s + (r.duration_ms || 0), 0);
    const cost = xs.reduce((s, r) => s + (r.cost_usd || 0), 0);
    const inTok = xs.reduce((s, r) => s + (r.input_tokens || 0), 0);
    const outTok = xs.reduce((s, r) => s + (r.output_tokens || 0), 0);
    return {
      runs: xs.length,
      passed,
      total,
      pass_rate: pct(passed, total),
      total_duration_ms: dur,
      avg_duration_ms: xs.length ? Math.round(dur / xs.length) : 0,
      total_cost_usd: cost,
      avg_cost_usd: xs.length ? cost / xs.length : 0,
      total_input_tokens: inTok,
      total_output_tokens: outTok,
    };
  }

  const ws = tally((r) => r.condition === "with_skill");
  const bl = tally((r) => r.condition === "baseline");
  const skills = ["rubric", "matrix", "plan", "score"];
  const bySkill = skills.map((sk) => ({
    skill: sk,
    with_skill: tally((r) => r.skill === sk && r.condition === "with_skill"),
    baseline: tally((r) => r.skill === sk && r.condition === "baseline"),
  }));

  // per-case head-to-head
  const byCase = cases.map((caseId) => {
    const ws_ = runs.find((r) => r.case_id === caseId && r.condition === "with_skill");
    const bl_ = runs.find((r) => r.case_id === caseId && r.condition === "baseline");
    return {
      case_id: caseId,
      with_skill: ws_ ? { passed: ws_.passed, total: ws_.total } : null,
      baseline: bl_ ? { passed: bl_.passed, total: bl_.total } : null,
      delta: ws_ && bl_ ? ws_.passed - bl_.passed : null,
    };
  });

  const benchmark = {
    metadata: {
      iteration: basename(iterationDir),
      skill_name: args.skillName,
      generated_at: new Date().toISOString(),
      cases: cases,
      conditions,
      model_requested: runs[0]?.model || null,
    },
    summary: {
      with_skill: ws,
      baseline: bl,
      delta_pass_rate: +(ws.pass_rate - bl.pass_rate).toFixed(1),
      delta_avg_duration_ms: ws.avg_duration_ms - bl.avg_duration_ms,
      delta_avg_cost_usd: ws.avg_cost_usd - bl.avg_cost_usd,
    },
    by_skill: bySkill,
    by_case: byCase,
    runs,
  };

  await writeFile(join(iterationDir, "benchmark.json"), JSON.stringify(benchmark, null, 2));

  // markdown
  const md = [];
  md.push(`# Iteration-1 Benchmark — ${args.skillName}`);
  md.push("");
  md.push(`Model: \`${runs[0]?.model || "?"}\` · Generated: ${new Date().toISOString()}`);
  md.push("");
  md.push("## Headline");
  md.push("");
  md.push("| Configuration | Pass rate | Runs all-pass | Avg duration | Avg cost | Total cost |");
  md.push("|---|---|---|---|---|---|");
  const wsAllPass = runs.filter((r) => r.condition === "with_skill" && r.passed === r.total).length;
  const blAllPass = runs.filter((r) => r.condition === "baseline" && r.passed === r.total).length;
  md.push(
    `| **with_skill** | **${fmtPct(ws.pass_rate)}** (${ws.passed}/${ws.total}) | ${wsAllPass}/${ws.runs} | ${fmtMs(ws.avg_duration_ms)} | ${fmtUsd(ws.avg_cost_usd)} | ${fmtUsd(ws.total_cost_usd)} |`,
  );
  md.push(
    `| baseline | ${fmtPct(bl.pass_rate)} (${bl.passed}/${bl.total}) | ${blAllPass}/${bl.runs} | ${fmtMs(bl.avg_duration_ms)} | ${fmtUsd(bl.avg_cost_usd)} | ${fmtUsd(bl.total_cost_usd)} |`,
  );
  md.push(
    `| **delta** | **${(ws.pass_rate - bl.pass_rate >= 0 ? "+" : "")}${(ws.pass_rate - bl.pass_rate).toFixed(1)} pp** | +${wsAllPass - blAllPass} | ${ws.avg_duration_ms - bl.avg_duration_ms >= 0 ? "+" : ""}${fmtMs(ws.avg_duration_ms - bl.avg_duration_ms)} | ${ws.avg_cost_usd - bl.avg_cost_usd >= 0 ? "+" : ""}${fmtUsd(ws.avg_cost_usd - bl.avg_cost_usd)} | — |`,
  );
  md.push("");

  md.push("## By skill");
  md.push("");
  md.push("| Skill | with_skill pass rate | baseline pass rate | delta |");
  md.push("|---|---|---|---|");
  for (const s of bySkill) {
    const dws = s.with_skill.pass_rate;
    const dbl = s.baseline.pass_rate;
    const d = (dws - dbl).toFixed(1);
    const sign = dws - dbl >= 0 ? "+" : "";
    md.push(`| ${s.skill} | ${fmtPct(dws)} (${s.with_skill.passed}/${s.with_skill.total}) | ${fmtPct(dbl)} (${s.baseline.passed}/${s.baseline.total}) | ${sign}${d} pp |`);
  }
  md.push("");

  md.push("## Per case (head-to-head)");
  md.push("");
  md.push("| Case | with_skill | baseline | delta |");
  md.push("|---|---|---|---|");
  for (const c of byCase) {
    const w = c.with_skill;
    const b = c.baseline;
    const dStr =
      c.delta == null
        ? "—"
        : c.delta > 0
          ? `**+${c.delta}** ✅`
          : c.delta < 0
            ? `**${c.delta}** ⚠️`
            : "tie";
    md.push(`| \`${c.case_id}\` | ${w ? `${w.passed}/${w.total}` : "—"} | ${b ? `${b.passed}/${b.total}` : "—"} | ${dStr} |`);
  }
  md.push("");

  // notable
  const wins = byCase.filter((c) => c.delta && c.delta > 0).length;
  const ties = byCase.filter((c) => c.delta === 0).length;
  const losses = byCase.filter((c) => c.delta && c.delta < 0).length;
  md.push("## Notable signals");
  md.push("");
  md.push(`- with_skill **wins**: ${wins} cases`);
  md.push(`- **ties**: ${ties} cases`);
  md.push(`- with_skill **losses**: ${losses} cases`);
  md.push("");

  await writeFile(join(iterationDir, "benchmark.md"), md.join("\n"));

  process.stdout.write(`Wrote benchmark.json and benchmark.md\n`);
  process.stdout.write(`with_skill: ${fmtPct(ws.pass_rate)} (${ws.passed}/${ws.total})\n`);
  process.stdout.write(`baseline:   ${fmtPct(bl.pass_rate)} (${bl.passed}/${bl.total})\n`);
  process.stdout.write(`delta:      ${(ws.pass_rate - bl.pass_rate >= 0 ? "+" : "")}${(ws.pass_rate - bl.pass_rate).toFixed(1)} pp\n`);
  process.stdout.write(`cost:       with_skill ${fmtUsd(ws.total_cost_usd)} | baseline ${fmtUsd(bl.total_cost_usd)} | total ${fmtUsd(ws.total_cost_usd + bl.total_cost_usd)}\n`);
}

main().catch((err) => {
  process.stderr.write((err?.stack || String(err)) + "\n");
  process.exit(1);
});
