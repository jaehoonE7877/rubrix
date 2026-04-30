import { readFileSync } from "node:fs";
import { formatError, validateContract, type RubrixContract } from "../core/contract.ts";
import { isCalibrated } from "../core/brief.ts";
import { checkClarityInvariants } from "../core/clarity-gate.ts";

export interface ValidateOptions {
  path: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
}

export interface ValidateOutput {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const STATES_REQUIRING_BRIEF = new Set([
  "RubricDrafted",
  "RubricLocked",
  "MatrixDrafted",
  "MatrixLocked",
  "PlanDrafted",
  "PlanLocked",
  "Scoring",
  "Passed",
  "Failed",
]);

export function runValidate(opts: ValidateOptions): ValidateOutput {
  const raw = readFileSync(opts.path, "utf8");
  const data = JSON.parse(raw) as unknown;
  const result = validateContract(data);
  const warnings: string[] = [];
  const extraErrors: string[] = [];
  if (result.ok) {
    const c = data as RubrixContract;
    if (STATES_REQUIRING_BRIEF.has(c.state) && !isCalibrated(c)) {
      const env = opts.env ?? process.env;
      const skipped = env.RUBRIX_SKIP_BRIEF === "1";
      const suffix = skipped
        ? " (RUBRIX_SKIP_BRIEF=1; falling back to all-standard axis depth)"
        : " — run /rubrix:brief to calibrate (or set RUBRIX_SKIP_BRIEF=1)";
      warnings.push(`intent.brief is missing or not calibrated at state=${c.state}${suffix}`);
    }
    extraErrors.push(...checkClarityInvariants(c).errors);
  }
  const errors = result.errors.map(formatError).concat(extraErrors);
  return {
    ok: result.ok && extraErrors.length === 0,
    errors,
    warnings,
  };
}

export function validateCommand(opts: ValidateOptions): number {
  const out = runValidate(opts);
  if (opts.json) {
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } else if (out.ok) {
    process.stdout.write(`${opts.path}: valid\n`);
    for (const w of out.warnings) {
      process.stderr.write(`${opts.path}: warning: ${w}\n`);
    }
  } else {
    process.stderr.write(`${opts.path}: INVALID\n${out.errors.join("\n")}\n`);
  }
  return out.ok ? 0 : 1;
}
