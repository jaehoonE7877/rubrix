import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020, { type ValidateFunction, type ErrorObject } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { Locks, State } from "./state.ts";

export interface RubrixContract {
  version: string;
  intent: { summary: string; details?: string; owner?: string };
  rubric?: {
    threshold: number;
    criteria: Array<{ id: string; description: string; weight: number; floor?: number; verify?: string }>;
  };
  matrix?: { rows: Array<{ id: string; criterion: string; evidence_required: string; verify?: string }> };
  plan?: { steps: Array<{ id: string; action: string; produces?: string; covers?: string[] }> };
  state: State;
  locks: Locks;
  scores?: Array<{ criterion: string; score: number; evaluator?: string; confidence?: number; notes?: string }>;
  evidence?: Array<{ id: string; kind: string; ref?: string; summary?: string; covers?: string[] }>;
}

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(here, "../../schemas/rubrix.schema.json");

let cachedValidator: ValidateFunction | null = null;

export function getValidator(): ValidateFunction {
  if (cachedValidator) return cachedValidator;
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  cachedValidator = ajv.compile(schema);
  return cachedValidator;
}

export interface ValidationResult {
  ok: boolean;
  errors: ErrorObject[];
}

export function validateContract(data: unknown): ValidationResult {
  const validate = getValidator();
  const ok = validate(data);
  return { ok: !!ok, errors: validate.errors ?? [] };
}

export function loadContract(path: string): RubrixContract {
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const result = validateContract(parsed);
  if (!result.ok) {
    const summary = result.errors.map(formatError).join("\n");
    throw new ContractError(`rubrix.json at ${path} is not valid:\n${summary}`);
  }
  return parsed as RubrixContract;
}

export function saveContract(path: string, contract: RubrixContract): void {
  const result = validateContract(contract);
  if (!result.ok) {
    const summary = result.errors.map(formatError).join("\n");
    throw new ContractError(`refusing to write invalid rubrix.json:\n${summary}`);
  }
  const target = resolveSymlinkTarget(path);
  const dir = dirname(target);
  const tmp = join(dir, `.${basename(target)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const data = JSON.stringify(contract, null, 2) + "\n";
  writeFileSync(tmp, data, { encoding: "utf8", mode: 0o644 });
  let fd: number | null = null;
  try {
    fd = openSync(tmp, "r");
    fsyncSync(fd);
  } finally {
    if (fd !== null) closeSync(fd);
  }
  try {
    renameSync(tmp, target);
  } catch (e) {
    try { unlinkSync(tmp); } catch {}
    throw e;
  }
}

function resolveSymlinkTarget(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export function formatError(err: ErrorObject): string {
  const where = err.instancePath || "/";
  const hint = criterionFieldHint(err);
  const tail = hint ? ` ${hint}` : err.params ? " " + JSON.stringify(err.params) : "";
  return `  ${where} ${err.message ?? "(no message)"}${tail}`;
}

function criterionFieldHint(err: ErrorObject): string | null {
  const params = err.params as Record<string, unknown> | undefined;
  if (err.keyword === "required" && params?.missingProperty === "criterion") {
    return `{"missingProperty":"criterion"} — use field name 'criterion' (not 'criterion_id'); see cli/schemas/rubrix.schema.json`;
  }
  if (err.keyword === "additionalProperties" && params?.additionalProperty === "criterion_id") {
    return `{"additionalProperty":"criterion_id"} — schema rejects 'criterion_id'; use 'criterion' instead (iteration-5 회귀 가드)`;
  }
  return null;
}

export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractError";
  }
}
