// Vercel serverless entrypoint for the CPF API.
//
// Wraps the existing Fastify app (buildApp) as a single serverless function.
// Every request path is routed here via the rewrite in vercel.json, so Fastify
// keeps full ownership of routing (/v1, /v2, /health, ...).
//
// Imports resolve against the compiled output in ../dist (produced by the
// project buildCommand: `npm --prefix ../.. run build`). This file lives
// outside src/ so the API's own tsc build never compiles it — only Vercel's
// @vercel/node runtime does.
import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "../dist/app.js";
import { loadConfig } from "../dist/config.js";

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
