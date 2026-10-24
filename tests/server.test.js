import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/server.js";

const silent = { debug() {}, info() {}, warn() {}, error() {} };
let server, base;

before(async () => {
  ({ server } = createApp({ mode: "dry-run", upstreamReads: "off", logger: silent, port: 0 }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));

const post = (path, body) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("pages and assets are served", async () => {
  for (const [path, type] of [["/", "text/html"], ["/order", "text/html"], ["/privacy", "text/html"],
    ["/shared/menu.js", "text/javascript"], ["/shared/pricing.js", "text/javascript"], ["/assets/js/order.js", "text/javascript"],
    ["/assets/css/order.css", "text/css"], ["/assets/img/brand/naz-logo.png", "image/png"], ["/assets/img/menu/spanish-latte.webp", "image/webp"],
    ["/assets/fonts/fraunces-latin.woff2", "font/woff2"]]) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
    assert.ok(res.headers.get("content-type").startsWith(type), path);
    await res.arrayBuffer();
  }
});

test("every local asset referenced by the HTML pages exists", async () => {
  for (const page of ["/", "/order", "/privacy", "/404.html"]) {
    const html = await (await fetch(base + page)).text();
    const refs = [...html.matchAll(/(?:src|href)="(\/[^"#?]*)/g)].map(m => m[1]).filter(r => r.startsWith("/assets/"));
    for (const ref of refs) {
      const res = await fetch(base + ref, { method: "HEAD" });
      assert.equal(res.status, 200, `${page} → ${ref}`);
    }
  }
});

test("legacy URLs redirect", async () => {
  for (const [from, to] of [["/order.html", "/order"], ["/naz-logo.png", "/assets/img/brand/naz-logo.png"], ["/gcash-qr.jpg", "/assets/img/brand/gcash-qr.jpg"]]) {
    const res = await fetch(base + from, { redirect: "manual" });
    assert.equal(res.status, 301);
    assert.equal(res.headers.get("location"), to);
  }
});

test("security headers, 404s and path traversal", async () => {
  const res = await fetch(base + "/");
  assert.match(res.headers.get("content-security-policy"), /default-src 'self'/);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await fetch(base + "/nope")).status, 404);
  assert.equal((await fetch(base + "/%2e%2e/package.json")).status, 404);
  assert.equal((await fetch(base + "/shared/../server/config.js")).status, 404);
  assert.equal((await fetch(base + "/api/nope")).status, 404);
});

test("order API: dry-run accepts a valid order and reports it was not sent", async () => {
  const res = await post("/api/orders", {
    clientOrderId: "SITE-HTTPTEST-1", items: [{ id: "cafe-latte", choice: "Hot", qty: 2 }], expectedTotal: 260,
    customer: { name: "Test", phone: "09171234567" }, payment: "GCash", orderType: "Dine in", time: "Later", laterTime: "3 PM"
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.order.dryRun, true);
  assert.equal(data.order.quote.total, 260);
  assert.equal(data.order.status, "received");
});

test("order API: errors are structured JSON", async () => {
  let res = await post("/api/orders", { clientOrderId: "SITE-HTTPTEST-2", items: [], customer: { name: "T", phone: "09171234567" }, payment: "Cash", orderType: "Pick up", time: "ASAP" });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "EMPTY_CART");
  res = await fetch(base + "/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: "{bad" });
  assert.equal(res.status, 400);
  res = await fetch(base + "/api/orders", { method: "POST", body: "x" });
  assert.equal(res.status, 415);
});

test("rewards API: lookup validates, masks names; create works in dry-run", async () => {
  let res = await post("/api/rewards/lookup", { phone: "123" });
  assert.equal(res.status, 400);
  res = await post("/api/rewards/create", { name: "Maria Clara Santos", phone: "09181234567" });
  assert.equal((await res.json()).account.name, "Maria");
  res = await post("/api/rewards/lookup", { phone: "+63 918 123 4567" });
  const { account } = await res.json();
  assert.deepEqual(Object.keys(account).sort(), ["firstOrderEligible", "name", "points", "rewardAvailable"]);
  assert.equal(account.name, "Maria");
});
