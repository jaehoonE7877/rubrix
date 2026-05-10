import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { validateCommand } from "./commands/validate.ts";
import { gateCommand } from "./commands/gate.ts";
import { reportCommand } from "./commands/report.ts";
import { stateGetCommand, stateSetCommand } from "./commands/state.ts";
import { lockCommand } from "./commands/lock.ts";
import { hookCommand } from "./commands/hook.ts";
import { briefGetCommand, briefInitCommand } from "./commands/brief.ts";
import { scoreClarityCommand } from "./commands/score-clarity.ts";
import { scoreCommand } from "./commands/score.ts";
import { driftCommand } from "./commands/drift.ts";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(here, "../package.json"), "utf8")) as { version: string };

const program = new Command();
program.name("rubrix").description("Rubrix CLI: validate, gate, report, state, lock, hook").version(pkg.version);

program
  .command("validate <path>")
  .description("Validate a rubrix.json against the schema")
  .option("--json", "emit JSON output")
  .action((path: string, opts: { json?: boolean }) => {
    process.exit(validateCommand({ path, json: opts.json }));
  });

program
  .command("gate <path>")
  .description("Evaluate threshold/floor and report pass/fail")
  .option("--json", "emit JSON output")
  .option("--apply", "if state is Scoring, persist Passed/Failed back to the file")
  .action((path: string, opts: { json?: boolean; apply?: boolean }) => {
    process.exit(gateCommand({ path, json: opts.json, apply: opts.apply }));
  });

program
  .command("report <path>")
  .description("Render a markdown report from a rubrix.json")
  .option("--out <file>", "write report to file instead of stdout")
  .option("--explain <criterion>", "v1.3+: append a detailed stage_history section for a single criterion")
  .action((path: string, opts: { out?: string; explain?: string }) => {
    process.exit(reportCommand({ path, out: opts.out, explain: opts.explain }));
  });

const stateCmd = program.command("state").description("Inspect or transition the lifecycle state");
stateCmd
  .command("get <path>")
  .option("--json", "emit JSON output")
  .action((path: string, opts: { json?: boolean }) => {
    process.exit(stateGetCommand({ path, json: opts.json }));
  });
stateCmd
  .command("set <path> <to>")
  .description("Transition the contract to a new state if the transition is allowed")
  .action((path: string, to: string) => {
    process.exit(stateSetCommand({ path, to }));
  });

program
  .command("lock <key> <path>")
  .description("Lock rubric|matrix|plan and advance to the *Locked state")
  .option("--threshold <n>", "v1.2+: override the resolved clarity threshold (0-1) for this lock", (raw) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`--threshold must be a number, got '${raw}'`);
    return n;
  })
  .option("--force <reason>", "v1.2+: bypass clarity threshold; persists forced=true with forced_at + force_reason for audit (rubrix report surfaces forced locks)")
  .option("--accept-drift <reason>", "v1.4+: 1-shot bounded bypass for the drift gate; persists accepted_drift_history[] entry + lock_history audit (drift > drift_policy.hard_threshold cannot be accepted)")
  .action((key: string, path: string, opts: { threshold?: number; force?: string; acceptDrift?: string }) => {
    process.exit(lockCommand({ key, path, threshold: opts.threshold, force: opts.force, acceptDrift: opts.acceptDrift }));
  });

program
  .command("score-clarity <key> <path>")
  .description("v1.2+: read-only clarity score for rubric|matrix|plan (hash + threshold; never mutates rubrix.json)")
  .option("--threshold <n>", "override the resolved threshold (0-1)", (raw) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`--threshold must be a number, got '${raw}'`);
    return n;
  })
  .option("--json", "emit JSON output (default; reserved for symmetry with other commands)")
  .action((key: string, path: string, opts: { threshold?: number; json?: boolean }) => {
    process.exit(scoreClarityCommand({ key, path, threshold: opts.threshold, json: opts.json }));
  });

program
  .command("score <path>")
  .description("v1.3+ multi-evaluator cascade (PR #1 stub: parses flags, prints PR #2 placeholder; cascade orchestrator wires in PR #2)")
  .option("--stage <n>", "limit cascade to a single stage (1=mechanical, 2=semantic, 3=consensus)", (raw) => {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 3) throw new Error(`--stage must be 1, 2, or 3, got '${raw}'`);
    return n;
  })
  .option("--explain <criterion>", "print full stage_history for a single criterion (read-only diagnostic; main path returns aggregate only)")
  .option("--approve-expensive", "v1.3+: temporary override of evaluation_policy.estimated_cost_ceiling for this run (audit-logged); default cost gate is lock-time only")
  .action((path: string, opts: { stage?: number; explain?: string; approveExpensive?: boolean }) => {
    process.exit(
      scoreCommand({
        path,
        stage: opts.stage,
        explain: opts.explain,
        approveExpensive: opts.approveExpensive,
      }),
    );
  });

program
  .command("drift <path>")
  .description("v1.4+: deterministic drift score (read-only). Compares intent.brief / evaluation_policy canonical hashes against derived_from_*_hash stamps and stage_history models against frontier_models; surfaces factor breakdown + gate status.")
  .option("--json", "emit JSON output")
  .action((path: string, opts: { json?: boolean }) => {
    process.exit(driftCommand({ path, json: opts.json }));
  });

program
  .command("hook <event>")
  .description("Adapter for Claude Code hook events. Reads JSON from stdin, writes JSON decision to stdout.")
  .action(async (event: string) => {
    process.exit(await hookCommand({ event }));
  });

const briefCmd = program.command("brief").description("Initialize or read intent.brief (v1.1+ depth calibration)");
briefCmd
  .command("init <path>")
  .description("Create or upgrade an IntentDrafted contract with a calibrated brief")
  .option("--summary <text>", "intent.summary (required when creating a new file)")
  .option("--project-type <value>", "greenfield|brownfield_refactor|brownfield_feature|infra|doc")
  .option("--situation <value>", "prototype|internal_tool|customer_facing|regulated")
  .option("--ambition <value>", "demo|mvp|production|hardened")
  .option(
    "--axis <pair...>",
    "axis depth as name=depth (e.g. --axis security=deep --axis ux=light); repeatable",
  )
  .option("--risk <value...>", "risk modifier (free-form); repeatable")
  .option("--details <text>", "intent.details")
  .option("--owner <text>", "intent.owner")
  .option("--json", "emit JSON output")
  .action((path: string, opts: BriefInitCliOptions) => {
    process.exit(
      briefInitCommand({
        path,
        summary: opts.summary,
        projectType: opts.projectType,
        situation: opts.situation,
        ambition: opts.ambition,
        axis: opts.axis,
        risk: opts.risk,
        details: opts.details,
        owner: opts.owner,
        json: opts.json,
      }),
    );
  });
briefCmd
  .command("get <path>")
  .description("Read intent.brief; with --axis, print only that axis's effective depth")
  .option("--axis <name>", "security|data|correctness|ux|perf")
  .option("--json", "emit JSON output")
  .action((path: string, opts: { axis?: string; json?: boolean }) => {
    process.exit(briefGetCommand({ path, axis: opts.axis, json: opts.json }));
  });

interface BriefInitCliOptions {
  summary?: string;
  projectType?: string;
  situation?: string;
  ambition?: string;
  axis?: string[];
  risk?: string[];
  details?: string;
  owner?: string;
  json?: boolean;
}

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write((err instanceof Error ? err.message : String(err)) + "\n");
  process.exit(1);
});
