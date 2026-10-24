import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { pathToFileURL } from "node:url";
import { ROOT, loadConfig } from "./config.js";
import { createLogger, errorMessage, maskPhone } from "./log.js";
import { createUpstream } from "./upstream.js";
import { createOrderService, publicAccount, OrderError } from "./orders.js";
import { normalizePhone } from "../shared/pricing.js";

const PUBLIC_DIR = path.join(ROOT, "public");
const SHARED_DIR = path.join(ROOT, "shared");

const PAGES = { "/": "index.html", "/order": "order.html", "/privacy": "privacy.html" };
// Old URLs that may be bookmarked or shared.
const REDIRECTS = {
  "/order.html": "/order",
  "/index.html": "/",
  "/naz-logo.png": "/assets/img/brand/naz-logo.png",
  "/gcash-qr.jpg": "/assets/img/brand/gcash-qr.jpg",
  "/favicon.ico": "/assets/img/brand/favicon-48.png"
};

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json"
};
const COMPRESSIBLE = new Set([".html", ".css", ".js", ".json", ".svg", ".txt", ".webmanifest"]);

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://www.googletagmanager.com https://connect.facebook.net",
  "connect-src 'self' https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com https://www.facebook.com https://connect.facebook.net",
  "img-src 'self' data: https://*.google-analytics.com https://www.googletagmanager.com https://www.facebook.com",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "font-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'"
].join("; ");

function securityHeaders(res) {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function sendJson(req, res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "content-type": TYPES[".json"], "cache-control": "no-store" });
  res.end(req.method === "HEAD" ? undefined : json);
}

async function readJson(req, limit = 32 * 1024) {
  if (!String(req.headers["content-type"] || "").includes("application/json")) {
    throw new OrderError(415, "BAD_REQUEST", "Expected JSON.");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new OrderError(413, "BAD_REQUEST", "Request too large.");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new OrderError(400, "BAD_REQUEST", "Invalid JSON."); }
}

// Fixed-window limiter per client IP and bucket. In-memory: enough for a single instance.
function createRateLimiter() {
  const hits = new Map();
  setInterval(() => hits.clear(), 60_000).unref();
  return (key, max) => {
    const n = (hits.get(key) || 0) + 1;
    hits.set(key, n);
    return n <= max;
  };
}

function resolveStatic(urlPath) {
  let base = PUBLIC_DIR, rel = urlPath;
  if (urlPath.startsWith("/shared/")) { base = SHARED_DIR; rel = urlPath.slice("/shared".length); }
  if (PAGES[urlPath]) rel = "/" + PAGES[urlPath];
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base + path.sep)) return null;
  return file;
}

function serveStatic(req, res, urlPath, status = 200) {
  const file = resolveStatic(urlPath);
  let stat;
  try { stat = file && fs.statSync(file); } catch { stat = null; }
  if (!stat || !stat.isFile()) return false;

  const ext = path.extname(file).toLowerCase();
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const longCache = [".webp", ".png", ".jpg", ".woff2"].includes(ext);
  res.setHeader("content-type", TYPES[ext] || "application/octet-stream");
  res.setHeader("cache-control", longCache ? "public, max-age=604800" : "no-cache");
  res.setHeader("etag", etag);
  if (req.headers["if-none-match"] === etag) { res.writeHead(304); res.end(); return true; }

  const gzip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(String(req.headers["accept-encoding"] || ""));
  if (gzip) { res.setHeader("content-encoding", "gzip"); res.setHeader("vary", "accept-encoding"); }
  else res.setHeader("content-length", stat.size);
  res.writeHead(status);
  if (req.method === "HEAD") { res.end(); return true; }
  const stream = fs.createReadStream(file);
  (gzip ? stream.pipe(zlib.createGzip()) : stream).pipe(res);
  return true;
}

export function createApp(overrides = {}) {
  const config = loadConfig(overrides);
  const log = overrides.logger || createLogger(config.logLevel);
  const upstream = overrides.upstream || createUpstream(config, log);
  const orders = createOrderService({ upstream, log });
  const allow = createRateLimiter();

  const clientIp = req => (config.trustProxy && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress || "?";

  async function api(req, res, urlPath) {
    const ip = clientIp(req);

    if (urlPath === "/api/health" && req.method === "GET") {
      return sendJson(req, res, 200, { ok: true, mode: config.mode });
    }
    if (urlPath === "/api/version" && req.method === "GET") {
      return sendJson(req, res, 200, { version: config.buildVersion });
    }
    if (urlPath === "/api/availability" && req.method === "GET") {
      return sendJson(req, res, 200, { ok: true, availability: await upstream.getAvailability() });
    }

    if (urlPath === "/api/rewards/lookup" && req.method === "POST") {
      if (!allow("rewards:" + ip, 20)) return sendJson(req, res, 429, { ok: false, code: "RATE_LIMITED", error: "Too many requests. Please wait a minute." });
      const body = await readJson(req);
      const phone = normalizePhone(body.phone);
      if (!phone) return sendJson(req, res, 400, { ok: false, code: "VALIDATION", field: "phone", error: "Enter a valid Philippine mobile number, such as 0917 123 4567." });
      try {
        return sendJson(req, res, 200, { ok: true, account: publicAccount(await upstream.getLoyaltyAccount(phone)) });
      } catch (error) {
        log.warn("rewards lookup failed", { phone: maskPhone(phone), error: errorMessage(error) });
        return sendJson(req, res, 502, { ok: false, code: "UPSTREAM", error: "Rewards are temporarily unavailable. Your order can still be sent." });
      }
    }

    if (urlPath === "/api/rewards/create" && req.method === "POST") {
      if (!allow("rewards:" + ip, 20)) return sendJson(req, res, 429, { ok: false, code: "RATE_LIMITED", error: "Too many requests. Please wait a minute." });
      const body = await readJson(req);
      const phone = normalizePhone(body.phone), name = String(body.name || "").trim().slice(0, 80);
      if (!name || !phone) return sendJson(req, res, 400, { ok: false, code: "VALIDATION", error: "Enter your name and Mobile / Viber first." });
      try {
        const account = await upstream.createLoyaltyAccount({ name, phone, birthday: String(body.birthday || "").trim().slice(0, 10), promos: body.promos === true });
        return sendJson(req, res, 200, { ok: true, account: publicAccount(account) });
      } catch (error) {
        log.warn("rewards create failed", { phone: maskPhone(phone), error: errorMessage(error) });
        return sendJson(req, res, 502, { ok: false, code: "UPSTREAM", error: errorMessage(error) });
      }
    }

    if (urlPath === "/api/orders" && req.method === "POST") {
      if (!allow("orders:" + ip, 10)) return sendJson(req, res, 429, { ok: false, code: "RATE_LIMITED", error: "Too many attempts. Please wait a minute and try again." });
      const body = await readJson(req);
      try {
        return sendJson(req, res, 200, { ok: true, order: await orders.submit(body) });
      } catch (error) {
        if (error instanceof OrderError) return sendJson(req, res, error.status, { ok: false, code: error.code, error: error.message, ...error.extra });
        throw error;
      }
    }

    return sendJson(req, res, 404, { ok: false, code: "NOT_FOUND", error: "Not found." });
  }

  const server = http.createServer(async (req, res) => {
    securityHeaders(res);
    let urlPath;
    try { urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname); }
    catch { res.writeHead(400); return res.end("Bad request"); }
    if (urlPath.length > 1 && urlPath.endsWith("/")) urlPath = urlPath.slice(0, -1);

    try {
      if (urlPath.startsWith("/api/")) return await api(req, res, urlPath);
      if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405, { allow: "GET, HEAD" }); return res.end(); }
      if (REDIRECTS[urlPath]) {
        const search = new URL(req.url, "http://x").search;
        res.writeHead(301, { location: REDIRECTS[urlPath] + search });
        return res.end();
      }
      if (serveStatic(req, res, urlPath)) return;
      if (!serveStatic(req, res, "/404.html", 404)) { res.writeHead(404); res.end("Not found"); }
    } catch (error) {
      if (error instanceof OrderError) return sendJson(req, res, error.status, { ok: false, code: error.code, error: error.message });
      log.error("unhandled request error", { path: urlPath, error: errorMessage(error) });
      if (!res.headersSent) sendJson(req, res, 500, { ok: false, code: "SERVER_ERROR", error: "Something went wrong on our side. Please try again." });
      else res.destroy();
    }
  });

  return { server, config, log };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { server, config, log } = createApp();
  server.listen(config.port, config.host, () => {
    log.info("NAZ Coffee web listening", { url: `http://localhost:${config.port}`, mode: config.mode });
    if (config.mode !== "live") log.warn("dry-run mode: orders are validated and logged but NOT sent to the order board or Google Form. Set NAZ_MODE=live to go live.");
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
