import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MENU, RULES } from "../shared/menu.js";
import { priceCart, normalizePhone, validateCheckout, firstOrderEligible, choiceLabel, findItem, PricingError } from "../shared/pricing.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("menu: 17 categories, 65 items, unique ids, every image exists locally", () => {
  const items = MENU.flatMap(c => c.items);
  assert.equal(MENU.length, 17);
  assert.equal(items.length, 65);
  assert.equal(new Set(items.map(i => i.id)).size, items.length);
  assert.equal(new Set(items.map(i => i.entry)).size, items.length);
  for (const item of items) {
    assert.ok(Number.isInteger(item.price) && item.price > 0, item.name);
    assert.ok(fs.existsSync(path.join(ROOT, "public", item.image)), "missing image for " + item.name);
  }
});

test("menu: prices carry over the original runtime price updates", () => {
  const price = id => findItem(id).item.price;
  assert.equal(price("kori-kohi"), 180);
  assert.equal(price("biscoff-affogato"), 210);
  assert.equal(price("naz-signature"), 230);
  assert.equal(price("monte-cristo"), 280);
  assert.equal(price("spanish-latte"), 170);
  assert.equal(price("syrup"), 30);
});

test("options follow the original rules", () => {
  assert.deepEqual(findItem("flat-white").item.options.choices, ["Hot"]);
  assert.deepEqual(findItem("kori-kohi").item.options.choices, ["Iced"]);
  assert.deepEqual(findItem("matcha-latte").item.options.choices, ["Hot", "Iced"]);
  assert.equal(findItem("matchagato").item.options, undefined);
  assert.equal(findItem("chicken-bites").item.options.type, "Flavor");
  assert.equal(findItem("daybreak").item.options.type, "Size");
  assert.equal(choiceLabel(findItem("daybreak").item, "16oz"), "Upsize (+₱30)");
  assert.equal(choiceLabel(findItem("daybreak").item, "12oz"), "Regular");
});

test("subtotal and line merging", () => {
  const q = priceCart([{ id: "long-black", choice: "Hot", qty: 2 }, { id: "long-black", choice: "Hot", qty: 1 }, { id: "matchagato", qty: 1 }]);
  assert.equal(q.items.length, 2);
  assert.equal(q.subtotal, 120 * 3 + 170);
  assert.equal(q.total, q.subtotal);
  assert.equal(q.count, 4);
});

test("DOSE: any 2 for ₱180, upsize +₱30 per drink", () => {
  assert.equal(priceCart([{ id: "daybreak", choice: "12oz", qty: 2 }]).total, 180);
  assert.equal(priceCart([{ id: "daybreak", choice: "12oz", qty: 3 }]).total, 300);
  const mixed = priceCart([{ id: "daybreak", choice: "16oz", qty: 1 }, { id: "purple-cloud", choice: "12oz", qty: 1 }]);
  assert.equal(mixed.subtotal, 150 + 120);
  assert.equal(mixed.doseDiscount, 60);
  assert.equal(mixed.total, 210);
});

test("delivery fee only for Delivery with a valid area; reward discount; never negative", () => {
  const lines = [{ id: "espresso-shot", qty: 1 }];
  assert.equal(priceCart(lines, { orderType: "Delivery", deliveryAreaId: "paete-siniloan" }).total, 80);
  assert.equal(priceCart(lines, { orderType: "Pick up", deliveryAreaId: "paete-siniloan" }).total, 50);
  assert.equal(priceCart(lines, { orderType: "Delivery", deliveryAreaId: "nowhere" }).deliveryFee, 0);
  const r = priceCart(lines, { redeem: true, orderType: "Delivery", deliveryAreaId: "famy-mabitac-kalayaan" });
  assert.equal(r.total, 0);
  assert.equal(r.firstOrderSpend, 0);
});

test("first-order reward needs an eligible account and ₱300 after discounts, excluding delivery", () => {
  const account = { firstOrderEligible: true };
  const under = priceCart([{ id: "naz-signature", choice: "", qty: 1 }], { orderType: "Delivery", deliveryAreaId: "famy-mabitac-kalayaan" });
  assert.equal(under.total, 280);
  assert.equal(firstOrderEligible(under, account), false);   // delivery fee doesn't count
  const over = priceCart([{ id: "naz-signature", qty: 2 }]);
  assert.equal(firstOrderEligible(over, account), true);
  assert.equal(firstOrderEligible(over, { firstOrderEligible: false }), false);
  assert.equal(firstOrderEligible(over, null), false);
  const redeemed = priceCart([{ id: "naz-signature", qty: 2 }], { redeem: true });
  assert.equal(firstOrderEligible(redeemed, account), true);  // 460 − 100 = 360, still ≥ 300
});

test("first-order spend subtracts points redemption", () => {
  const q = priceCart([{ id: "spanish-latte", choice: "Iced", qty: 2 }], { redeem: true });
  assert.equal(q.firstOrderSpend, 340 - 100);
  assert.equal(firstOrderEligible(q, { firstOrderEligible: true }), false);
});

test("rejects invalid carts", () => {
  const code = fn => { try { fn(); } catch (e) { assert.ok(e instanceof PricingError); return e.code; } return "OK"; };
  assert.equal(code(() => priceCart([])), "EMPTY_CART");
  assert.equal(code(() => priceCart([{ id: "free-coffee", qty: 1 }])), "UNKNOWN_ITEM");
  assert.equal(code(() => priceCart([{ id: "long-black", choice: "Hot", qty: 0 }])), "BAD_QUANTITY");
  assert.equal(code(() => priceCart([{ id: "long-black", choice: "Hot", qty: 1.5 }])), "BAD_QUANTITY");
  assert.equal(code(() => priceCart([{ id: "long-black", choice: "Hot", qty: RULES.maxQtyPerLine + 1 }])), "BAD_QUANTITY");
  assert.equal(code(() => priceCart([{ id: "long-black", choice: "Hot", qty: 3 }, { id: "long-black", choice: "Hot", qty: 3 }])), "BAD_QUANTITY");
  assert.equal(code(() => priceCart([{ id: "long-black", choice: "Lukewarm", qty: 1 }])), "BAD_OPTION");
  assert.equal(code(() => priceCart([{ id: "long-black", qty: 1 }])), "BAD_OPTION");
  assert.equal(code(() => priceCart([{ id: "matchagato", choice: "Iced", qty: 1 }])), "BAD_OPTION");
  // A client-sent price is simply ignored.
  assert.equal(priceCart([{ id: "matchagato", qty: 1, price: 1 }]).total, 170);
  // Single-choice items default their only option.
  assert.equal(priceCart([{ id: "flat-white", qty: 1 }]).items[0].choice, "Hot");
});

test("phone normalisation", () => {
  assert.equal(normalizePhone("0917 123 4567"), "9171234567");
  assert.equal(normalizePhone("+63 917-123-4567"), "9171234567");
  assert.equal(normalizePhone("9171234567"), "9171234567");
  assert.equal(normalizePhone("0817 123 4567"), "");
  assert.equal(normalizePhone("12345"), "");
});

test("checkout validation follows the original order of checks", () => {
  const ok = { name: "Ana", phone: "09171234567", payment: "Cash", orderType: "Pick up", time: "ASAP" };
  assert.equal(validateCheckout(ok), null);
  assert.equal(validateCheckout({ ...ok, name: " " }).field, "name");
  assert.equal(validateCheckout({ ...ok, phone: "123" }).field, "phone");
  assert.equal(validateCheckout({ ...ok, payment: "Card" }).field, "payment");
  assert.equal(validateCheckout({ ...ok, orderType: "" }).field, "orderType");
  assert.equal(validateCheckout({ ...ok, orderType: "Delivery" }).field, "deliveryAreaId");
  assert.equal(validateCheckout({ ...ok, orderType: "Delivery", deliveryAreaId: "pakil-pangil" }).field, "address");
  assert.equal(validateCheckout({ ...ok, time: "Later" }).field, "laterTime");
});
