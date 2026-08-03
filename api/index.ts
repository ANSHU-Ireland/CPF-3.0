// Vercel serverless entrypoint for the UNIFIED single-project deploy.
//
// This project serves the legacy web frontend (static, from apps/web/dist) and
// the CPF API together on one domain. The frontend calls relative paths
// (/v1, /v2, /health); vercel.json rewrites those here, so the API is
// same-origin — no CORS, and the Bearer-token auth flow works unchanged.
//
// Imports resolve against the API's compiled output in apps/api/dist, produced
// by the project buildCommand (`npm run build`). This file lives at the repo
// root outside any workspace src/, so no workspace tsc build compiles it —
// only Vercel's @vercel/node runtime does.
import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "../apps/api/dist/app.js";
import { loadConfig } from "../apps/api/dist/config.js";

const config = loadConfig();
const m = config.RATE_LIMIT_TEST_MULTIPLIER;

const app = buildApp({
  ...(config.DATABASE_URL !== undefined ? { databaseUrl: config.DATABASE_URL } : {}),
  rateLimit: {
    generalCapacity: Math.round(1000 * m),
    generalRefillPerSecond: (1000 / 60) * m,
    strictCapacity: Math.round(500 * m),
    strictRefillPerSecond: (500 / 60) * m,
  },
  aiGateway: {
    platformEnabled: config.AI_GATEWAY_ENABLED,
    isTestEnv: config.NODE_ENV === "test",
    ...(config.AI_PROVIDER_BASE_URL !== undefined && config.AI_PROVIDER_API_KEY !== undefined
      ? { provider: { baseUrl: config.AI_PROVIDER_BASE_URL, apiKey: config.AI_PROVIDER_API_KEY } }
      : {}),
    allowedModel: config.AI_ALLOWED_MODEL,
    allowedModelVersion: config.AI_ALLOWED_MODEL_VERSION,
    region: config.AI_REGION,
    timeoutMs: config.AI_REQUEST_TIMEOUT_MS,
    dailyTokenBudget: config.AI_DAILY_TOKEN_BUDGET,
    dailyCostBudgetUsdCents: config.AI_DAILY_COST_BUDGET_USD_CENTS,
  },
});

// Fastify is booted once per warm serverless instance, then reused.
let ready: Promise<unknown> | undefined;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  ready ??= app.ready();
  await ready;
  app.server.emit("request", req, res);
}
