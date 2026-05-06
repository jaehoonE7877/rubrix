export interface ScoreOptions {
  path: string;
  stage?: number;
  explain?: string;
  approveExpensive?: boolean;
}

export function scoreCommand(opts: ScoreOptions): number {
  const flagSummary = [
    opts.stage !== undefined ? `--stage ${opts.stage}` : null,
    opts.explain !== undefined ? `--explain ${opts.explain}` : null,
    opts.approveExpensive ? "--approve-expensive" : null,
  ]
    .filter((s): s is string => s !== null)
    .join(" ");
  const flagsLine = flagSummary.length > 0 ? ` (flags: ${flagSummary})` : "";
  process.stderr.write(
    `rubrix score: cascade orchestrator not yet wired (lands in PR #2 of v1.3.0)${flagsLine}\n` +
      `  contract: ${opts.path}\n` +
      `  see: https://linear.app/rubrix/issue/RUB-28 (cascade agents + cli/src/core/cascade.ts)\n`,
  );
  return 0;
}
