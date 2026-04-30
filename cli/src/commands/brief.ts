import { existsSync } from "node:fs";
import { ContractError, loadContract, saveContract, type IntentBrief } from "../core/contract.ts";
import {
  AXES,
  isAxis,
  isAxisDepth,
  newCalibratedContract,
  resolveAxisDepth,
} from "../core/brief.ts";

const PROJECT_TYPES = ["greenfield", "brownfield_refactor", "brownfield_feature", "infra", "doc"] as const;
const SITUATIONS = ["prototype", "internal_tool", "customer_facing", "regulated"] as const;
const AMBITIONS = ["demo", "mvp", "production", "hardened"] as const;

export interface BriefInitOptions {
  path: string;
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

export interface BriefGetOptions {
  path: string;
  axis?: string;
  json?: boolean;
}

export function briefInitCommand(opts: BriefInitOptions): number {
  try {
    const brief = parseBriefOptions(opts);
    if (existsSync(opts.path)) {
      const existing = loadContract(opts.path);
      if (existing.state !== "IntentDrafted") {
        process.stderr.write(
          `refusing to overwrite brief: contract is at state=${existing.state} (only IntentDrafted may be re-briefed)\n`,
        );
        return 3;
      }
      existing.intent.brief = { calibrated: true, ...brief };
      if (opts.summary !== undefined) existing.intent.summary = opts.summary;
      if (opts.details !== undefined) existing.intent.details = opts.details;
      if (opts.owner !== undefined) existing.intent.owner = opts.owner;
      saveContract(opts.path, existing);
      emitBrief(existing.intent.brief, opts.json);
      return 0;
    }
    if (!opts.summary) {
      process.stderr.write("brief init: --summary is required when creating a new contract\n");
      return 2;
    }
    const fresh = newCalibratedContract({
      summary: opts.summary,
      brief,
      details: opts.details,
      owner: opts.owner,
    });
    saveContract(opts.path, fresh);
    if (fresh.intent.brief) emitBrief(fresh.intent.brief, opts.json);
    return 0;
  } catch (e) {
    process.stderr.write(formatErr(e));
    return e instanceof ContractError ? 2 : 1;
  }
}

export function briefGetCommand(opts: BriefGetOptions): number {
  try {
    const c = loadContract(opts.path);
    const brief = c.intent.brief;
    if (!brief) {
      if (opts.json) {
        process.stdout.write(JSON.stringify({ calibrated: false }, null, 2) + "\n");
      } else {
        process.stdout.write("(no brief)\n");
      }
      return 0;
    }
    if (opts.axis) {
      if (!isAxis(opts.axis)) {
        process.stderr.write(`unknown axis: ${opts.axis} (allowed: ${AXES.join(",")})\n`);
        return 2;
      }
      const resolved = resolveAxisDepth(c);
      const value = resolved[opts.axis];
      if (opts.json) {
        process.stdout.write(JSON.stringify({ axis: opts.axis, depth: value }, null, 2) + "\n");
      } else {
        process.stdout.write(`${value}\n`);
      }
      return 0;
    }
    emitBrief(brief, opts.json);
    return 0;
  } catch (e) {
    process.stderr.write(formatErr(e));
    return e instanceof ContractError ? 2 : 1;
  }
}

function parseBriefOptions(opts: BriefInitOptions): Omit<IntentBrief, "calibrated"> {
  const out: Omit<IntentBrief, "calibrated"> = {};
  if (opts.projectType) {
    if (!(PROJECT_TYPES as ReadonlyArray<string>).includes(opts.projectType)) {
      throw new Error(`brief init: unknown --project-type: ${opts.projectType} (allowed: ${PROJECT_TYPES.join(",")})`);
    }
    out.project_type = opts.projectType as IntentBrief["project_type"];
  }
  if (opts.situation) {
    if (!(SITUATIONS as ReadonlyArray<string>).includes(opts.situation)) {
      throw new Error(`brief init: unknown --situation: ${opts.situation} (allowed: ${SITUATIONS.join(",")})`);
    }
    out.situation = opts.situation as IntentBrief["situation"];
  }
  if (opts.ambition) {
    if (!(AMBITIONS as ReadonlyArray<string>).includes(opts.ambition)) {
      throw new Error(`brief init: unknown --ambition: ${opts.ambition} (allowed: ${AMBITIONS.join(",")})`);
    }
    out.ambition = opts.ambition as IntentBrief["ambition"];
  }
  if (opts.risk && opts.risk.length > 0) {
    out.risk_modifiers = opts.risk.slice();
  }
  if (opts.axis && opts.axis.length > 0) {
    const depth: Partial<Record<(typeof AXES)[number], string>> = {};
    for (const entry of opts.axis) {
      const eq = entry.indexOf("=");
      if (eq < 0) {
        throw new Error(`brief init: --axis must be name=depth (got ${entry})`);
      }
      const name = entry.slice(0, eq);
      const value = entry.slice(eq + 1);
      if (!isAxis(name)) {
        throw new Error(`brief init: unknown axis name in --axis ${entry}`);
      }
      if (!isAxisDepth(value)) {
        throw new Error(`brief init: unknown axis depth in --axis ${entry} (allowed: light,standard,deep)`);
      }
      depth[name] = value;
    }
    out.axis_depth = depth as IntentBrief["axis_depth"];
  }
  return out;
}

function emitBrief(brief: IntentBrief, json: boolean | undefined): void {
  if (json) {
    process.stdout.write(JSON.stringify(brief, null, 2) + "\n");
    return;
  }
  process.stdout.write(`calibrated=${brief.calibrated}\n`);
  if (brief.project_type) process.stdout.write(`project_type=${brief.project_type}\n`);
  if (brief.situation) process.stdout.write(`situation=${brief.situation}\n`);
  if (brief.ambition) process.stdout.write(`ambition=${brief.ambition}\n`);
  if (brief.risk_modifiers?.length) process.stdout.write(`risk_modifiers=${brief.risk_modifiers.join(",")}\n`);
  if (brief.axis_depth) {
    for (const a of AXES) {
      const v = brief.axis_depth[a];
      if (v) process.stdout.write(`axis_depth.${a}=${v}\n`);
    }
  }
}

function formatErr(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)) + "\n";
}
