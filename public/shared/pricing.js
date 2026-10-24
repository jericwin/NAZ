// Pure pricing and validation rules. Used by the browser for instant totals and by the server
// as the authority: the server re-runs priceCart() on every order and ignores client prices.
import { MENU, RULES, DELIVERY_AREAS, ORDER_TYPES, PAYMENT_METHODS, ORDER_TIMES } from "./menu.js";

export class PricingError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.name = "PricingError";
    this.code = code;
    this.detail = detail;
  }
}

const ITEM_INDEX = new Map();
for (const category of MENU) {
  for (const item of category.items) ITEM_INDEX.set(item.id, { item, category });
}

export const findItem = id => ITEM_INDEX.get(String(id || "")) || null;

export const money = n => "₱" + Number(n || 0).toLocaleString("en-PH");

// Accepts 09XXXXXXXXX, 9XXXXXXXXX, +639XXXXXXXXX or 639XXXXXXXXX with any spacing.
// Returns the 10-digit form starting with 9 (as the rewards backend expects), or "".
export function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("63") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return /^9\d{9}$/.test(digits) ? digits : "";
}

export const lineKey = (id, choice) => (choice ? id + "|" + choice : id);

export function defaultChoice(item) {
  return item.options ? item.options.choices[0] : "";
}

// Label shown to customers and sent to the order board. Matches the original orderChoice().
export function choiceLabel(item, choice) {
  if (!item.options || !choice) return "";
  if (item.options.type === "Size") return choice === RULES.doseUpsizeChoice ? "Upsize (+₱" + RULES.doseUpsizePrice + ")" : "Regular";
  return choice;
}

export function unitPrice(item, category, choice) {
  const upsize = category.id === RULES.doseCategory && choice === RULES.doseUpsizeChoice;
  return item.price + (upsize ? RULES.doseUpsizePrice : 0);
}

export function deliveryAreaById(id) {
  return DELIVERY_AREAS.find(area => area.id === id) || null;
}

// lines: [{ id, choice, qty }]. Options:
//   orderType / deliveryAreaId -> delivery fee (only for Delivery)
//   redeem -> apply the 100-point reward (caller must verify the account first)
// Throws PricingError on anything a well-behaved client could not have produced.
export function priceCart(lines, { orderType = "", deliveryAreaId = "", redeem = false } = {}) {
  if (!Array.isArray(lines) || lines.length === 0) throw new PricingError("EMPTY_CART", "Your cart is empty.");
  if (lines.length > RULES.maxLines) throw new PricingError("TOO_MANY_LINES", "Too many different items in one order.");

  const merged = new Map();
  for (const raw of lines) {
    const found = findItem(raw && raw.id);
    if (!found) throw new PricingError("UNKNOWN_ITEM", "One of the items is no longer on the menu.", { id: raw && raw.id });
    const { item, category } = found;
    const qty = Number(raw.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > RULES.maxQtyPerLine) {
      throw new PricingError("BAD_QUANTITY", `Quantity for ${item.name} must be between 1 and ${RULES.maxQtyPerLine}.`, { id: item.id });
    }
    let choice = String(raw.choice || "");
    if (item.options) {
      if (!choice && item.options.choices.length === 1) choice = item.options.choices[0];
      if (!item.options.choices.includes(choice)) {
        throw new PricingError("BAD_OPTION", `Choose a valid ${item.options.type.toLowerCase()} for ${item.name}.`, { id: item.id });
      }
    } else if (choice) {
      throw new PricingError("BAD_OPTION", `${item.name} has no options.`, { id: item.id });
    }
    const key = lineKey(item.id, choice);
    const prev = merged.get(key);
    const total = (prev ? prev.qty : 0) + qty;
    if (total > RULES.maxQtyPerLine) {
      throw new PricingError("BAD_QUANTITY", `Quantity for ${item.name} must be between 1 and ${RULES.maxQtyPerLine}.`, { id: item.id });
    }
    const price = unitPrice(item, category, choice);
    merged.set(key, {
      key, id: item.id, name: item.name, entry: item.entry, categoryId: category.id, category: category.name,
      choice, choiceType: item.options ? item.options.type : "", choiceLabel: choiceLabel(item, choice),
      qty: total, unitPrice: price, lineTotal: price * total
    });
  }

  const items = [...merged.values()];
  const subtotal = items.reduce((sum, line) => sum + line.lineTotal, 0);
  const doseQty = items.filter(line => line.categoryId === RULES.doseCategory).reduce((sum, line) => sum + line.qty, 0);
  const doseDiscount = Math.floor(doseQty / 2) * RULES.dosePairDiscount;

  let deliveryFee = 0;
  if (orderType === "Delivery") {
    const area = deliveryAreaById(deliveryAreaId);
    if (area) deliveryFee = area.fee;
  }
  const rewardDiscount = redeem ? RULES.rewardDiscount : 0;
  const total = Math.max(0, subtotal - doseDiscount + deliveryFee - rewardDiscount);
  const firstOrderSpend = Math.max(0, subtotal - doseDiscount - rewardDiscount);

  return {
    items, count: items.reduce((sum, line) => sum + line.qty, 0),
    subtotal, doseDiscount, deliveryFee, rewardDiscount, total, firstOrderSpend
  };
}

export function firstOrderEligible(quote, account) {
  return !!(account && account.firstOrderEligible) && quote.firstOrderSpend >= RULES.firstOrderMinimum;
}

// Validates the customer/fulfilment part of checkout. Returns { field, message } or null.
// Same rules and wording as the original checkout, in the same order.
export function validateCheckout(form) {
  if (!String(form.name || "").trim()) return { field: "name", message: "Enter your name." };
  if (!normalizePhone(form.phone)) return { field: "phone", message: "Enter a valid Philippine mobile number, such as 0917 123 4567." };
  if (!PAYMENT_METHODS.includes(form.payment)) return { field: "payment", message: "Choose a payment method: Cash or GCash." };
  if (!ORDER_TYPES.includes(form.orderType)) return { field: "orderType", message: "Choose Delivery, Pick up, or Dine in." };
  if (form.orderType === "Delivery" && !deliveryAreaById(form.deliveryAreaId)) return { field: "deliveryAreaId", message: "Choose a delivery area." };
  if (form.orderType === "Delivery" && !String(form.address || "").trim()) return { field: "address", message: "Enter the exact delivery address." };
  if (!ORDER_TIMES.includes(form.time)) return { field: "time", message: "Choose whether you want the order ASAP or Later." };
  if (form.time === "Later" && !String(form.laterTime || "").trim()) return { field: "laterTime", message: "Enter the requested order time." };
  return null;
}
