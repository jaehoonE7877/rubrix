import { writeFileSync } from "node:fs";
import { ContractError, loadContract, type ArtifactKey, type RubrixContract } from "../core/contract.ts";
import { evaluateGate } from "./gate.ts";
import { AXES, resolveAxisDepth } from "../core/brief.ts";
import { isV12Plus } from "../core/version.ts";

export interface ReportOptions {
  path: string;
  out?: string;
  explain?: string;
}

export function buildReport(path: string, opts: { explain?: string } = {}): string {
  const c = loadContract(path);
  const lines: string[] = [];
  lines.push(`# Rubrix Report`);
  lines.push("");
  lines.push(`- **Intent**: ${c.intent.summary}`);
  lines.push(`- **State**: ${c.state}`);
  lines.push(`- **Locks**: rubric=${c.locks.rubric} matrix=${c.locks.matrix} plan=${c.locks.plan}`);
  lines.push("");
  const showV11 = isV11Contract(c);
  if (showV11 && c.intent.brief) {
    const b = c.intent.brief;
    lines.push(`## Intent brief (calibrated=${b.calibrated})`);
    lines.push("");
    if (b.project_type) lines.push(`- project_type: \`${b.project_type}\``);
    if (b.situation) lines.push(`- situation: \`${b.situation}\``);
    if (b.ambition) lines.push(`- ambition: \`${b.ambition}\``);
    if (b.risk_modifiers?.length) lines.push(`- risk_modifiers: ${b.risk_modifiers.map((r) => `\`${r}\``).join(", ")}`);
    lines.push("");
    const resolved = resolveAxisDepth(c);
    lines.push("| axis | configured | effective |");
    lines.push("| --- | --- | --- |");
    for (const a of AXES) {
      const cfg = b.axis_depth?.[a] ?? "-";
      lines.push(`| ${a} | ${cfg} | ${resolved[a]} |`);
    }
    lines.push("");
  }
  if (c.rubric) {
    lines.push(`## Rubric (threshold ${c.rubric.threshold})`);
    lines.push("");
    if (showV11) {
      lines.push("| id | axis | weight | floor | description |");
      lines.push("| --- | --- | --- | --- | --- |");
      for (const cr of c.rubric.criteria) {
        lines.push(`| ${cr.id} | ${cr.axis ?? "-"} | ${cr.weight} | ${cr.floor ?? "-"} | ${cr.description} |`);
      }
    } else {
      lines.push("| id | weight | floor | description |");
      lines.push("| --- | --- | --- | --- |");
      for (const cr of c.rubric.criteria) {
        lines.push(`| ${cr.id} | ${cr.weight} | ${cr.floor ?? "-"} | ${cr.description} |`);
      }
    }
    lines.push("");
  }
  if (c.state === "Scoring" || c.state === "Passed" || c.state === "Failed") {
    const g = evaluateGate(c);
    lines.push(`## Gate: ${g.decision.toUpperCase()}`);
    lines.push("");
    lines.push(`- total=${g.total.toFixed(3)} threshold=${g.threshold}`);
    lines.push("");
    const consensusByCriterion = collectConsensusByCriterion(c);
    if (showV11) {
      lines.push("| criterion | axis | depth | weight | floor | effective floor | score | status | consensus |");
      lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
      for (const row of g.perCriterion) {
        const cellFloor = row.floor ?? "-";
        const effFloor = row.effectiveFloor ?? row.floor ?? "-";
        const bumped = row.axisDepth === "deep" && row.effectiveFloor !== undefined && (row.floor === undefined || row.floor < row.effectiveFloor);
        const effFloorCell = bumped ? `**${effFloor}** (deep bump)` : `${effFloor}`;
        const consensus = consensusByCriterion.get(row.id) ?? "";
        lines.push(`| ${row.id} | ${row.axis ?? "-"} | ${row.axisDepth ?? "-"} | ${row.weight} | ${cellFloor} | ${effFloorCell} | ${row.score ?? "-"} | ${row.status} | ${consensus} |`);
      }
    } else {
      lines.push("| criterion | weight | floor | score | status | consensus |");
      lines.push("| --- | --- | --- | --- | --- | --- |");
      for (const row of g.perCriterion) {
        const consensus = consensusByCriterion.get(row.id) ?? "";
        lines.push(`| ${row.id} | ${row.weight} | ${row.floor ?? "-"} | ${row.score ?? "-"} | ${row.status} | ${consensus} |`);
      }
    }
    if (g.reasons.length) {
      lines.push("");
      lines.push(`### Reasons`);
      for (const r of g.reasons) lines.push(`- ${r}`);
    }
    lines.push("");
  }
  if (c.evidence?.length) {
    lines.push(`## Evidence`);
    lines.push("");
    for (const e of c.evidence) {
      lines.push(`- (${e.kind}) ${e.id}${e.ref ? `: ${e.ref}` : ""}${e.summary ? ` — ${e.summary}` : ""}`);
    }
    lines.push("");
  }
  if (isV12Plus(c)) {
    const forced = collectForcedLocks(c);
    lines.push(`## Forced Locks`);
    lines.push("");
    if (forced.length === 0) {
      lines.push("No forced locks.");
      lines.push("");
    } else {
      lines.push("| artifact | score | threshold | forced_at | reason |");
      lines.push("| --- | --- | --- | --- | --- |");
      for (const f of forced) {
        lines.push(`| ${f.artifact} | ${f.score} | ${f.threshold} | ${f.forced_at} | ${escapeTableCell(f.reason)} |`);
      }
      lines.push("");
    }
  }
  if (c.goal?.condition) {
    appendGoalStatusSection(lines, c);
  }
  if (opts.explain) {
    appendExplainSection(lines, c, opts.explain);
  }
  return lines.join("\n");
}

function appendGoalStatusSection(lines: string[], c: RubrixContract): void {
  const goal = c.goal!;
  // The /goal evaluator scans the transcript every turn end and looks for the verdict markers
  // it was handed when the user pasted `/goal <condition>`. Surfacing overall_pass + state here
  // gives the small-fast evaluator a single, deterministic block to read instead of forcing it
  // to splice fragments from the rest of the report.
  lines.push(`## /goal status`);
  lines.push("");
  const truncated = goal.condition.length > 200 ? goal.condition.slice(0, 200) + "…" : goal.condition;
  lines.push(`- condition: ${truncated}`);
  lines.push(`- contract state: ${c.state}`);
  if (c.state === "Scoring" || c.state === "Passed" || c.state === "Failed") {
    const g = evaluateGate(c);
    lines.push(`- overall_pass: ${g.decision === "pass"}`);
    lines.push(`- gate total: ${g.total.toFixed(3)} (threshold ${g.threshold})`);
  } else {
    lines.push(`- overall_pass: (not yet scored — gate runs from Scoring onward)`);
  }
  lines.push("");
}

function appendExplainSection(lines: string[], c: RubrixContract, criterionId: string): void {
  lines.push(`## explain: ${criterionId}`);
  lines.push("");
  const score = c.scores?.find((s) => s.criterion === criterionId);
  if (!score) {
    lines.push(`No score entry for criterion \`${criterionId}\`.`);
    lines.push("");
    return;
  }
  const history = (score as { stage_history?: Array<{ stage: number; score: number; self_reported_confidence: number; model: string; model_version: string; prompt_version: string; latency_ms?: number; reason?: string }> }).stage_history;
  if (!history || history.length === 0) {
    lines.push(`No stage_history recorded for criterion \`${criterionId}\`.`);
    lines.push("");
    return;
  }
  lines.push("| stage | score | self_reported_confidence | model | model_version | prompt_version | latency_ms | reason |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const h of history) {
    lines.push(`| ${h.stage} | ${h.score} | ${h.self_reported_confidence} | ${h.model} | ${h.model_version} | ${h.prompt_version} | ${h.latency_ms ?? "-"} | ${h.reason ?? "-"} |`);
  }
  lines.push("");
}

interface ForcedLockRow {
  artifact: ArtifactKey;
  score: number;
  threshold: number;
  forced_at: string;
  reason: string;
}

function escapeTableCell(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ⏎ ");
}

function collectForcedLocks(c: RubrixContract): ForcedLockRow[] {
  const out: ForcedLockRow[] = [];
  const keys: ArtifactKey[] = ["rubric", "matrix", "plan"];
  for (const key of keys) {
    const cl = c[key]?.clarity;
    if (cl?.forced) {
      out.push({
        artifact: key,
        score: cl.score,
        threshold: cl.threshold,
        forced_at: cl.forced_at ?? "-",
        reason: cl.force_reason ?? "-",
      });
    }
  }
  return out;
}

function collectConsensusByCriterion(c: RubrixContract): Map<string, string> {
  const out = new Map<string, string>();
  if (!c.scores) return out;
  for (const s of c.scores) {
    const history = (s as { stage_history?: Array<{ stage: number; reason?: string }> }).stage_history;
    if (!history || history.length === 0) continue;
    const skipped = history.find((h) => h.reason === "budget");
    if (skipped) {
      out.set(s.criterion, "skipped_due_to_budget");
      continue;
    }
    const last = history[history.length - 1];
    if (last) {
      out.set(s.criterion, `stage${last.stage}`);
    }
  }
  return out;
}

function isV11Contract(c: RubrixContract): boolean {
  if (c.intent.brief !== undefined) return true;
  if (c.rubric?.criteria.some((cr) => cr.axis !== undefined)) return true;
  return false;
}

export function reportCommand(opts: ReportOptions): number {
  try {
    const md = buildReport(opts.path, { explain: opts.explain });
    if (opts.out) {
      writeFileSync(opts.out, md, "utf8");
    } else {
      process.stdout.write(md + (md.endsWith("\n") ? "" : "\n"));
    }
    return 0;
  } catch (e) {
    process.stderr.write((e instanceof Error ? e.message : String(e)) + "\n");
    return e instanceof ContractError ? 2 : 1;
  }
}
