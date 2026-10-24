// Cart state, persisted so navigating away (or Back) never loses a customer's selections.
// Stored lines are re-validated against the current menu on load; prices are never stored.
import { RULES } from "/shared/menu.js";
import { findItem, lineKey } from "/shared/pricing.js";

const KEY = "naz_cart_v2";
const TTL_MS = 24 * 60 * 60 * 1000;

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!saved || saved.v !== 2 || Date.now() - saved.savedAt > TTL_MS) return [];
    return saved.lines;
  } catch {
    return [];
  }
}

function sanitize(lines) {
  const out = new Map();
  for (const line of Array.isArray(lines) ? lines : []) {
    const found = findItem(line && line.id);
    if (!found) continue;
    const { item } = found;
    const choice = item.options ? (item.options.choices.includes(line.choice) ? line.choice : null) : "";
    if (choice === null) continue;
    const qty = Math.min(RULES.maxQtyPerLine, Math.max(0, Math.floor(Number(line.qty) || 0)));
    if (!qty) continue;
    const key = lineKey(item.id, choice);
    out.set(key, { id: item.id, choice, qty: Math.min(RULES.maxQtyPerLine, (out.get(key)?.qty || 0) + qty) });
  }
  return [...out.values()];
}

export function createCart() {
  let lines = sanitize(read());
  const listeners = new Set();

  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 2, savedAt: Date.now(), lines })); } catch { /* private mode: cart still works for this visit */ }
  };
  const emit = change => { save(); listeners.forEach(fn => fn(change)); };

  // Another tab changed the cart.
  window.addEventListener("storage", e => { if (e.key === KEY) { lines = sanitize(read()); listeners.forEach(fn => fn({ type: "sync" })); } });

  return {
    lines: () => lines.map(line => ({ ...line })),
    count: () => lines.reduce((sum, line) => sum + line.qty, 0),
    qtyOf: (id, choice) => lines.find(line => line.id === id && line.choice === choice)?.qty || 0,
    qtyOfItem: id => lines.filter(line => line.id === id).reduce((sum, line) => sum + line.qty, 0),
    // Returns the quantity actually added (0 when the line is already at the limit).
    add(id, choice, qty = 1) {
      const existing = lines.find(line => line.id === id && line.choice === choice);
      const current = existing ? existing.qty : 0;
      const next = Math.min(RULES.maxQtyPerLine, current + qty);
      const added = next - current;
      if (!added) return 0;
      if (existing) existing.qty = next; else lines.push({ id, choice, qty: next });
      emit({ type: "add", id, choice, delta: added });
      return added;
    },
    setQty(id, choice, qty) {
      const existing = lines.find(line => line.id === id && line.choice === choice);
      if (!existing) return;
      const next = Math.min(RULES.maxQtyPerLine, Math.max(0, qty));
      const delta = next - existing.qty;
      if (!delta) return;
      if (next === 0) lines = lines.filter(line => line !== existing); else existing.qty = next;
      emit({ type: delta > 0 ? "add" : "remove", id, choice, delta });
    },
    remove(id, choice) { this.setQty(id, choice, 0); },
    clear() { lines = []; emit({ type: "clear" }); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
}
