import { createHash } from "node:crypto";
import { ContractError, loadContract, type RubrixContract } from "../core/contract.ts";
import { canonicalize } from "../core/clarity.ts";

const MAX_CONDITION_CHARS = 4000;
const ALLOWED_STATES: ReadonlySet<string> = new Set(["PlanLocked", "Scoring", "Failed"]);
const REQUIRED_KEYWORDS: ReadonlyArray<string> = ["rubrix gate", "overall_pass", "Passed"];
const FORBIDDEN_PATTERNS: ReadonlyArray<RegExp> = [
  /\bcat\s+rubrix\.json/i,
  /\bread\s+the\s+file/i,
  /\bopen\s+the\s+file/i,
  /\breadFile(?:Sync)?\b/i,
];

export interface GoalPrintOptions {
  path: string;
  json?: boolean;
}

export interface GoalValidateOptions {
  path: string;
  condition: string;
  json?: boolean;
}

interface SynthesizedCondition {
  condition: string;
  length: number;
  criteria_count: number;
  criteria_included: number;
  suggested_for_state: string;
  derived_from_contract_hash: string;
}

export function goalPrintCommand(opts: GoalPrintOptions): number {
  try {
    const c = loadContract(opts.path);
    if (!ALLOWED_STATES.has(c.state)) {
      process.stderr.write(
        `rubrix goal print: refusing — contract state is ${c.state}; /rubrix:goal requires PlanLocked, Scoring, or Failed (run /rubrix:plan to lock first)\n`,
      );
      return 3;
    }
    const result = synthesizeCondition(c, opts.path);
    if (opts.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else {
      process.stdout.write(result.condition + "\n");
    }
    return 0;
  } catch (e) {
    process.stderr.write(formatErr(e));
    return e instanceof ContractError ? 2 : 1;
  }
}

export function goalValidateCommand(opts: GoalValidateOptions): number {
  try {
    loadContract(opts.path);
    const issues = checkCondition(opts.condition);
    if (issues.length > 0) {
      if (opts.json) {
        process.stdout.write(
          JSON.stringify({ ok: false, length: opts.condition.length, issues }, null, 2) + "\n",
        );
      } else {
        for (const issue of issues) process.stderr.write(`rubrix goal validate: ${issue}\n`);
      }
      return 3;
    }
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ ok: true, length: opts.condition.length, issues: [] }, null, 2) + "\n",
      );
    } else {
      process.stdout.write(`ok: condition length=${opts.condition.length}\n`);
    }
    return 0;
  } catch (e) {
    process.stderr.write(formatErr(e));
    return e instanceof ContractError ? 2 : 1;
  }
}

export function synthesizeCondition(c: RubrixContract, path: string): SynthesizedCondition {
  const crit = c.rubric?.criteria ?? [];
  const total = crit.length;
  // Normalize absent artifacts to explicit null so canonical-JSON hash is deterministic
  // (JSON.stringify silently drops undefined-valued keys, otherwise).
  const hash = createHash("sha256")
    .update(canonicalize({ rubric: c.rubric ?? null, matrix: c.matrix ?? null, plan: c.plan ?? null }))
    .digest("hex");

  const sorted = [...crit].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  const floorLine = (x: (typeof sorted)[number]): string => `\`${x.id}>=${x.floor ?? 0}\``;

  const header =
    `Run \`node cli/bin/rubrix.js gate ${path} --json\` and check that the JSON output has ` +
    `\`overall_pass: true\` and \`state: "Passed"\`.`;
  const tail =
    ` If state is \`Failed\`, run \`/rubrix:plan\` with "revise the plan now" then \`/rubrix:score\`.` +
    ` If overall_pass is false but state is \`Scoring\`, run \`/rubrix:score\` first.`;

  // Pathological case: even the minimal verdict-bearing form doesn't fit (e.g. extremely long path).
  // Emit a markers-first form so a tail-side hard-truncate cannot strip the evaluator-critical
  // verdict markers (`rubrix gate`, `--json`, `overall_pass: true`, `state: "Passed"`).
  if (header.length + tail.length > MAX_CONDITION_CHARS) {
    const markersFirst =
      `Verify the JSON output of \`rubrix gate <path> --json\` shows \`overall_pass: true\` and \`state: "Passed"\`.` +
      ` Contract path: ${path}`;
    // If even this is too long, hard-truncate the tail (which is now just the path) — markers survive.
    const condition =
      markersFirst.length > MAX_CONDITION_CHARS ? markersFirst.slice(0, MAX_CONDITION_CHARS) : markersFirst;
    return {
      condition,
      length: condition.length,
      criteria_count: total,
      criteria_included: 0,
      suggested_for_state: c.state,
      derived_from_contract_hash: hash,
    };
  }

  // Normal path: fit as many criteria as possible between header and tail.
  let condition = header + tail;
  let included = 0;
  for (let n = total; n >= 0; n--) {
    const taken = sorted.slice(0, n);
    const more = total - n;
    const floors =
      taken.length === 0
        ? ""
        : ` Each of these per-criterion floors must be met: ${taken.map(floorLine).join(", ")}.`;
    const moreNote = more > 0 ? ` (+${more} more criteria — see rubric.)` : "";
    const candidate = header + floors + moreNote + tail;
    if (candidate.length <= MAX_CONDITION_CHARS) {
      condition = candidate;
      included = n;
      break;
    }
  }

  return {
    condition,
    length: condition.length,
    criteria_count: total,
    criteria_included: included,
    suggested_for_state: c.state,
    derived_from_contract_hash: hash,
  };
}

export function checkCondition(condition: string): string[] {
  const issues: string[] = [];
  if (condition.length === 0) {
    issues.push("condition is empty");
    return issues;
  }
  if (condition.length > MAX_CONDITION_CHARS) {
    issues.push(`condition exceeds ${MAX_CONDITION_CHARS} character cap (got ${condition.length})`);
  }
  const hasKeyword = REQUIRED_KEYWORDS.some((kw) => condition.includes(kw));
  if (!hasKeyword) {
    issues.push(
      `condition must reference at least one evaluator-friendly marker: ${REQUIRED_KEYWORDS.join(", ")}. /goal's evaluator only sees the transcript, so the condition must point at a transcript-visible verdict.`,
    );
  }
  for (const pat of FORBIDDEN_PATTERNS) {
    if (pat.test(condition)) {
      issues.push(
        `condition references filesystem read (matched /${pat.source}/${pat.flags}); /goal evaluator cannot call tools — conditions that ask it to read files will never pass. Use the gate --json transcript output instead.`,
      );
      break;
    }
  }
  return issues;
}

function formatErr(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)) + "\n";
}
