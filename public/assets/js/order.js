import { trackGa, trackMeta } from "./analytics.js";
import { MENU, RULES, DELIVERY_AREAS, CATEGORY_NOTES } from "/shared/menu.js";
import { findItem, money, priceCart, normalizePhone, validateCheckout, choiceLabel, unitPrice, defaultChoice, firstOrderEligible } from "/shared/pricing.js";
import { SITE } from "./site-config.js";
import { createCart } from "./cart.js";
import { esc, initReveal, fetchAvailability, toast, reducedMotion } from "./common.js";

// Icons are SVG rather than "+ − ×" text so they sit dead-centre on every device and font.
const ICON = {
  plus: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  close: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};

const $ = id => document.getElementById(id);
const cart = createCart();
const state = {
  query: "",
  availability: {},
  account: null,          // public rewards account after "Check my points"
  sending: false,
  confirmDuplicate: false,
  declinedFirstOrder: false   // customer explicitly unticked the free first-order drink
};
const isAvailable = item => state.availability[item.name] !== false;

/* ---------------- Analytics (same events as the original page) ---------------- */
const analyticsItem = line => ({ item_id: line.entry, item_name: line.name, item_category: line.category, item_variant: line.choice || undefined, price: line.unitPrice, quantity: line.qty });
function trackCartChange({ type, id, choice, delta }) {
  const found = findItem(id);
  if (!found || !delta) return;
  const { item, category } = found;
  const price = unitPrice(item, category, choice);
  const line = { entry: item.entry, name: item.name, category: category.name, choice, unitPrice: price, qty: Math.abs(delta) };
  if (type === "add") {
    trackGa("add_to_cart", { currency: "PHP", value: price * delta, items: [analyticsItem(line)] });
    trackMeta("AddToCart", { content_ids: [item.entry], content_name: item.name, content_type: "product", contents: [{ id: item.entry, quantity: delta, item_price: price }], currency: "PHP", value: price * delta });
  } else if (type === "remove") {
    trackGa("remove_from_cart", { currency: "PHP", value: price * -delta, items: [analyticsItem(line)] });
  }
}

/* ---------------- Layers: dialogs that cooperate with the Back button ---------------- */
const layers = [];
function openLayer(dialog, { replaceTop = false } = {}) {
  if (replaceTop && layers.length) {
    hideDialog(layers.pop(), { instant: true });
    history.replaceState({ layer: dialog.id }, "");
  } else {
    history.pushState({ layer: dialog.id }, "");
  }
  layers.push(dialog);
  dialog.classList.remove("is-closing");
  if (!dialog.open) dialog.showModal();
  document.documentElement.style.setProperty("overflow", "hidden");
}
function closeTopLayer() {
  if (layers.length) history.back();
}
function hideDialog(dialog, { instant = false } = {}) {
  const done = () => {
    dialog.classList.remove("is-closing");
    if (dialog.open) dialog.close();
    if (!layers.length) document.documentElement.style.removeProperty("overflow");
  };
  if (instant || reducedMotion()) return done();
  dialog.classList.add("is-closing");
  setTimeout(done, 220);
}
window.addEventListener("popstate", () => {
  const top = layers.pop();
  if (top) hideDialog(top);
});
for (const dialog of document.querySelectorAll("dialog.sheet")) {
  dialog.addEventListener("cancel", e => { e.preventDefault(); if (layers.at(-1) === dialog) closeTopLayer(); });
  dialog.addEventListener("click", e => {
    if (e.target === dialog || e.target.closest("[data-close]")) { if (layers.at(-1) === dialog) closeTopLayer(); }
  });
}

/* ---------------- Menu ---------------- */
function optionHint(item) {
  if (!item.options) return "";
  const { type, choices } = item.options;
  if (type === "Temperature") return choices.length === 1 ? choices[0] + " only" : "Hot · Iced";
  if (type === "Size") return "Regular · Upsize +₱" + RULES.doseUpsizePrice;
  return choices.length + " flavors";
}

function matches(item, category) {
  if (!state.query) return true;
  const q = state.query;
  return item.name.toLowerCase().includes(q) || category.name.toLowerCase().includes(q);
}

function renderCategories() {
  $("catList").innerHTML = MENU.map(c => `<li><a href="#${esc(c.id)}" data-cat="${esc(c.id)}">${esc(c.name)}</a></li>`).join("");
}

function cardHtml(item, category, eager) {
  const qty = cart.qtyOfItem(item.id);
  const available = isAvailable(item);
  const quick = !item.options || item.options.choices.length === 1;
  return `<article class="p-card${qty ? " in-cart" : ""}${available ? "" : " is-unavailable"}" data-id="${esc(item.id)}">
    ${available ? "" : '<span class="p-flag">Not available today</span>'}
    <span class="p-qty"${qty ? "" : " hidden"} aria-hidden="true">${qty}</span>
    <button class="p-open" type="button" data-open="${esc(item.id)}" aria-label="${esc(item.name)}, ${money(item.price)}. View options">
      <span class="plate"><img src="${esc(item.image)}" alt="" width="480" height="480" loading="${eager ? "eager" : "lazy"}" decoding="async"></span>
      <span class="p-body">
        <span class="p-name">${esc(item.name)}</span>
        <span class="p-opts">${esc(optionHint(item))}</span>
        <span class="p-price">${money(item.price)}</span>
      </span>
    </button>
    <button class="p-add" type="button" data-${quick ? "quick" : "open"}="${esc(item.id)}" ${available ? "" : "disabled"} aria-label="Add ${esc(item.name)}">${ICON.plus}</button>
  </article>`;
}

function renderMenu() {
  let html = "", shown = 0;
  MENU.forEach((category, ci) => {
    const items = category.items.filter(item => matches(item, category));
    if (!items.length) return;
    shown += items.length;
    const note = CATEGORY_NOTES[category.id];
    html += `<section class="category" id="${esc(category.id)}" aria-labelledby="h-${esc(category.id)}">
      <div class="cat-head"><h2 id="h-${esc(category.id)}">${esc(category.name)}</h2>${note ? `<p>${esc(note)}</p>` : ""}</div>
      <div class="grid">${items.map(item => cardHtml(item, category, ci === 0)).join("")}</div>
    </section>`;
  });
  $("menu").innerHTML = shown ? html
    : `<div class="empty-state"><p>No menu items match “${esc(state.query)}”.</p><button class="btn" type="button" id="clearSearch">Clear search</button></div>`;
  for (const link of document.querySelectorAll("#catList a")) link.parentElement.hidden = !document.getElementById(link.dataset.cat);
  observeCategories();
}

// Update cart badges on cards without re-rendering the whole menu.
function refreshCards(changedId) {
  for (const card of document.querySelectorAll(changedId ? `.p-card[data-id="${CSS.escape(changedId)}"]` : ".p-card")) {
    const qty = cart.qtyOfItem(card.dataset.id);
    const badge = card.querySelector(".p-qty");
    card.classList.toggle("in-cart", qty > 0);
    badge.hidden = !qty;
    if (badge.textContent !== String(qty)) {
      badge.textContent = qty;
      if (qty && changedId) { badge.classList.remove("pop"); void badge.offsetWidth; badge.classList.add("pop"); }
    }
  }
}

let catObserver;
function observeCategories() {
  catObserver?.disconnect();
  if (!("IntersectionObserver" in window)) return;
  const links = new Map([...document.querySelectorAll("#catList a")].map(a => [a.dataset.cat, a]));
  catObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      links.forEach(a => a.classList.remove("is-active"));
      const active = links.get(entry.target.id);
      if (active) {
        active.classList.add("is-active");
        const list = $("catList");
        list.scrollTo({ left: active.offsetLeft - list.clientWidth / 2 + active.clientWidth / 2, behavior: reducedMotion() ? "auto" : "smooth" });
      }
    }
  }, { rootMargin: "-35% 0px -60% 0px" });
  document.querySelectorAll(".category").forEach(section => catObserver.observe(section));
}

/* ---------------- Product sheet ---------------- */
const pd = { item: null, category: null, choice: "", qty: 1 };

function openProduct(id) {
  const found = findItem(id);
  if (!found) return;
  Object.assign(pd, found, { choice: defaultChoice(found.item), qty: 1 });
  const { item, category } = found;
  $("pdImage").src = item.image;
  $("pdImage").alt = item.name;
  $("pdCat").textContent = category.name;
  $("pdName").textContent = item.name;
  const note = CATEGORY_NOTES[category.id];
  $("pdNote").hidden = !note;
  $("pdNote").textContent = note || "";
  $("pdUnavailable").hidden = isAvailable(item);

  const opts = item.options;
  $("pdOptions").hidden = !opts;
  if (opts) {
    $("pdOptionsLegend").textContent = opts.choices.length === 1 ? `${opts.type}: ${opts.choices[0]} only` : `Choose ${opts.type.toLowerCase()}`;
    $("pdChoices").innerHTML = opts.choices.map(choice => {
      const extra = opts.type === "Size" && choice === RULES.doseUpsizeChoice ? ` <small>+₱${RULES.doseUpsizePrice}</small>` : "";
      const label = opts.type === "Size" ? choiceLabel(item, choice).replace(/ \(.*\)/, "") : choice;
      return `<label><input type="radio" name="pdChoice" value="${esc(choice)}"${choice === pd.choice ? " checked" : ""}><span>${esc(label)}${extra}</span></label>`;
    }).join("");
  }
  updateProduct();
  openLayer($("productDialog"));
  trackGa("view_item", { currency: "PHP", value: item.price, items: [{ item_id: item.entry, item_name: item.name, item_category: category.name, price: item.price }] });
}

function updateProduct() {
  const { item, category, choice } = pd;
  const price = unitPrice(item, category, choice);
  const inCart = cart.qtyOf(item.id, choice);
  const room = RULES.maxQtyPerLine - inCart;
  pd.qty = Math.max(1, Math.min(pd.qty, Math.max(room, 1)));
  const available = isAvailable(item);
  $("pdPrice").textContent = money(price);
  $("pdQty").textContent = pd.qty;
  $("pdMinus").disabled = pd.qty <= 1;
  $("pdPlus").disabled = pd.qty >= room;
  const add = $("pdAdd");
  add.disabled = !available || room <= 0;
  add.textContent = !available ? "Not available today" : room <= 0 ? "Limit reached" : `Add to order · ${money(price * pd.qty)}`;
  $("pdLimit").hidden = inCart === 0;
  $("pdLimit").textContent = room <= 0
    ? `You already have the maximum of ${RULES.maxQtyPerLine} in your order.`
    : `${inCart} already in your order (max ${RULES.maxQtyPerLine} per item${item.options ? " and option" : ""}).`;
}

$("pdChoices").addEventListener("change", e => { pd.choice = e.target.value; updateProduct(); });
$("pdMinus").addEventListener("click", () => { pd.qty--; updateProduct(); });
$("pdPlus").addEventListener("click", () => { pd.qty++; updateProduct(); });
$("pdAdd").addEventListener("click", () => {
  const added = cart.add(pd.item.id, pd.choice, pd.qty);
  if (added) {
    toast(`Added ${added}× ${pd.item.name}${pd.choice && pd.item.options.choices.length > 1 ? " · " + choiceLabel(pd.item, pd.choice) : ""}`, { image: pd.item.image });
    closeTopLayer();
  }
});

function quickAdd(id) {
  const found = findItem(id);
  if (!found || !isAvailable(found.item)) return;
  const choice = defaultChoice(found.item);
  if (cart.add(found.item.id, choice, 1)) toast(`Added ${found.item.name}`, { image: found.item.image });
  else toast(`Maximum of ${RULES.maxQtyPerLine} ${found.item.name} per order`);
}

$("menu").addEventListener("click", e => {
  const quick = e.target.closest("[data-quick]");
  if (quick) return quickAdd(quick.dataset.quick);
  const open = e.target.closest("[data-open]");
  if (open) return openProduct(open.dataset.open);
  if (e.target.id === "clearSearch") { $("search").value = ""; state.query = ""; renderMenu(); $("search").focus(); }
});

let searchTimer;
$("search").addEventListener("input", e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.query = e.target.value.trim().toLowerCase(); renderMenu(); }, 120);
});

/* ---------------- Cart ---------------- */
function currentQuote(extra = {}) {
  const lines = cart.lines();
  if (!lines.length) return null;
  return priceCart(lines, extra);
}

function cartHtml() {
  const quote = currentQuote();
  if (!quote) {
    return `<div class="cart-empty"><span class="cup">Never an empty cup.</span>Your order is empty. Tap <strong>+</strong> on anything you like.</div>`;
  }
  const blocked = quote.items.filter(line => state.availability[line.name] === false);
  return `<ul class="c-lines">${quote.items.map(line => {
    const { item } = findItem(line.id);
    const unavailable = state.availability[line.name] === false;
    return `<li class="c-line">
      <span class="plate"><img src="${esc(item.image)}" alt="" width="52" height="52" loading="lazy"></span>
      <span class="c-name">${esc(line.name)}${line.choiceLabel ? `<span class="c-choice">${esc(line.choiceLabel)}</span>` : ""}</span>
      <span class="c-price">${money(line.lineTotal)}</span>
      <span class="stepper" role="group" aria-label="Quantity of ${esc(line.name)}">
        <button type="button" data-step="-1" data-id="${esc(line.id)}" data-choice="${esc(line.choice)}" aria-label="${line.qty === 1 ? "Remove" : "Decrease"} ${esc(line.name)}">${line.qty === 1 ? ICON.close : ICON.minus}</button>
        <span>${line.qty}</span>
        <button type="button" data-step="1" data-id="${esc(line.id)}" data-choice="${esc(line.choice)}" aria-label="Increase ${esc(line.name)}" ${line.qty >= RULES.maxQtyPerLine ? "disabled" : ""}>${ICON.plus}</button>
      </span>
      ${unavailable ? '<span class="c-warn">Not available today. Please remove it to check out.</span>' : ""}
    </li>`;
  }).join("")}</ul>
  <div class="c-sum">
    <div><span>Subtotal</span><span>${money(quote.subtotal)}</span></div>
    ${quote.doseDiscount ? `<div class="discount"><span>DOSE any 2 for ₱180</span><span>−${money(quote.doseDiscount)}</span></div>` : ""}
    <div class="total"><span>Total</span><span>${money(quote.total)}</span></div>
  </div>
  <p class="c-note">Delivery fee and Naz Rewards are applied at checkout.</p>
  <button class="btn btn-primary c-checkout" type="button" data-checkout ${blocked.length ? "disabled" : ""}>Checkout · ${money(quote.total)}</button>`;
}

function renderCart() {
  const html = cartHtml();
  document.querySelectorAll("[data-cart-body]").forEach(el => { el.innerHTML = html; });
  const quote = currentQuote();
  const count = quote ? quote.count : 0;
  $("cartCount").textContent = count;
  $("cartButton").setAttribute("aria-label", `Cart, ${count} item${count === 1 ? "" : "s"}`);
  $("cartBar").hidden = !count;
  $("cartBarCount").textContent = count;
  $("cartBarTotal").textContent = quote ? money(quote.total) : "₱0";
  if ($("checkoutDialog").open) renderSummary();
}

document.addEventListener("click", e => {
  const step = e.target.closest("[data-step]");
  if (step) {
    const { id, choice } = step.dataset;
    cart.setQty(id, choice, cart.qtyOf(id, choice) + Number(step.dataset.step));
    return;
  }
  if (e.target.closest("[data-checkout]")) openCheckout();
});

function bump(el) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
cart.subscribe(change => {
  renderCart();
  refreshCards(change.id);
  if (change.type === "add") { bump($("cartButton")); bump($("cartBar")); }
  if (change.type === "add" || change.type === "remove") trackCartChange(change);
  if (!cart.count() && $("cartDialog").open && layers.at(-1) === $("cartDialog")) closeTopLayer();
});

$("cartButton").addEventListener("click", () => {
  if (window.matchMedia("(min-width: 1080px)").matches && cart.count()) {
    $("cartPanel").querySelector(".c-checkout")?.focus();
    return;
  }
  openLayer($("cartDialog"));
});
$("cartBar").addEventListener("click", () => openLayer($("cartDialog")));

/* ---------------- Checkout ---------------- */
const form = $("checkoutForm");
const DRAFT_KEY = "naz_checkout_draft";
const ORDER_ID_KEY = "naz_client_order";

function formValues() {
  const radio = name => form.querySelector(`input[name="${name}"]:checked`)?.value || "";
  return {
    name: $("fName").value.trim(), phone: $("fPhone").value, payment: radio("payment"), orderType: radio("orderType"),
    deliveryAreaId: $("fArea").value, address: $("fAddress").value.trim(), time: radio("time"), laterTime: $("fLater").value.trim(),
    notes: $("fNotes").value.trim()
  };
}

function saveDraft() {
  const v = formValues();
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...v, birthday: $("fBirthday").value, promos: $("fPromos").checked })); } catch { /* ignore */ }
  try { if (normalizePhone(v.phone)) localStorage.setItem("naz_contact", "0" + normalizePhone(v.phone)); } catch { /* ignore */ }
}

function restoreDraft() {
  let draft = null;
  try { draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null"); } catch { /* ignore */ }
  const setRadio = (name, value) => { const el = form.querySelector(`input[name="${name}"][value="${CSS.escape(value || "")}"]`); if (el) el.checked = true; };
  try { $("fPhone").value = localStorage.getItem("naz_contact") || ""; } catch { /* ignore */ }
  if (!draft) return;
  $("fName").value = draft.name || "";
  if (draft.phone) $("fPhone").value = draft.phone;
  setRadio("payment", draft.payment); setRadio("orderType", draft.orderType); setRadio("time", draft.time);
  $("fArea").value = draft.deliveryAreaId || "";
  $("fAddress").value = draft.address || "";
  $("fLater").value = draft.laterTime || "";
  $("fNotes").value = draft.notes || "";
  $("fBirthday").value = draft.birthday || "";
  $("fPromos").checked = !!draft.promos;
}

function syncConditionalFields() {
  const v = formValues();
  $("deliveryFields").hidden = v.orderType !== "Delivery";
  $("laterField").hidden = v.time !== "Later";
  $("gcashBox").hidden = v.payment !== "GCash";
  if (v.payment === "GCash" && !$("gcashQr").getAttribute("src")) $("gcashQr").src = SITE.gcash.qr;
}

function checkoutQuote() {
  const v = formValues();
  return currentQuote({ orderType: v.orderType, deliveryAreaId: v.deliveryAreaId, redeem: $("fRedeem").checked && !!state.account?.rewardAvailable });
}

function renderSummary() {
  const quote = checkoutQuote();
  if (!quote) return;
  syncFirstOrder(quote);
  const freeLatte = $("fFirstOrder").checked && firstOrderEligible(quote, state.account);
  const v = formValues();
  $("summaryLines").innerHTML = quote.items.map(line =>
    `<div class="s-line"><span>${line.qty}× ${esc(line.name)}${line.choiceLabel ? " · " + esc(line.choiceLabel) : ""}</span><span>${money(line.lineTotal)}</span></div>`).join("")
    + (freeLatte ? `<div class="s-line free"><span>1× FREE Spanish Latte · First Order Reward</span><span>₱0</span></div>` : "")
    + (quote.doseDiscount ? `<div class="s-line discount"><span>DOSE 2-for-₱180 discount</span><span>−${money(quote.doseDiscount)}</span></div>` : "")
    + (quote.deliveryFee ? `<div class="s-line"><span>Delivery fee</span><span>${money(quote.deliveryFee)}</span></div>` : "")
    + (v.orderType === "Delivery" && !v.deliveryAreaId ? `<div class="s-line"><span>Delivery fee</span><span>Choose an area</span></div>` : "")
    + (quote.rewardDiscount ? `<div class="s-line discount"><span>Naz Rewards · 100 points</span><span>−${money(quote.rewardDiscount)}</span></div>` : "")
    + `<div class="s-line total"><span>Total<small>${v.payment ? "Pay by " + esc(v.payment) : "Choose a payment method above"}</small></span><span>${money(quote.total)}</span></div>`;
  if (!state.sending) $("sendBtn").textContent = `Send order · ${money(quote.total)}`;
}

function syncFirstOrder(quote) {
  const box = $("fFirstOrder"), hint = $("firstOrderHint");
  const rules = `Minimum ${money(RULES.firstOrderMinimum)} on menu items after discounts and points redemption, excluding delivery.`;
  if (!state.account) {
    box.disabled = false;
    box.checked = !state.declinedFirstOrder;
    hint.textContent = "First order only · " + rules + " Eligibility is checked automatically when you send your order.";
  } else if (!state.account.firstOrderEligible) {
    box.disabled = true;
    box.checked = false;
    hint.textContent = "This account already has an order, so the first-order drink doesn't apply.";
  } else if (quote.firstOrderSpend < RULES.firstOrderMinimum) {
    box.disabled = true;
    box.checked = false;
    hint.textContent = `Add ${money(RULES.firstOrderMinimum - quote.firstOrderSpend)} more to qualify. ` + rules;
  } else {
    box.disabled = false;
    box.checked = !state.declinedFirstOrder;
    hint.textContent = "You qualify! Your free Spanish Latte will be added to this order.";
  }
}

function setRewardsStatus(text, tone = "") {
  const el = $("rewardsStatus");
  el.textContent = text;
  el.className = "rewards-status" + (tone ? " " + tone : "");
}

function showAccount(account) {
  state.account = account;
  $("fRedeem").checked = false;
  $("redeemRow").hidden = !(account && account.rewardAvailable);
  if (!account) {
    setRewardsStatus("No account yet. One will be created for this number when you send your order.", "warn");
    form.querySelector(".new-member").open = true;
  } else {
    setRewardsStatus(`Hi ${account.name}! ${account.points} points${account.rewardAvailable ? " · ₱100 reward available" : ""}.`, "ok");
  }
  renderSummary();
}

async function postJson(url, body) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
  let data = null;
  try { data = await res.json(); } catch { /* handled below */ }
  if (!data) throw Object.assign(new Error("Unexpected response from the server."), { code: "BAD_RESPONSE", status: res.status });
  if (!res.ok || !data.ok) throw Object.assign(new Error(data.error || "Request failed."), data, { status: res.status });
  return data;
}

$("checkPoints").addEventListener("click", async () => {
  const phone = normalizePhone($("fPhone").value);
  if (!phone) { setRewardsStatus("Enter your Mobile / Viber number first.", "warn"); $("fPhone").focus(); return; }
  const btn = $("checkPoints");
  btn.disabled = true;
  setRewardsStatus("Checking…");
  try {
    showAccount((await postJson("/api/rewards/lookup", { phone })).account);
  } catch (error) {
    setRewardsStatus(error.message || "Could not check points right now.", "warn");
  } finally {
    btn.disabled = false;
  }
});

$("fPhone").addEventListener("input", () => {
  if (state.account) { state.account = null; $("redeemRow").hidden = true; $("fRedeem").checked = false; setRewardsStatus(""); renderSummary(); }
});
$("fPhone").addEventListener("blur", e => { const p = normalizePhone(e.target.value); if (p) e.target.value = "0" + p; });

$("copyGcash").addEventListener("click", async () => {
  const btn = $("copyGcash"), number = SITE.gcash.number.replace(/\s/g, "");
  try { await navigator.clipboard.writeText(number); }
  catch {
    const input = Object.assign(document.createElement("input"), { value: number });
    document.body.appendChild(input); input.select(); document.execCommand("copy"); input.remove();
  }
  btn.textContent = "Copied: " + SITE.gcash.number;
  btn.classList.add("copied");
  setTimeout(() => { btn.textContent = "Copy GCash number"; btn.classList.remove("copied"); }, 2200);
});

form.addEventListener("input", () => { clearErrors(); saveDraft(); });
$("fFirstOrder").addEventListener("change", e => { state.declinedFirstOrder = !e.target.checked; });
form.addEventListener("change", e => {
  clearErrors();
  syncConditionalFields();
  if (["orderType", "deliveryAreaId", "payment"].includes(e.target.name) || e.target.id === "fRedeem" || e.target.id === "fFirstOrder") renderSummary();
  saveDraft();
});

function clearErrors() {
  if (state.sending) return;
  $("formError").hidden = true;
  $("formErrorBottom").hidden = true;
  $("sendDuplicate").hidden = true;
  form.querySelectorAll(".has-error").forEach(el => el.classList.remove("has-error"));
}

function showError(message, field) {
  for (const box of [$("formError"), $("formErrorBottom")]) { box.textContent = message; box.hidden = false; }
  form.querySelectorAll(".has-error").forEach(el => el.classList.remove("has-error"));
  const wrap = field && form.querySelector(`[data-field="${field}"]`);
  if (wrap) {
    wrap.classList.add("has-error");
    wrap.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
    setTimeout(() => wrap.querySelector("input, select, textarea")?.focus({ preventScroll: true }), 250);
  }
}

// One reference per cart + checkout attempt. Retrying the same order reuses it, so the server can
// recognise a retry and never create a second order.
function clientOrderId(signature) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(ORDER_ID_KEY) || "null");
    if (saved && saved.signature === signature) return saved.id;
  } catch { /* ignore */ }
  const rand = crypto.getRandomValues(new Uint32Array(2));
  const id = "SITE-" + Date.now().toString(36).toUpperCase() + "-" + rand[0].toString(36).toUpperCase().slice(0, 5) + rand[1].toString(36).toUpperCase().slice(0, 3);
  try { sessionStorage.setItem(ORDER_ID_KEY, JSON.stringify({ signature, id })); } catch { /* ignore */ }
  return id;
}

let checkoutTracked = false;
function openCheckout() {
  const quote = currentQuote();
  if (!quote) return;
  clearErrors();
  syncConditionalFields();
  renderSummary();
  const fromCart = layers.at(-1) === $("cartDialog");
  openLayer($("checkoutDialog"), { replaceTop: fromCart });
  if (!checkoutTracked) {
    checkoutTracked = true;
    const items = quote.items.map(analyticsItem);
    trackGa("view_cart", { currency: "PHP", value: quote.total, items });
    trackGa("begin_checkout", { currency: "PHP", value: quote.total, items });
    trackMeta("InitiateCheckout", { content_ids: quote.items.map(l => l.entry), content_type: "product", contents: quote.items.map(l => ({ id: l.entry, quantity: l.qty, item_price: l.unitPrice })), currency: "PHP", num_items: quote.count, value: quote.total });
  }
}

function setSending(on) {
  state.sending = on;
  const btn = $("sendBtn");
  btn.classList.toggle("is-busy", on);
  btn.setAttribute("aria-busy", String(on));
  if (on) btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Sending order…';
  else renderSummary();
}

form.addEventListener("submit", e => { e.preventDefault(); submitOrder(); });
$("sendDuplicate").addEventListener("click", () => { state.confirmDuplicate = true; submitOrder(); });

async function submitOrder() {
  if (state.sending) return;
  clearErrors();
  const v = formValues();
  const invalid = validateCheckout(v);
  if (invalid) return showError("Please complete checkout: " + invalid.message, invalid.field);
  const quote = checkoutQuote();
  if (!quote) return showError("Your order is empty.");
  const blocked = quote.items.filter(line => state.availability[line.name] === false);
  if (blocked.length) return showError(`${blocked.map(l => l.name).join(", ")} ${blocked.length === 1 ? "is" : "are"} not available right now. Please remove ${blocked.length === 1 ? "it" : "them"} from your order.`);

  const items = cart.lines();
  const signature = JSON.stringify([items, v, $("fRedeem").checked, state.declinedFirstOrder, state.confirmDuplicate]);
  const body = {
    clientOrderId: clientOrderId(signature),
    expectedTotal: quote.total,
    items,
    customer: { name: v.name, phone: v.phone },
    payment: v.payment, orderType: v.orderType, deliveryAreaId: v.deliveryAreaId, address: v.address,
    time: v.time, laterTime: v.laterTime, notes: v.notes,
    redeem: $("fRedeem").checked && !!state.account?.rewardAvailable,
    declineFirstOrderReward: state.declinedFirstOrder,
    rewards: { birthday: $("fBirthday").value.trim(), promos: $("fPromos").checked },
    confirmDuplicate: state.confirmDuplicate
  };

  setSending(true);
  try {
    const { order } = await postJson("/api/orders", body);
    onOrderReceived(order, v);
  } catch (error) {
    handleOrderError(error);
  } finally {
    state.confirmDuplicate = false;
    setSending(false);
  }
}

function handleOrderError(error) {
  switch (error.code) {
    case "VALIDATION":
      return showError("Please complete checkout: " + error.message, error.field);
    case "ITEM_UNAVAILABLE":
      for (const name of error.items || []) state.availability[name] = false;
      renderMenu(); renderCart();
      return showError(error.message);
    case "PRICE_CHANGED":
      renderSummary();
      return showError(error.message);
    case "REWARD_NOT_AVAILABLE":
      $("fRedeem").checked = false;
      if (error.account) showAccount(error.account);
      return showError(error.message, null);
    case "DUPLICATE_ORDER":
      showError(error.message);
      $("sendDuplicate").hidden = false;
      return;
    case undefined:
      // Network failure: the order may or may not have arrived. Retrying reuses the same
      // reference, so the server will not create a second order.
      return showError("We couldn't reach NAZ Coffee. Check your connection and tap Send order again. It's safe to retry: your order won't be duplicated.");
    default:
      return showError(error.message || "Your order could not be sent. Please try again.");
  }
}

function onOrderReceived(order, v) {
  const q = order.quote;
  trackGa("purchase", { transaction_id: order.reference, currency: "PHP", value: q.total, shipping: q.deliveryFee, order_type: order.orderType, items: q.items.map(l => {
    const { item, category } = findItem(l.id);
    return analyticsItem({ entry: item.entry, name: l.name, category: category.name, choice: l.choice, unitPrice: l.unitPrice, qty: l.qty });
  }) });
  trackMeta("Purchase", { content_ids: q.items.map(l => findItem(l.id).item.entry), content_type: "product", contents: q.items.map(l => ({ id: findItem(l.id).item.entry, quantity: l.qty, item_price: l.unitPrice })), currency: "PHP", num_items: q.count, value: q.total });

  $("dryRunBanner").hidden = !order.dryRun;
  $("confirmRef").textContent = order.reference;
  $("confirmLines").innerHTML = q.items.map(l => `<div class="s-line"><span>${l.qty}× ${esc(l.name)}${l.choiceLabel ? " · " + esc(l.choiceLabel) : ""}</span><span>${money(l.lineTotal)}</span></div>`).join("")
    + (order.firstOrderReward ? `<div class="s-line free"><span>1× FREE Spanish Latte · First Order Reward</span><span>₱0</span></div>` : "")
    + (q.doseDiscount ? `<div class="s-line discount"><span>DOSE 2-for-₱180 discount</span><span>−${money(q.doseDiscount)}</span></div>` : "")
    + (q.deliveryFee ? `<div class="s-line"><span>Delivery fee</span><span>${money(q.deliveryFee)}</span></div>` : "")
    + (q.rewardDiscount ? `<div class="s-line discount"><span>Naz Rewards · 100 points</span><span>−${money(q.rewardDiscount)}</span></div>` : "")
    + `<div class="s-line total"><span>Total</span><span>${money(q.total)}</span></div>`;

  const phone = "0" + normalizePhone(v.phone);
  const notes = [];
  notes.push(order.status === "received"
    ? `<li>Your order is on our order board. We'll contact <strong>${esc(phone)}</strong> on Mobile / Viber if needed. No need to message us again.</li>`
    : `<li class="warn">Your order was recorded and our team will verify it on the order board. Please don't send it again; we'll contact <strong>${esc(phone)}</strong> if needed.</li>`);
  notes.push(order.payment === "GCash"
    ? `<li><strong>GCash:</strong> send ${money(q.total)} to ${esc(SITE.gcash.name)} (${esc(SITE.gcash.number)}) and keep your receipt. Our team verifies the payment before preparing your order.</li>`
    : `<li><strong>Cash:</strong> please prepare ${money(q.total)}${order.orderType === "Delivery" ? " for the rider" : order.orderType === "Pick up" ? " for pick up" : " at the café"}.</li>`);
  if (order.rewards === "recorded") notes.push(`<li><strong>Naz Rewards</strong> recorded for ${esc(phone)}.</li>`);
  else if (order.rewards === "pending") notes.push(`<li class="warn"><strong>Naz Rewards</strong> for ${esc(phone)} are pending and will be updated by our team.</li>`);
  $("confirmNotes").innerHTML = notes.join("");

  cart.clear();
  try { sessionStorage.removeItem(ORDER_ID_KEY); } catch { /* ignore */ }
  $("fNotes").value = ""; $("fRedeem").checked = false; state.account = null; setRewardsStatus(""); $("redeemRow").hidden = true;
  saveDraft();
  openLayer($("confirmDialog"), { replaceTop: true });
}

$("newOrderBtn").addEventListener("click", () => {
  closeTopLayer();
  window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
});

/* ---------------- Boot ---------------- */
$("fArea").insertAdjacentHTML("beforeend", DELIVERY_AREAS.map(a => `<option value="${esc(a.id)}">${esc(a.label)}</option>`).join(""));
$("gcashName").textContent = SITE.gcash.name;
$("gcashNumber").textContent = SITE.gcash.number;
$("gcashQr").alt = "GCash QR code for " + SITE.gcash.name;
restoreDraft();
syncConditionalFields();
renderCategories();
renderMenu();
renderCart();
initReveal();

// Deep links from the landing page: /order?item=<id> opens that product, /order#<category> scrolls.
const params = new URLSearchParams(location.search);
const deepItem = params.get("item");
if (deepItem && findItem(deepItem)) {
  history.replaceState(null, "", location.pathname + location.hash);
  document.getElementById(findItem(deepItem).category.id)?.scrollIntoView({ block: "start" });
  openProduct(deepItem);
} else if (location.hash) {
  document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ block: "start" });
}

fetchAvailability().then(availability => {
  state.availability = availability;
  renderMenu();
  renderCart();
  if ($("productDialog").open) { $("pdUnavailable").hidden = isAvailable(pd.item); updateProduct(); }
});
