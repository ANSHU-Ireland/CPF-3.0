import { z } from "zod";
import { IsoDateTime, Sha256Hex, Uuid } from "./session.js";

/**
 * S05 — signed assessment manifest. Issued server-side when a V2 invitation
 * is accepted; pins every version the session may use. Nothing in an active
 * session may change (plan rule 1.1.9); the signature covers the pin set.
 */

export const ManifestToolPolicy = z
  .object({
    pluginId: z.string().min(1).max(80),
    pluginVersion: z.string().min(1).max(40),
    /** Declared side-effect class; the broker refuses anything not listed. */
    mode: z.enum(["read_only", "draft_preview", "session_sandbox", "simulated"]),
    /** Hard per-session invocation ceiling for this tool. */
    maxInvocations: z.number().int().positive().max(10_000),
  })
  .strict();

export const CompanionPolicy = z
  .object({
    required: z.boolean(),
    minVersion: z.string().min(1).max(40),
    /** Heartbeat cadence and loss tolerance (never auto-invalidates). */
    heartbeatIntervalSeconds: z.number().int().min(5).max(120),
    heartbeatLossPolicy: z.enum(["pause_tech", "flag_only"]),
    internalClipboardOnly: z.boolean(),
    cameraRequired: z.literal(false), // pilot: camera capture not implemented (DPIA gate A4)
  })
  .strict();

export const AssessmentManifestV2 = z
  .object({
    contract: z.literal("assessment-manifest"),
    version: z.literal(1),
    manifestId: Uuid,
    sessionId: Uuid,
    organisationId: Uuid,
    invitationId: Uuid,
    /** Single-use nonce binding finalisation to this manifest. */
    nonce: Sha256Hex,
    packCode: z.string().min(1).max(40),
    packVersion: z.number().int().positive(),
    packContentHash: Sha256Hex,
    promptVersion: z.string().min(1).max(64),
    modelPin: z.string().min(1).max(120),
    rubricVersion: z.string().min(1).max(64),
    noticeVersions: z.record(z.string(), z.string()),
    policyVersion: z.string().min(1).max(64),
    tools: z.array(ManifestToolPolicy).max(32),
    companion: CompanionPolicy,
    /** Server-authoritative time budget; accommodation multipliers already applied server-side. */
    timeboxMinutes: z.number().int().min(10).max(480),
    allowedEndpoints: z.array(z.string().url()).max(16),
    issuedAt: IsoDateTime,
    expiresAt: IsoDateTime,
    /** HMAC-SHA256 over the canonical JSON of every field above (hex). */
    signature: Sha256Hex,
  })
  .strict();
export type AssessmentManifestV2 = z.infer<typeof AssessmentManifestV2>;

/** Artifact lifecycle: immutable versions, one logical final pointer. */
export const ArtifactKind = z.enum(["file", "document", "table", "creative", "code_patch", "handover_note"]);

export const ArtifactVersionV2 = z
  .object({
    contract: z.literal("artifact-version"),
    version: z.literal(1),
    artifactId: Uuid,
    versionNo: z.number().int().positive(),
    contentHash: Sha256Hex,
    sizeBytes: z.number().int().nonnegative().max(50 * 1024 * 1024),
    mimeType: z.string().min(3).max(120),
    createdAt: IsoDateTime,
    /** Provenance chip, not a punitive label. */
    provenance: z.enum(["candidate", "ai_assisted", "imported_asset"]),
  })
  .strict();

export const ArtifactV2 = z
  .object({
    contract: z.literal("artifact"),
    version: z.literal(1),
    artifactId: Uuid,
    sessionId: Uuid,
    kind: ArtifactKind,
    path: z.string().min(1).max(300),
    deliverableSlot: z.string().min(1).max(80).nullable(),
    latestVersionNo: z.number().int().positive(),
    finalVersionNo: z.number().int().positive().nullable(),
    deletedAt: IsoDateTime.nullable(),
  })
  .strict();
