import { createHash } from "node:crypto";
import type { ArtifactKey, RubrixContract } from "./contract.ts";

export class ClarityScorerMalformedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClarityScorerMalformedError";
  }
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function hashArtifact(contract: RubrixContract, key: ArtifactKey): string {
  const body = contract[key];
  if (body === undefined) {
    throw new Error(`cannot hash missing artifact: ${key}`);
  }
  const canonical = canonicalize(stripClarity(body));
  return createHash("sha256").update(canonical).digest("hex");
}

function stripClarity<T extends { clarity?: unknown }>(body: T): Omit<T, "clarity"> {
  const { clarity: _ignored, ...rest } = body;
  return rest;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      sorted[k] = sortKeys(obj[k]);
    }
    return sorted;
  }
  return value;
}
