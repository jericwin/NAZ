// Order submission pipeline.
//
// The browser sends item ids, options and quantities only. Everything that costs money is
// recomputed here from shared/menu.js, rewards are checked against the rewards backend, and the
// order is forwarded to the existing order board + Google Form in the exact shapes they have
// always received, so staff tooling keeps working unchanged.
import { RULES } from "../shared/menu.js";
import { priceCart, validateCheckout, normalizePhone, deliveryAreaById, firstOrderEligible, PricingError } from "../shared/pricing.js";
import { errorMessage, maskPhone } from "./log.js";

// Google Form field ids, unchanged from the original page.
const FORM = {
  name: "entry.857605783",
  payment: "entry.2069867214",
  orderType: "entry.1841143459",
  address: "entry.1411137206",
  time: "entry.1538311758",
  laterTime: "entry.379243495",
  notes: "entry.1848081787"
};

const LIMITS = { name: 80, address: 300, notes: 500, laterTime: 40, birthday: 10 };
const IDEMPOTENCY_TTL_MS = 30 * 60_000;
const DUPLICATE_WINDOW_MS = 10 * 60_000;   // same window the original client-side check used
const CLIENT_ORDER_ID = /^SITE-[A-Z0-9-]{6,40}$/;

export class OrderError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const clip = (value, max) => String(value ?? "").trim().slice(0, max);

// What the browser is allowed to learn about a rewards account looked up by phone number.
// First name only: the number alone should not reveal someone's full name.
export function publicAccount(account) {
  if (!account) return null;
  return {
    name: String(account.name || "").trim().split(/\s+/)[0] || "Member",
    points: Number(account.points) || 0,
    rewardAvailable: !!account.rewardAvailable,
    firstOrderEligible: !!account.firstOrderEligible
  };
}

export function createOrderService({ upstream, log, now = () => Date.now() }) {
  const byClientId = new Map();      // clientOrderId -> { at, promise }
  const recent = new Map();          // fingerprint -> { at, reference }

  function sweep() {
    const t = now();
    for (const [key, value] of byClientId) if (t - value.at > IDEMPOTENCY_TTL_MS) byClientId.delete(key);
    for (const [key, value] of recent) if (t - value.at > DUPLICATE_WINDOW_MS) recent.delete(key);
  }

  async function ensureAccount(name, phone, extras) {
    const existing = await upstream.getLoyaltyAccount(phone);
    if (existing) return existing;
    return upstream.createLoyaltyAccount({ name, phone, birthday: extras.birthday, promos: extras.promos });
  }

  function normalize(body) {
    if (!body || typeof body !== "object") throw new OrderError(400, "BAD_REQUEST", "Invalid order.");
    const form = {
      name: clip(body.customer?.name, LIMITS.name),
      phone: normalizePhone(body.customer?.phone),
      payment: String(body.payment || ""),
      orderType: String(body.orderType || ""),
      deliveryAreaId: String(body.deliveryAreaId || ""),
      address: clip(body.address, LIMITS.address),
      time: String(body.time || ""),
      laterTime: clip(body.laterTime, LIMITS.laterTime),
      notes: clip(body.notes, LIMITS.notes)
    };
    const invalid = validateCheckout(form);
    if (invalid) throw new OrderError(400, "VALIDATION", invalid.message, { field: invalid.field });
    if (form.orderType !== "Delivery") { form.deliveryAreaId = ""; form.address = ""; }
    if (form.time !== "Later") form.laterTime = "";
    const clientOrderId = String(body.clientOrderId || "");
    if (!CLIENT_ORDER_ID.test(clientOrderId)) throw new OrderError(400, "BAD_REQUEST", "Missing order reference. Please reload the page.");
    return {
      ...form, clientOrderId,
      items: Array.isArray(body.items) ? body.items.map(line => ({ id: line?.id, choice: line?.choice, qty: line?.qty })) : [],
      redeem: body.redeem === true,
      declineFirstOrderReward: body.declineFirstOrderReward === true,
      expectedTotal: typeof body.expectedTotal === "number" ? body.expectedTotal : null,
      confirmDuplicate: body.confirmDuplicate === true,
      birthday: clip(body.rewards?.birthday, LIMITS.birthday),
      promos: body.rewards?.promos === true
    };
  }

  function quote(order) {
    try {
      return priceCart(order.items, { orderType: order.orderType, deliveryAreaId: order.deliveryAreaId, redeem: order.redeem });
    } catch (error) {
      if (error instanceof PricingError) throw new OrderError(400, error.code, error.message, error.detail ? { detail: error.detail } : {});
      throw error;
    }
  }

  async function processOrder(order) {
    const t = quote(order);

    const availability = await upstream.getAvailability();
    const unavailable = t.items.filter(line => availability[line.name] === false).map(line => line.name);
    if (unavailable.length) {
      throw new OrderError(409, "ITEM_UNAVAILABLE", `Sorry, ${unavailable.join(", ")} ${unavailable.length === 1 ? "is" : "are"} not available right now. Please remove ${unavailable.length === 1 ? "it" : "them"} to continue.`, { items: [...new Set(unavailable)] });
    }

    // Rewards are automatic for every order, as before. A rewards outage only blocks the order
    // when it could cost the customer their first-order drink, matching the original behaviour.
    let account = null, rewardsPending = false;
    try {
      account = await ensureAccount(order.name, order.phone, order);
    } catch (error) {
      log.warn("rewards account unavailable", { ref: order.clientOrderId, phone: maskPhone(order.phone), error: errorMessage(error) });
      if (t.firstOrderSpend >= RULES.firstOrderMinimum && !order.declineFirstOrderReward) {
        throw new OrderError(503, "REWARDS_UNAVAILABLE", "We could not check your free Spanish Latte eligibility. Please try again so your first-order reward is not missed.");
      }
      rewardsPending = true;
    }
    if (order.redeem && !(account && account.rewardAvailable)) {
      throw new OrderError(409, "REWARD_NOT_AVAILABLE", "Your account does not have a ₱100 reward available yet. Untick “Use 100 points” to continue.", { account: publicAccount(account) });
    }
    const firstOrderReward = !order.declineFirstOrderReward && firstOrderEligible(t, account);

    if (order.expectedTotal !== null && order.expectedTotal !== t.total) {
      throw new OrderError(409, "PRICE_CHANGED", `Your total was updated to ₱${t.total.toLocaleString("en-PH")}. Please review your order and send it again.`, { quote: publicQuote(t) });
    }

    const fingerprint = JSON.stringify([order.phone, order.payment, order.orderType, t.total, order.time, order.laterTime, t.items.map(line => [line.id, line.choice, line.qty])]);
    const previous = recent.get(fingerprint);
    if (previous && !order.confirmDuplicate) {
      throw new OrderError(409, "DUPLICATE_ORDER", `This same order was already sent a few minutes ago (reference ${previous.reference}). Send it again only if you want a second, separate order.`, { reference: previous.reference });
    }

    const area = deliveryAreaById(order.deliveryAreaId);
    const deliveryTime = order.time === "Later" ? order.laterTime : order.time;
    const freeLine = firstOrderReward ? [{ qty: 1, name: "FREE Spanish Latte · First Order Reward", choice: "", lineTotal: 0 }] : [];
    const boardItems = t.items.map(line => ({ qty: line.qty, name: line.name, choice: line.choiceLabel, lineTotal: line.lineTotal })).concat(freeLine);
    const redeemNote = order.redeem ? "Redeem requested: 100 points for ₱100 off" : "";
    const firstOrderNote = firstOrderReward ? "FIRST ORDER REWARD: FREE Spanish Latte — ₱0.00" : "";

    // 1. Order board notification (same payload as the original sendWebOrderNotification call).
    const notification = {
      clientOrderId: order.clientOrderId,
      name: order.name,
      phone: order.phone,
      payment: order.payment,
      area: area ? area.label : "",
      deliveryTime,
      subtotal: t.subtotal,
      redeem: order.redeem,
      firstOrderReward,
      deliveryFee: t.deliveryFee,
      total: t.total,
      orderType: order.orderType,
      address: area ? area.label + " | " + order.address : "",
      notes: [order.notes, "NAZ REWARDS: PENDING UPDATE", redeemNote, firstOrderNote].filter(Boolean).join(" | "),
      items: boardItems
    };
    let boardOk = true;
    try {
      await upstream.sendWebOrderNotification(notification);
    } catch (error) {
      boardOk = false;
      log.error("order board notification failed", { ref: order.clientOrderId, error: errorMessage(error) });
      // The backend checks free-drink eligibility here; without it the reward cannot be honoured.
      if (firstOrderReward) {
        throw new OrderError(502, "ORDER_NOT_SENT", "The free-drink eligibility could not be confirmed, so your order was not sent. Please try again in a moment.");
      }
    }

    // 2. Rewards points.
    let rewardsRecorded = false;
    if (account) {
      try {
        await upstream.recordLoyaltyOrder({
          orderId: order.clientOrderId, phone: order.phone, total: t.total, redeem: order.redeem, firstOrderReward,
          items: boardItems, deliveryFee: t.deliveryFee,
          summary: t.items.map(line => line.qty + "× " + line.name + (line.choiceLabel ? " · " + line.choiceLabel : "")).join("; ")
        });
        rewardsRecorded = true;
      } catch (error) {
        rewardsPending = true;
        log.warn("rewards update pending", { ref: order.clientOrderId, error: errorMessage(error) });
      }
    }

    // 3. Google Form backup (same fields the original page posted).
    const fields = {
      [FORM.name]: order.name,
      [FORM.payment]: order.payment,
      [FORM.orderType]: order.orderType,
      [FORM.time]: order.time
    };
    if (area) fields[FORM.address] = area.label + " | " + order.address;
    if (order.time === "Later") fields[FORM.laterTime] = order.laterTime;
    for (const line of t.items) {
      if (/^entry\.\d+$/.test(line.entry)) fields[line.entry] = String((Number(fields[line.entry]) || 0) + line.qty);
    }
    const selections = t.items.filter(line => line.choice || !/^entry\.\d+$/.test(line.entry))
      .map(line => line.qty + "× " + line.name + (line.choiceLabel ? " — " + line.choiceLabel : "")).join("; ");
    const rewardsNote = rewardsRecorded ? "Naz Rewards: " + account.accountId + " · points recorded" : "NAZ REWARDS: PENDING MANUAL UPDATE";
    fields[FORM.notes] = [order.notes, "Mobile/Viber: " + order.phone, selections ? "Selections: " + selections : "", rewardsNote, redeemNote, firstOrderNote].filter(Boolean).join(" | ");

    let formOk = true;
    try {
      await upstream.submitGoogleForm(fields);
    } catch (error) {
      formOk = false;
      log.error("google form backup failed", { ref: order.clientOrderId, error: errorMessage(error) });
    }

    if (!boardOk && !formOk) {
      throw new OrderError(502, "ORDER_NOT_SENT", "Your order could not be sent. Nothing was submitted, so please try again in a moment.");
    }

    recent.set(fingerprint, { at: now(), reference: order.clientOrderId });
    log.info("order received", {
      ref: order.clientOrderId, mode: upstream.live ? "live" : "dry-run", lines: t.items.length, total: t.total,
      board: boardOk, form: formOk, rewards: rewardsRecorded ? "recorded" : rewardsPending ? "pending" : "none"
    });
    return {
      reference: order.clientOrderId,
      // "received": on the order board. "received_backup": only the Google Form copy got through;
      // staff still see it, but the customer should not expect an instant board update.
      status: boardOk ? "received" : "received_backup",
      dryRun: !upstream.live,
      quote: publicQuote(t),
      firstOrderReward,
      rewards: rewardsRecorded ? "recorded" : rewardsPending ? "pending" : "none",
      account: publicAccount(account),
      payment: order.payment,
      orderType: order.orderType
    };
  }

  async function submit(body) {
    sweep();
    const order = normalize(body);
    const existing = byClientId.get(order.clientOrderId);
    if (existing) return existing.promise;   // retry or double-click: same result, no second order
    const promise = processOrder(order);
    byClientId.set(order.clientOrderId, { at: now(), promise });
    // A failed attempt may be retried with the same reference.
    promise.catch(() => byClientId.delete(order.clientOrderId));
    return promise;
  }

  return { submit };
}

export function publicQuote(t) {
  return {
    items: t.items.map(line => ({ id: line.id, name: line.name, choice: line.choice, choiceLabel: line.choiceLabel, qty: line.qty, unitPrice: line.unitPrice, lineTotal: line.lineTotal })),
    count: t.count, subtotal: t.subtotal, doseDiscount: t.doseDiscount, deliveryFee: t.deliveryFee,
    rewardDiscount: t.rewardDiscount, total: t.total
  };
}
