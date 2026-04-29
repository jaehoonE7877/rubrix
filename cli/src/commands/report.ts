import { writeFileSync } from "node:fs";
import { ContractError, loadContract } from "../core/contract.ts";
import { evaluateGate } from "./gate.ts";

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
  if (c.rubric) {
    lines.push(`## Rubric (threshold ${c.rubric.threshold})`);
    lines.push("");
    lines.push("| id | weight | floor | description |");
    lines.push("| --- | --- | --- | --- |");
    for (const cr of c.rubric.criteria) {
      lines.push(`| ${cr.id} | ${cr.weight} | ${cr.floor ?? "-"} | ${cr.description} |`);
    }
    lines.push("");
  }
  if (c.state === "Scoring" || c.state === "Passed" || c.state === "Failed") {
    const g = evaluateGate(c);
    lines.push(`## Gate: ${g.decision.toUpperCase()}`);
    lines.push("");
    lines.push(`- total=${g.total.toFixed(3)} threshold=${g.threshold}`);
    lines.push("");
    lines.push("| criterion | weight | floor | score | status |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const row of g.perCriterion) {
      lines.push(`| ${row.id} | ${row.weight} | ${row.floor ?? "-"} | ${row.score ?? "-"} | ${row.status} |`);
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
