import { readFileSync } from "node:fs";
import { formatError, validateContract } from "../core/contract.ts";

export interface ValidateOptions {
  path: string;
  json?: boolean;
}

export interface ValidateOutput {
  ok: boolean;
  errors: string[];
}

export function runValidate(opts: ValidateOptions): ValidateOutput {
  const raw = readFileSync(opts.path, "utf8");
  const data = JSON.parse(raw) as unknown;
  const result = validateContract(data);
  return {
    ok: result.ok,
    errors: result.errors.map(formatError),
  };
}

export function validateCommand(opts: ValidateOptions): number {
  const out = runValidate(opts);
  if (opts.json) {
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } else if (out.ok) {
    process.stdout.write(`${opts.path}: valid\n`);
  } else {
    process.stderr.write(`${opts.path}: INVALID\n${out.errors.join("\n")}\n`);
  }
  return out.ok ? 0 : 1;
}
