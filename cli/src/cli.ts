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

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(here, "../package.json"), "utf8")) as { version: string };

const program = new Command();
program.name("rubrix").description("Rubrix CLI: validate, gate, report, state, lock").version(pkg.version);

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

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write((err instanceof Error ? err.message : String(err)) + "\n");
  process.exit(1);
});
