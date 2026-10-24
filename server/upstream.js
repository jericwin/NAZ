// Gateway to the existing Naz order backend and the Google Form backup.
//
// The backend contract is unchanged from the original site: POST { action, args } to /api/naz,
// answered with { ok, result } or { ok: false, error }. Only the actions below are ever called.
import { errorMessage, maskPhone } from "./log.js";

export class UpstreamError extends Error {
  constructor(action, message) {
    super(message);
    this.name = "UpstreamError";
    this.action = action;
  }
}

const AVAILABILITY_TTL_MS = 60_000;

export function createUpstream(config, log) {
  const live = config.mode === "live";
  let availability = { at: 0, data: {}, pending: null };

  async function call(action, ...args) {
    let response;
    try {
      response = await fetch(config.upstreamUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "naz-coffee-web/2" },
        body: JSON.stringify({ action, args }),
        signal: AbortSignal.timeout(config.upstreamTimeoutMs)
      });
    } catch (error) {
      throw new UpstreamError(action, error.name === "TimeoutError" ? "The order service took too long to respond." : "The order service could not be reached.");
    }
    let data = null;
    try { data = await response.json(); } catch { /* handled below */ }
    if (!response.ok || !data || data.ok !== true) {
      throw new UpstreamError(action, (data && data.error) || `The order service returned ${response.status}.`);
    }
    return data.result;
  }

  // Dry-run stand-in for the rewards backend, so local testing never reads or writes real accounts.
  const mockAccounts = new Map();
  const mockAccount = (phone, name) => ({
    accountId: "DRY-" + phone.slice(-4), name, phone, points: 0, rewardAvailable: false, firstOrderEligible: true
  });

  async function getAvailability() {
    if (!live && !config.upstreamReads) return {};
    if (Date.now() - availability.at < AVAILABILITY_TTL_MS) return availability.data;
    if (!availability.pending) {
      availability.pending = call("getMenuAvailability")
        .then(data => { availability = { at: Date.now(), data: data || {}, pending: null }; return availability.data; })
        .catch(error => {
          // Keep serving the last known availability; an outage must not block ordering.
          log.warn("availability refresh failed", { error: errorMessage(error) });
          availability = { ...availability, at: Date.now() - AVAILABILITY_TTL_MS + 10_000, pending: null };
          return availability.data;
        });
    }
    return availability.pending;
  }

  async function getLoyaltyAccount(phone) {
    if (!live) return mockAccounts.get(phone) || null;
    return call("getLoyaltyAccount", phone);
  }

  async function createLoyaltyAccount({ name, phone, birthday, promos }) {
    if (!live) {
      if (!mockAccounts.has(phone)) mockAccounts.set(phone, mockAccount(phone, name));
      log.info("[dry-run] createLoyaltyAccount", { phone: maskPhone(phone) });
      return mockAccounts.get(phone);
    }
    return call("createLoyaltyAccount", { name, phone, birthday, promos });
  }

  async function sendWebOrderNotification(data) {
    if (!live) {
      log.info("[dry-run] sendWebOrderNotification", { ref: data.clientOrderId, total: data.total, lines: data.items.length });
      return { dryRun: true };
    }
    return call("sendWebOrderNotification", data);
  }

  async function recordLoyaltyOrder(data) {
    if (!live) {
      const account = mockAccounts.get(data.phone);
      if (account) {
        account.points += Math.floor(data.total / 20) - (data.redeem ? 100 : 0);
        account.rewardAvailable = account.points >= 100;
        if (data.firstOrderReward || data.total > 0) account.firstOrderEligible = false;
      }
      log.info("[dry-run] recordLoyaltyOrder", { ref: data.orderId, phone: maskPhone(data.phone) });
      return { dryRun: true };
    }
    return call("recordLoyaltyOrder", data);
  }

  // Posts the backup copy of the order to the Google Form, as the original page did from the
  // browser. Done server-side so the result is actually known instead of fired into a hidden iframe.
  async function submitGoogleForm(fields) {
    if (!live || !config.googleFormSubmit) {
      log.info("[dry-run] googleForm", { fields: Object.keys(fields).length });
      return { dryRun: true };
    }
    const response = await fetch(config.googleFormUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
      redirect: "manual",
      signal: AbortSignal.timeout(config.upstreamTimeoutMs)
    });
    if (response.status !== 200) throw new UpstreamError("googleForm", `Google Form returned ${response.status}.`);
    return { ok: true };
  }

  return { live, getAvailability, getLoyaltyAccount, createLoyaltyAccount, sendWebOrderNotification, recordLoyaltyOrder, submitGoogleForm };
}
