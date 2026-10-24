import test from "node:test";
import assert from "node:assert/strict";
import { createOrderService, OrderError } from "../server/orders.js";

const silent = { debug() {}, info() {}, warn() {}, error() {} };

// Records every call so tests can assert exactly what the existing backend would receive.
function fakeUpstream({ account = null, availability = {}, fail = {} } = {}) {
  const calls = [];
  const maybeFail = name => { if (fail[name]) throw new Error(name + " down"); };
  return {
    live: true, calls,
    async getAvailability() { return availability; },
    async getLoyaltyAccount(phone) { calls.push(["getLoyaltyAccount", phone]); maybeFail("getLoyaltyAccount"); return account; },
    async createLoyaltyAccount(data) { calls.push(["createLoyaltyAccount", data]); maybeFail("createLoyaltyAccount"); return { accountId: "NEW-1", name: data.name, points: 0, rewardAvailable: false, firstOrderEligible: true }; },
    async sendWebOrderNotification(data) { calls.push(["sendWebOrderNotification", data]); maybeFail("sendWebOrderNotification"); return true; },
    async recordLoyaltyOrder(data) { calls.push(["recordLoyaltyOrder", data]); maybeFail("recordLoyaltyOrder"); return true; },
    async submitGoogleForm(fields) { calls.push(["submitGoogleForm", fields]); maybeFail("submitGoogleForm"); return { ok: true }; }
  };
}

let seq = 0;
const order = (overrides = {}) => ({
  clientOrderId: "SITE-TEST" + (++seq).toString().padStart(4, "0"),
  items: [{ id: "long-black", choice: "Iced", qty: 1 }],
  customer: { name: "Ana Cruz", phone: "0917 123 4567" },
  payment: "Cash", orderType: "Pick up", time: "ASAP",
  ...overrides
});

const existingMember = { accountId: "ACC-9", name: "Ana Cruz", points: 140, rewardAvailable: true, firstOrderEligible: false };

async function rejects(promise, code) {
  await assert.rejects(promise, e => { assert.ok(e instanceof OrderError, String(e)); assert.equal(e.code, code); return true; });
}

test("prices on the server and forwards the original payload shapes", async () => {
  const up = fakeUpstream({ account: existingMember });
  const svc = createOrderService({ upstream: up, log: silent });
  const result = await svc.submit(order({
    items: [{ id: "daybreak", choice: "16oz", qty: 1, price: 1 }, { id: "purple-cloud", choice: "12oz", qty: 1 }, { id: "basque-matcha-nope", qty: 0 }].slice(0, 2),
    orderType: "Delivery", deliveryAreaId: "pakil-pangil", address: "Blue gate near the church", notes: "Less sugar"
  }));
  assert.equal(result.status, "received");
  assert.equal(result.quote.total, 150 + 120 - 60 + 20);
  assert.equal(result.rewards, "recorded");

  const [, note] = up.calls.find(c => c[0] === "sendWebOrderNotification");
  assert.equal(note.total, 230);
  assert.equal(note.subtotal, 270);
  assert.equal(note.deliveryFee, 20);
  assert.equal(note.phone, "9171234567");
  assert.equal(note.area, "Pakil / Pangil — ₱20");
  assert.equal(note.address, "Pakil / Pangil — ₱20 | Blue gate near the church");
  assert.deepEqual(note.items[0], { qty: 1, name: "Daybreak", choice: "Upsize (+₱30)", lineTotal: 150 });
  assert.match(note.notes, /^Less sugar \| NAZ REWARDS: PENDING UPDATE$/);

  const [, form] = up.calls.find(c => c[0] === "submitGoogleForm");
  assert.equal(form["entry.857605783"], "Ana Cruz");
  assert.equal(form["entry.1332171556"], "1");             // Daybreak qty
  assert.equal(form["entry.1411137206"], "Pakil / Pangil — ₱20 | Blue gate near the church");
  assert.match(form["entry.1848081787"], /Mobile\/Viber: 9171234567/);
  assert.match(form["entry.1848081787"], /Selections: 1× Daybreak — Upsize \(\+₱30\); 1× Purple Cloud — Regular/);
  assert.match(form["entry.1848081787"], /Naz Rewards: ACC-9 · points recorded/);
  assert.equal(form["entry.379243495"], undefined);          // no later time for ASAP
});

test("same clientOrderId is processed once (double click / retry)", async () => {
  const up = fakeUpstream({ account: existingMember });
  const svc = createOrderService({ upstream: up, log: silent });
  const body = order();
  const [a, b] = await Promise.all([svc.submit(body), svc.submit(body)]);
  const c = await svc.submit(body);
  assert.equal(a.reference, b.reference);
  assert.equal(a.reference, c.reference);
  assert.equal(up.calls.filter(x => x[0] === "sendWebOrderNotification").length, 1);
});

test("identical order with a new reference is flagged as a duplicate unless confirmed", async () => {
  const up = fakeUpstream({ account: existingMember });
  const svc = createOrderService({ upstream: up, log: silent });
  const first = await svc.submit(order());
  await rejects(svc.submit(order()), "DUPLICATE_ORDER");
  const again = await svc.submit(order({ confirmDuplicate: true }));
  assert.notEqual(again.reference, first.reference);
});

test("rejects tampered or invalid input", async () => {
  const svc = createOrderService({ upstream: fakeUpstream({ account: existingMember }), log: silent });
  await rejects(svc.submit(order({ items: [{ id: "long-black", choice: "Iced", qty: 99 }] })), "BAD_QUANTITY");
  await rejects(svc.submit(order({ items: [{ id: "gold-latte", qty: 1 }] })), "UNKNOWN_ITEM");
  await rejects(svc.submit(order({ customer: { name: "Ana", phone: "1234" } })), "VALIDATION");
  await rejects(svc.submit(order({ orderType: "Delivery" })), "VALIDATION");
  await rejects(svc.submit(order({ clientOrderId: "x" })), "BAD_REQUEST");
  await rejects(svc.submit(order({ expectedTotal: 1 })), "PRICE_CHANGED");
});

test("unavailable items are refused", async () => {
  const svc = createOrderService({ upstream: fakeUpstream({ account: existingMember, availability: { "Long Black": false } }), log: silent });
  await rejects(svc.submit(order()), "ITEM_UNAVAILABLE");
});

test("redeem requires a reward on the account; discount applied server-side", async () => {
  const noReward = createOrderService({ upstream: fakeUpstream({ account: { ...existingMember, rewardAvailable: false } }), log: silent });
  await rejects(noReward.submit(order({ redeem: true })), "REWARD_NOT_AVAILABLE");
  const up = fakeUpstream({ account: existingMember });
  const ok = await createOrderService({ upstream: up, log: silent }).submit(order({ items: [{ id: "naz-signature", qty: 1 }], redeem: true, expectedTotal: 130 }));
  assert.equal(ok.quote.total, 130);
  assert.equal(up.calls.find(c => c[0] === "recordLoyaltyOrder")[1].redeem, true);
});

test("first-order Spanish Latte: auto-applied for new members at ₱300+, can be declined", async () => {
  const up = fakeUpstream({ account: null });
  const res = await createOrderService({ upstream: up, log: silent }).submit(order({ items: [{ id: "naz-signature", qty: 2 }] }));
  assert.equal(res.firstOrderReward, true);
  assert.ok(up.calls.some(c => c[0] === "createLoyaltyAccount"));
  const note = up.calls.find(c => c[0] === "sendWebOrderNotification")[1];
  assert.equal(note.firstOrderReward, true);
  assert.deepEqual(note.items.at(-1), { qty: 1, name: "FREE Spanish Latte · First Order Reward", choice: "", lineTotal: 0 });

  const declined = await createOrderService({ upstream: fakeUpstream({ account: null }), log: silent })
    .submit(order({ items: [{ id: "naz-signature", qty: 2 }], declineFirstOrderReward: true }));
  assert.equal(declined.firstOrderReward, false);

  const small = await createOrderService({ upstream: fakeUpstream({ account: null }), log: silent }).submit(order());
  assert.equal(small.firstOrderReward, false);
});

test("rewards outage: blocks only when the free drink could be missed", async () => {
  const down = { getLoyaltyAccount: true, createLoyaltyAccount: true };
  await rejects(createOrderService({ upstream: fakeUpstream({ fail: down }), log: silent }).submit(order({ items: [{ id: "naz-signature", qty: 2 }] })), "REWARDS_UNAVAILABLE");
  const res = await createOrderService({ upstream: fakeUpstream({ fail: down }), log: silent }).submit(order());
  assert.equal(res.rewards, "pending");
  assert.equal(res.status, "received");
});

test("order board down: Google Form backup still records it; both down: clear failure and retry allowed", async () => {
  const up = fakeUpstream({ account: existingMember, fail: { sendWebOrderNotification: true } });
  const res = await createOrderService({ upstream: up, log: silent }).submit(order());
  assert.equal(res.status, "received_backup");

  const both = fakeUpstream({ account: existingMember, fail: { sendWebOrderNotification: true, submitGoogleForm: true } });
  const svc = createOrderService({ upstream: both, log: silent });
  const body = order();
  await rejects(svc.submit(body), "ORDER_NOT_SENT");
  // The failed attempt is not cached, so retrying the same reference runs again.
  both.calls.length = 0;
  await rejects(svc.submit(body), "ORDER_NOT_SENT");
  assert.ok(both.calls.some(c => c[0] === "sendWebOrderNotification"));
});
