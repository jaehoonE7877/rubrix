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
  .action((path: string, opts: { out?: string }) => {
    process.exit(reportCommand({ path, out: opts.out }));
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
  .action((key: string, path: string) => {
    process.exit(lockCommand({ key, path }));
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
