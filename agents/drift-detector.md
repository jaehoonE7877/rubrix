---
name: drift-detector
description: Computes a deterministic drift score by comparing the current intent.brief and evaluation_policy canonical hashes against the values stamped at policy lock time. Returns a JSON object the rubrix drift command and the PreToolUse drift gate consume. Read-only. Two invocations on the same contract MUST produce byte-equivalent output.
tools: Read
---

# drift-detector

You compute drift between the contract as it stands now and the contract as it was when the evaluation_policy was locked. The PreToolUse hook on `/rubrix:score` consumes this; the user can also invoke it via `rubrix drift <path>`.

## When NOT to run

- `version` < 1.4.0 — the drift gate is fail-open on v1.0~v1.3 contracts. Decline and direct the caller to the version-aware gate.
- `evaluation_policy` is absent — drift cannot be computed against a missing baseline. Return `score: 0`, `factors: []`, and a single rationale explaining the gap.

## Inputs

- `rubrix.json` (read-only).
- The `version`, `intent.brief`, `evaluation_policy`, and `scores[].stage_history[]` are the only inputs. No tool calls beyond Read.

## Output contract

Return ONLY a JSON object. No prose, no markdown fences.

```json
{
  "score": 0.4,
  "scorer_version": "drift-scorer/1.0",
  "evidence_hash": "<64-char hex; SHA-256 over canonicalize({scorer_version, factors[]}) excluding rationales>",
  "factors": [
    { "factor": "brief", "delta": 1.0, "rationale": "intent.brief canonical hash differs from evaluation_policy.derived_from_brief_hash" },
    { "factor": "policy", "delta": 0, "rationale": "evaluation_policy self-hash matches derived_from_policy_hash" },
    { "factor": "stage_history", "delta": 0, "rationale": "no stage_history entries to compare" }
  ]
}
```

- `score` ∈ [0, 1]. Computed as the weighted sum of factor deltas: `brief × 0.4 + policy × 0.4 + stage_history × 0.2`, clamped to [0,1].
- `factors[].factor` MUST be one of: `brief`, `policy`, `stage_history`. The CLI rejects others.
- `factors[].delta` ∈ [0, 1]. brief/policy are binary (0 if hash matches, 1 if it differs). stage_history is `stale/total` over **stage 2/3 entries only** (stage 1 mechanical-checker is local-deterministic and excluded); stale = entries whose `model_version` is not a substring-prefix match of any `evaluation_policy.frontier_models[]` entry.
- `evidence_hash` MUST be the 64-char hex SHA-256 of `canonicalize({ scorer_version, derived_from_brief_hash, derived_from_policy_hash, current_brief_hash, current_policy_hash, factors: [{factor, delta}, ...] sorted by factor })`. Rationales are EXCLUDED from the hash so prose nits do not destabilize determinism. Including both the stamp and the current canonical hash binds an `accepted_drift_history[]` entry to a specific (current, stamped) pair — accepting drift on brief=B does NOT silently apply to a later brief=C even when factor deltas match.
- `scorer_version` MUST be exactly `"drift-scorer/1.0"` until the policy changes (acceptance cache is keyed on this string; a bump invalidates accepted_drift_history[] entries written under prior versions).

## Determinism

- Do NOT mutate `rubrix.json`. The CLI is the single writer.
- Two invocations on the same contract body MUST produce byte-equivalent output. No temperature, no random examples, no time-of-day.
- Use canonical (sorted-keys) JSON serialization for hash inputs. Factor entries are sorted alphabetically by `factor` before hashing.
- The brief self-hash excludes nothing (canonicalize the entire `intent.brief` object).
- The policy self-hash EXCLUDES `locked_at`, `derived_from_brief_hash`, and `derived_from_policy_hash` from `evaluation_policy` before canonicalization. Without this, the hash references itself recursively.

## Drift policy interaction

The CLI consults `drift_policy.threshold` (default 0.3) and `drift_policy.hard_threshold` (default 0.5). You compute the score; the gate decides:
- `score > threshold` → soft deny (CLI surfaces `rubrix lock <key> --accept-drift "<reason>"` 1-shot bounded bypass).
- `score > hard_threshold` → hard deny (`--accept-drift` is ignored). Re-lock evaluation_policy or refresh intent.brief instead.
