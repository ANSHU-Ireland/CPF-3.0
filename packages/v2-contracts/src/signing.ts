import { createHmac } from "node:crypto";
import type { AssessmentManifestV2 } from "./manifest.js";

/**
 * Manifest signing (S05). HMAC-SHA256 over canonical JSON (sorted keys,
 * signature field excluded). The signing key lives server-side only — the
 * companion and web runtime verify via the API, never with a local key.
 */

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonicalise(v)]),
    );
  }
  return value;
}

export function manifestSigningPayload(manifest: Omit<AssessmentManifestV2, "signature">): string {
  return JSON.stringify(canonicalise(manifest));
}

export function signManifest(manifest: Omit<AssessmentManifestV2, "signature">, key: string): string {
  return createHmac("sha256", key).update(manifestSigningPayload(manifest), "utf8").digest("hex");
}

export function verifyManifestSignature(manifest: AssessmentManifestV2, key: string): boolean {
  const { signature, ...rest } = manifest;
  return signManifest(rest, key) === signature;
}
