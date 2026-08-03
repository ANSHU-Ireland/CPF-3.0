import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendAudit } from "../../db/audit.js";
import { withOrgTx, type Queryable } from "../../db/pool.js";
import { requireAuth, requireOrgRole, sendError } from "../auth/guards.js";

/**
 * S02 — server-evaluated V2 feature flags (plan §Step 2).
 *
 * Resolution order: environment kill switch → platform allowlist
 * (org_feature_flags, written only by platform admins) → assessment-pack
 * version binding on the invitation. Flags are NEVER resolved from a client
 * query parameter. Flag changes affect new invitations only — an issued
 * invitation keeps its experience_version forever (ADR-001).
 */
export const V2_FLAGS = ["candidate_v2", "reviewer_v2", "assessment_runtime_v2", "proctor_companion"] as const;
export type V2Flag = (typeof V2_FLAGS)[number];

/**
 * Independent emergency kill switches (work without code deployment: set the
 * environment variable and restart, or use the platform PUT endpoint which
 * needs no restart at all). `V2_KILL_ALL=true` downs every V2 surface.
 */
export function isKilledByEnv(flag: V2Flag, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.V2_KILL_ALL === "true") return true;
  return env[`V2_KILL_${flag.toUpperCase()}`] === "true";
}

/** Resolve all four flags for an organisation inside an existing org transaction. */
export async function resolveOrgFlags(client: Queryable, organisationId: string): Promise<Record<V2Flag, boolean>> {
  const rows = await client.query<{ flag: V2Flag; enabled: boolean }>(
    "SELECT flag, enabled FROM org_feature_flags WHERE organisation_id = $1",
    [organisationId],
  );
  const byFlag = new Map(rows.rows.map((r) => [r.flag, r.enabled]));
  const resolved = {} as Record<V2Flag, boolean>;
  for (const flag of V2_FLAGS) {
    resolved[flag] = !isKilledByEnv(flag) && (byFlag.get(flag) ?? false);
  }
  return resolved;
}

async function requirePlatformAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(request, reply);
  if (reply.sent) return;
  const isPlatformAdmin = request.auth?.memberships.some((m) => m.role === "platform_admin");
  if (!isPlatformAdmin) {
    await sendError(reply, 403, "FORBIDDEN", "Platform administrator role required.", request.id);
  }
}

const PutFlagBody = z.object({
  enabled: z.boolean(),
  note: z.string().max(500).optional(),
}).strict();

export function registerV2FlagRoutes(app: FastifyInstance): void {
  /** Tenant-visible resolved flags (any org member; server-evaluated only). */
  app.get<{ Params: { orgId: string } }>(
    "/v1/orgs/:orgId/feature-flags",
    { preHandler: [requireOrgRole("org_admin", "hiring_manager", "reviewer", "learning_admin", "support_agent")] },
    async (request) => {
      const orgId = request.orgId!;
      const flags = await withOrgTx(orgId, (client) => resolveOrgFlags(client, orgId));
      return {
        flags,
        killSwitches: Object.fromEntries(V2_FLAGS.map((f) => [f, isKilledByEnv(f)])),
        note: "Flags affect new invitations only. Issued invitations keep their experience version (ADR-001).",
      };
    },
  );

  /** Platform allowlist write path — the pilot enrolment / kill switch (audited). */
  app.put<{ Params: { orgId: string; flag: string } }>(
    "/v1/platform/organisations/:orgId/feature-flags/:flag",
    { preHandler: [requirePlatformAdmin] },
    async (request, reply) => {
      const { orgId, flag } = request.params;
      if (!(V2_FLAGS as readonly string[]).includes(flag)) {
        return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", `Unknown flag. Expected one of: ${V2_FLAGS.join(", ")}.`, request.id);
      }
      const parsed = PutFlagBody.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "Body must be { enabled: boolean, note? }.", request.id);
      }
      const auth = request.auth!;
      const result = await withOrgTx(orgId, async (client) => {
        const org = await client.query<{ id: string }>("SELECT id FROM organisations WHERE id = $1", [orgId]);
        if (!org.rows[0]) return null;
        await client.query(
          `INSERT INTO org_feature_flags (organisation_id, flag, enabled, updated_at, updated_by, note)
           VALUES ($1, $2, $3, now(), $4, $5)
           ON CONFLICT (organisation_id, flag)
           DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now(), updated_by = EXCLUDED.updated_by, note = EXCLUDED.note`,
          [orgId, flag, parsed.data.enabled, auth.userId, parsed.data.note ?? null],
        );
        await appendAudit(client, {
          organisationId: orgId,
          actorUserId: auth.userId,
          action: "platform.v2_flag_updated",
          entityType: "org_feature_flags",
          entityId: orgId,
          metadata: { flag, enabled: parsed.data.enabled, note: parsed.data.note ?? null },
        });
        return resolveOrgFlags(client, orgId);
      });
      if (!result) return sendError(reply, 404, "NOT_FOUND", "Organisation not found.", request.id);
      return reply.status(200).send({ flags: result });
    },
  );
}
