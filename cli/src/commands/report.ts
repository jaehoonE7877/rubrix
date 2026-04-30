import { writeFileSync } from "node:fs";
import { ContractError, loadContract } from "../core/contract.ts";
import { evaluateGate } from "./gate.ts";
import { AXES, isCalibrated, resolveAxisDepth } from "../core/brief.ts";

export interface ReportOptions {
  path: string;
  out?: string;
}

export function buildReport(path: string): string {
  const c = loadContract(path);
  const lines: string[] = [];
  lines.push(`# Rubrix Report`);
  lines.push("");
  lines.push(`- **Intent**: ${c.intent.summary}`);
  lines.push(`- **State**: ${c.state}`);
  lines.push(`- **Locks**: rubric=${c.locks.rubric} matrix=${c.locks.matrix} plan=${c.locks.plan}`);
  lines.push("");
  if (c.intent.brief) {
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
  } else if (isCalibrated(c) === false) {
    lines.push(`> intent.brief not calibrated; effective axis depth = all standard.`);
    lines.push("");
  }
  if (c.rubric) {
    lines.push(`## Rubric (threshold ${c.rubric.threshold})`);
    lines.push("");
    lines.push("| id | axis | weight | floor | description |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const cr of c.rubric.criteria) {
      lines.push(`| ${cr.id} | ${cr.axis ?? "-"} | ${cr.weight} | ${cr.floor ?? "-"} | ${cr.description} |`);
    }
    lines.push("");
  }
  if (c.state === "Scoring" || c.state === "Passed" || c.state === "Failed") {
    const g = evaluateGate(c);
    lines.push(`## Gate: ${g.decision.toUpperCase()}`);
    lines.push("");
    lines.push(`- total=${g.total.toFixed(3)} threshold=${g.threshold}`);
    lines.push("");
    lines.push("| criterion | axis | depth | weight | floor | effective floor | score | status |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const row of g.perCriterion) {
      const effFloor = row.effectiveFloor ?? row.floor ?? "-";
      const cellFloor = row.floor ?? "-";
      const bumped = row.axisDepth === "deep" && row.effectiveFloor !== undefined && (row.floor === undefined || row.floor < row.effectiveFloor);
      const effFloorCell = bumped ? `**${effFloor}** (deep bump)` : `${effFloor}`;
      lines.push(`| ${row.id} | ${row.axis ?? "-"} | ${row.axisDepth ?? "-"} | ${row.weight} | ${cellFloor} | ${effFloorCell} | ${row.score ?? "-"} | ${row.status} |`);
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
  return lines.join("\n");
}

export function reportCommand(opts: ReportOptions): number {
  try {
    const md = buildReport(opts.path);
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
