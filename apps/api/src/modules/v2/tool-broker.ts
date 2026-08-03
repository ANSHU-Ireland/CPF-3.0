import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { hashToken } from "@cpf/identity";
import { z } from "zod";
import { loadPack, type PackCode } from "@cpf/assessment-packs";
import { getPool, withOrgTx, type Queryable } from "../../db/pool.js";
import { sendError } from "../auth/guards.js";

/**
 * S10 — sandbox plugin broker.
 *
 * Every plugin here is a deterministic, in-process function over the pack's
 * supplied assets and the candidate's own session artifacts. There is no
 * network I/O in this module BY CONSTRUCTION (the egress-deny test asserts
 * it), no live publish/send/spend operation exists, and model-suggested
 * arguments are untrusted until validated by each plugin's own Zod schema.
 *
 * Receipts are immutable (append-only table) and candidate-visible, citing
 * the source asset + operation + result hash. Idempotency-Key replays return
 * the original receipt. Three consecutive failures open a circuit for that
 * plugin (circuit_open receipts) without affecting other plugins.
 */

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const CIRCUIT_THRESHOLD = 3;

interface PluginExecution {
  ok: boolean;
  result: unknown;
  sourceDescriptor: string;
}

interface PluginDef {
  operations: Record<
    string,
    {
      schema: z.ZodTypeAny;
      stateChanging: boolean;
      execute: (args: never, ctx: PluginRunCtx) => Promise<PluginExecution> | PluginExecution;
    }
  >;
}

interface PluginRunCtx {
  client: Queryable;
  organisationId: string;
  sessionId: string;
  packCode: PackCode;
}

function assetContent(packCode: PackCode, pathPrefix: string): { path: string; content: string } | null {
  const pack = loadPack(packCode);
  const asset = pack.assets.find((a) => a.path.startsWith(pathPrefix)) ?? pack.assets[0];
  return asset ? { path: asset.path, content: asset.content } : null;
}

/** Read-only snapshot plugins share one implementation: serve the relevant pack asset. */
function snapshotPlugin(prefixes: string[]): PluginDef {
  return {
    operations: {
      query: {
        schema: z.object({ topic: z.string().max(120).optional() }).strict(),
        stateChanging: false,
        execute: (_args, ctx) => {
          for (const prefix of prefixes) {
            const asset = assetContent(ctx.packCode, prefix);
            if (asset) {
              return { ok: true, result: { data: asset.content }, sourceDescriptor: `snapshot:${asset.path}` };
            }
          }
          return { ok: false, result: { error: "NO_SNAPSHOT" }, sourceDescriptor: "snapshot:none" };
        },
      },
    },
  };
}

const PLUGINS: Record<string, PluginDef> = {
  repofs: {
    operations: {
      read: {
        schema: z.object({ path: z.string().min(1).max(300) }).strict(),
        stateChanging: false,
        execute: async (args: { path: string }, ctx) => {
          if (args.path.includes("..")) return { ok: false, result: { error: "PATH_DENIED" }, sourceDescriptor: "repofs:denied" };
          const pack = loadPack(ctx.packCode);
          const asset = pack.assets.find((a) => a.path === args.path);
          if (asset) return { ok: true, result: { content: asset.content }, sourceDescriptor: `repofs:asset:${asset.path}` };
          const artifact = await ctx.client.query<{ content: string | null }>(
            `SELECT av.content FROM workspace_artifacts wa
              JOIN artifact_versions av ON av.artifact_id = wa.id AND av.version_no = wa.latest_version_no
             WHERE wa.session_id = $1 AND wa.path = $2`,
            [ctx.sessionId, args.path],
          );
          if (!artifact.rows[0]) return { ok: false, result: { error: "NOT_FOUND" }, sourceDescriptor: "repofs:miss" };
          return { ok: true, result: { content: artifact.rows[0].content }, sourceDescriptor: `repofs:artifact:${args.path}` };
        },
      },
      list: {
        schema: z.object({}).strict(),
        stateChanging: false,
        execute: async (_args, ctx) => {
          const pack = loadPack(ctx.packCode);
          const artifacts = await ctx.client.query<{ path: string }>(
            "SELECT path FROM workspace_artifacts WHERE session_id = $1 AND deleted_at IS NULL ORDER BY path",
            [ctx.sessionId],
          );
          return {
            ok: true,
            result: { assets: pack.assets.map((a) => a.path), artifacts: artifacts.rows.map((r) => r.path) },
            sourceDescriptor: "repofs:index",
          };
        },
      },
    },
  },
  testrunner: {
    operations: {
      run: {
        schema: z.object({}).strict(),
        stateChanging: false,
        execute: async (_args, ctx) => {
          // Visible tests ONLY — deterministic checks over the candidate's
          // patch artifact. Hidden checks are a different code path that this
          // module cannot reach (they live behind loadHiddenChecks, server-
          // side finalisation only).
          const patch = await ctx.client.query<{ content: string | null }>(
            `SELECT av.content FROM workspace_artifacts wa
              JOIN artifact_versions av ON av.artifact_id = wa.id AND av.version_no = wa.latest_version_no
             WHERE wa.session_id = $1 AND wa.deliverable_slot = 'code_patch'
             ORDER BY av.created_at DESC LIMIT 1`,
            [ctx.sessionId],
          );
          const content = patch.rows[0]?.content ?? "";
          const visible = [
            { id: "vt-1", name: "archives own-tenant invoices", passed: /organisation_id/.test(content) },
            { id: "vt-2", name: "rejects foreign-tenant ids", passed: /403|FORBIDDEN|cross.?tenant/i.test(content) },
            { id: "vt-3", name: "enforces 50-item batch limit", passed: /50|BATCH_LIMIT/.test(content) },
            { id: "vt-4", name: "honours Idempotency-Key", passed: /idempotenc/i.test(content) },
          ];
          return {
            ok: true,
            result: { total: visible.length, passed: visible.filter((t) => t.passed).length, tests: visible },
            sourceDescriptor: "testrunner:visible-suite@1",
          };
        },
      },
    },
  },
  apiclient: {
    operations: {
      invoke: {
        schema: z.object({ method: z.enum(["GET", "POST"]), route: z.string().min(1).max(200) }).strict(),
        stateChanging: false,
        execute: (args: { method: string; route: string }) => {
          if (!args.route.startsWith("/v1/")) return { ok: false, result: { error: "SANDBOX_ORIGIN_ONLY" }, sourceDescriptor: "apiclient:denied" };
          return {
            ok: true,
            result: { status: 200, body: { note: "sandbox response", route: args.route, method: args.method } },
            sourceDescriptor: "apiclient:sandbox@1",
          };
        },
      },
    },
  },
  dbplan: {
    operations: {
      explain: {
        schema: z.object({ query: z.string().min(1).max(4000) }).strict(),
        stateChanging: false,
        execute: (args: { query: string }) => {
          if (/\b(drop|truncate|delete|update|insert)\b/i.test(args.query)) {
            return { ok: false, result: { error: "READ_ONLY" }, sourceDescriptor: "dbplan:denied" };
          }
          return {
            ok: true,
            result: { plan: `Seq Scan on invoices (cost=0.00..35.50) — add index on (organisation_id, status) for the archived filter.` },
            sourceDescriptor: "dbplan:sandbox-schema@1",
          };
        },
      },
    },
  },
  featureflaglab: {
    operations: {
      stage: {
        schema: z.object({ flag: z.string().min(1).max(120), value: z.union([z.boolean(), z.string().max(120)]) }).strict(),
        stateChanging: true,
        execute: (args: { flag: string; value: boolean | string }) => ({
          ok: true,
          result: { staged: true, flag: args.flag, value: args.value, note: "Simulated environment — reversible, nothing deployed." },
          sourceDescriptor: "featureflaglab:simulated@1",
        }),
      },
    },
  },
  claimschecker: {
    operations: {
      check: {
        schema: z.object({ text: z.string().min(1).max(20_000) }).strict(),
        stateChanging: false,
        execute: (args: { text: string }, ctx) => {
          const policy = assetContent(ctx.packCode, "policy/")?.content ?? assetContent(ctx.packCode, "gtm/suppression")?.content ?? "";
          const findings: Array<{ claim: string; status: string }> = [];
          if (/sharpest on the market/i.test(args.text)) findings.push({ claim: "sharpest on the market", status: "restricted_needs_proof" });
          if (/guarantee/i.test(args.text)) findings.push({ claim: "guarantee…", status: "prohibited_without_legal" });
          if (/(cure|health benefit)/i.test(args.text)) findings.push({ claim: "health claim", status: "prohibited" });
          return {
            ok: true,
            result: { findings, clean: findings.length === 0, policySource: policy ? "pack policy asset" : "default policy" },
            sourceDescriptor: "claimschecker:policy@1",
          };
        },
      },
    },
  },
  budgetworksheet: {
    operations: {
      save: {
        schema: z
          .object({
            rows: z.array(z.object({ line: z.string().min(1).max(120), amountPerDay: z.number().nonnegative().max(1_000_000), note: z.string().max(400).default("") })).min(1).max(50),
          })
          .strict(),
        stateChanging: true,
        execute: (args: { rows: Array<{ line: string; amountPerDay: number; note: string }> }) => {
          const total = args.rows.reduce((s, r) => s + r.amountPerDay, 0);
          return { ok: true, result: { total, rows: args.rows.length }, sourceDescriptor: "budgetworksheet:session@1" };
        },
      },
    },
  },
  cmspreview: {
    operations: {
      render: {
        schema: z.object({ content: z.string().min(1).max(100_000) }).strict(),
        stateChanging: false,
        execute: (args: { content: string }) => ({
          ok: true,
          result: { previewHash: sha256(args.content), mode: "draft_only", note: "Preview render — nothing is published." },
          sourceDescriptor: "cmspreview:renderer@1",
        }),
      },
    },
  },
  emailpreview: {
    operations: {
      render: {
        schema: z.object({ content: z.string().min(1).max(100_000), segmentNote: z.string().max(2000).default("") }).strict(),
        stateChanging: false,
        execute: (args: { content: string }) => ({
          ok: true,
          result: { previewHash: sha256(args.content), sendCapability: "none", note: "Draft preview only — no send path exists." },
          sourceDescriptor: "emailpreview:renderer@1",
        }),
      },
    },
  },
  loglab: snapshotPlugin(["incident/logs"]),
  tracelab: snapshotPlugin(["incident/"]),
  metricslab: snapshotPlugin(["incident/metrics"]),
  ga4lab: snapshotPlugin(["data/ga4"]),
  adslab: snapshotPlugin(["data/ads"]),
  crmlab: snapshotPlugin(["data/crm", "gtm/"]),
  pagelab: snapshotPlugin(["data/ga4"]),
  searchlab: snapshotPlugin(["gtm/benchmarks", "data/"]),
};

const InvokeSchema = z
  .object({
    arguments: z.record(z.string(), z.unknown()).default({}),
    requestedBy: z.enum(["candidate", "assistant_proposal"]).default("candidate"),
    candidateConfirmed: z.boolean().default(false),
  })
  .strict();

function readCandidateToken(request: FastifyRequest): string | null {
  const raw = request.headers["x-cpf-candidate-token"];
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  if (Array.isArray(raw) && raw[0]?.trim()) return raw[0].trim();
  return null;
}

export function registerToolBrokerRoutes(app: FastifyInstance): void {
  app.post<{ Params: { sessionId: string; pluginId: string; operation: string } }>(
    "/v2/sessions/:sessionId/tools/:pluginId/:operation",
    async (request, reply) => {
      const params = z
        .object({ sessionId: z.string().uuid(), pluginId: z.string().min(1).max(80), operation: z.string().min(1).max(120) })
        .safeParse(request.params);
      if (!params.success) return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "Invalid tool invocation path.", request.id);
      const idempotencyKey = request.headers["idempotency-key"];
      if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 120) {
        return sendError(reply, 400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header (8..120 chars) is required for tool calls.", request.id);
      }
      const token = readCandidateToken(request);
      if (!token) return sendError(reply, 401, "UNAUTHENTICATED", "Candidate runtime token missing.", request.id);
      const lookup = await getPool().query<{ organisation_id: string; invitation_id: string }>(
        "SELECT organisation_id, invitation_id FROM invitation_lookup WHERE token_hash = $1 AND expires_at > now()",
        [hashToken(token)],
      );
      const inv = lookup.rows[0];
      if (!inv) return sendError(reply, 404, "SESSION_NOT_FOUND", "Session not found for provided runtime token.", request.id);

      const body = InvokeSchema.safeParse(request.body ?? {});
      if (!body.success) return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "Invalid tool invocation body.", request.id);

      return withOrgTx(inv.organisation_id, async (client) => {
        const session = await client.query("SELECT 1 FROM assessment_sessions WHERE invitation_id = $1 AND id = $2", [
          inv.invitation_id,
          params.data.sessionId,
        ]);
        if ((session.rowCount ?? 0) === 0) {
          return sendError(reply, 404, "SESSION_NOT_FOUND", "Session not found for provided runtime token.", request.id);
        }

        // Idempotent replay.
        const replay = await client.query(
          `SELECT invocation_id, status, source_descriptor, result_hash, started_at, completed_at
             FROM tool_receipts WHERE session_id = $1 AND idempotency_key = $2`,
          [params.data.sessionId, idempotencyKey],
        );
        if (replay.rows[0]) return reply.status(200).send({ receipt: replay.rows[0], replay: true });

        const manifest = await client.query<{ state_v2: string; manifest: { packCode: PackCode; tools: Array<{ pluginId: string; pluginVersion: string; mode: string; maxInvocations: number }> } }>(
          "SELECT state_v2, manifest FROM session_manifests WHERE session_id = $1 FOR UPDATE",
          [params.data.sessionId],
        );
        const m = manifest.rows[0];
        if (!m) return sendError(reply, 404, "SESSION_NOT_FOUND", "No V2 manifest for session.", request.id);
        if (m.state_v2 !== "active") {
          return sendError(reply, 409, "STATE_CONFLICT", `Tools are available only during an active session (state: ${m.state_v2}).`, request.id);
        }

        // Capability check: plugin must be pinned in THIS session's manifest.
        const toolPolicy = m.manifest.tools.find((t) => t.pluginId === params.data.pluginId);
        const def = PLUGINS[params.data.pluginId];
        const op = def?.operations[params.data.operation];
        if (!toolPolicy || !def || !op) {
          return sendError(reply, 403, "TOOL_NOT_IN_MANIFEST", "This tool/operation is not available in this assessment.", request.id);
        }

        const invocations = await client.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM tool_receipts WHERE session_id = $1 AND plugin_id = $2",
          [params.data.sessionId, params.data.pluginId],
        );
        if ((invocations.rows[0]?.n ?? 0) >= toolPolicy.maxInvocations) {
          return sendError(reply, 429, "TOOL_BUDGET_EXHAUSTED", "The invocation budget for this tool is used up.", request.id);
        }

        // Circuit breaker: 3 consecutive failures → open (per session+plugin).
        const recent = await client.query<{ status: string }>(
          "SELECT status FROM tool_receipts WHERE session_id = $1 AND plugin_id = $2 ORDER BY started_at DESC LIMIT $3",
          [params.data.sessionId, params.data.pluginId, CIRCUIT_THRESHOLD],
        );
        const circuitOpen =
          recent.rows.length === CIRCUIT_THRESHOLD && recent.rows.every((r) => r.status === "failed" || r.status === "timeout");

        // Model-proposed state changes need explicit human confirmation.
        if (op.stateChanging && body.data.requestedBy === "assistant_proposal" && !body.data.candidateConfirmed) {
          return sendError(reply, 428, "CANDIDATE_CONFIRMATION_REQUIRED", "This action changes sandbox state — the candidate must confirm it.", request.id);
        }

        const startedAt = new Date();
        let status: "ok" | "failed" | "denied" | "circuit_open" = "ok";
        let execution: PluginExecution = { ok: false, result: null, sourceDescriptor: "unset" };
        if (circuitOpen) {
          status = "circuit_open";
          execution = { ok: false, result: { error: "CIRCUIT_OPEN", note: "Tool temporarily disabled after repeated failures. Other tools are unaffected." }, sourceDescriptor: "broker:circuit" };
        } else {
          const argCheck = op.schema.safeParse(body.data.arguments);
          if (!argCheck.success) {
            status = "denied";
            execution = { ok: false, result: { error: "ARGUMENTS_INVALID", issues: argCheck.error.issues.map((i) => i.message) }, sourceDescriptor: "broker:validation" };
          } else {
            try {
              execution = await op.execute(argCheck.data as never, {
                client,
                organisationId: inv.organisation_id,
                sessionId: params.data.sessionId,
                packCode: m.manifest.packCode,
              });
              status = execution.ok ? "ok" : "failed";
            } catch {
              status = "failed";
              execution = { ok: false, result: { error: "PLUGIN_ERROR" }, sourceDescriptor: "broker:exception" };
            }
          }
        }

        const resultJson = JSON.stringify(execution.result ?? null);
        const invocationId = (await client.query<{ id: string }>("SELECT gen_random_uuid() AS id")).rows[0]!.id;
        const receipt = await client.query<{ invocation_id: string; status: string; source_descriptor: string; result_hash: string | null; started_at: Date; completed_at: Date }>(
          `INSERT INTO tool_receipts
             (organisation_id, session_id, invocation_id, idempotency_key, plugin_id, plugin_version, operation, status,
              source_descriptor, result_hash, result_bytes, requested_by, candidate_confirmed, started_at, completed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
           RETURNING invocation_id, status, source_descriptor, result_hash, started_at, completed_at`,
          [
            inv.organisation_id,
            params.data.sessionId,
            invocationId,
            idempotencyKey,
            params.data.pluginId,
            toolPolicy.pluginVersion,
            params.data.operation,
            status,
            execution.sourceDescriptor,
            status === "ok" ? sha256(resultJson) : null,
            Buffer.byteLength(resultJson, "utf8"),
            body.data.requestedBy,
            body.data.candidateConfirmed,
            startedAt,
          ],
        );
        return reply.status(201).send({ receipt: receipt.rows[0], result: execution.result, replay: false });
      });
    },
  );

  app.get<{ Params: { sessionId: string } }>("/v2/sessions/:sessionId/tools/receipts", async (request, reply) => {
    const params = z.object({ sessionId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return sendError(reply, 400, "REQUEST_VALIDATION_FAILED", "Invalid session id.", request.id);
    const token = readCandidateToken(request);
    if (!token) return sendError(reply, 401, "UNAUTHENTICATED", "Candidate runtime token missing.", request.id);
    const lookup = await getPool().query<{ organisation_id: string; invitation_id: string }>(
      "SELECT organisation_id, invitation_id FROM invitation_lookup WHERE token_hash = $1 AND expires_at > now()",
      [hashToken(token)],
    );
    const inv = lookup.rows[0];
    if (!inv) return sendError(reply, 404, "SESSION_NOT_FOUND", "Session not found for provided runtime token.", request.id);
    return withOrgTx(inv.organisation_id, async (client) => {
      const rows = await client.query(
        `SELECT invocation_id, plugin_id, plugin_version, operation, status, source_descriptor, result_hash, started_at, completed_at
           FROM tool_receipts WHERE session_id = $1 ORDER BY started_at DESC LIMIT 200`,
        [params.data.sessionId],
      );
      return { receipts: rows.rows };
    });
  });
}
