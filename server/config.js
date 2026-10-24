import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;

export function loadConfig(overrides = {}) {
  const mode = (overrides.mode ?? env.NAZ_MODE ?? "dry-run").toLowerCase();
  if (!["dry-run", "live"].includes(mode)) throw new Error(`NAZ_MODE must be "dry-run" or "live", got "${mode}".`);
  return {
    port: Number(overrides.port ?? env.PORT ?? 3000),
    host: overrides.host ?? env.HOST ?? "0.0.0.0",
    // dry-run: orders, rewards writes and Google Form posts are logged, never sent.
    // live: they go to the existing order backend and Google Form.
    mode,
    // The existing Naz order backend (RPC endpoint taking { action, args }).
    upstreamUrl: overrides.upstreamUrl ?? env.NAZ_UPSTREAM_URL ?? "https://naz-coffee-order.ptsutare.chatgpt.site/api/naz",
    // In dry-run, menu availability is still read from the live backend unless this is "off".
    upstreamReads: (overrides.upstreamReads ?? env.NAZ_UPSTREAM_READS ?? "on") !== "off",
    googleFormUrl: overrides.googleFormUrl ?? env.NAZ_GOOGLE_FORM_URL ??
      "https://docs.google.com/forms/d/e/1FAIpQLScWhndqPpP7k7Kt-89JiTpwBoMVBGzC0DfosVmDAwBLP2ymLg/formResponse",
    googleFormSubmit: (overrides.googleFormSubmit ?? env.NAZ_GOOGLE_FORM_SUBMIT ?? "on") !== "off",
    upstreamTimeoutMs: Number(overrides.upstreamTimeoutMs ?? env.NAZ_UPSTREAM_TIMEOUT_MS ?? 15000),
    // Behind a reverse proxy, set to "on" so rate limits use X-Forwarded-For.
    trustProxy: (overrides.trustProxy ?? env.TRUST_PROXY ?? "off") === "on",
    buildVersion: overrides.buildVersion ?? env.BUILD_VERSION ?? new Date().toISOString(),
    logLevel: overrides.logLevel ?? env.LOG_LEVEL ?? "info"
  };
}
