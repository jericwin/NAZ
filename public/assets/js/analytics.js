// GA4 + Meta Pixel, same IDs and events as the original ordering page.
// Loaded from a file (not inline) so the Content-Security-Policy can forbid inline scripts.
import { SITE } from "./site-config.js";

const { ga4, metaPixel } = SITE.analytics;

if (ga4) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", ga4, { page_title: document.title });
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(ga4);
  document.head.appendChild(s);
}

if (metaPixel) {
  const n = window.fbq = function fbq() { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
  if (!window._fbq) window._fbq = n;
  n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(s);
  window.fbq("init", metaPixel);
  window.fbq("track", "PageView");
}

export function trackGa(event, params) { if (typeof window.gtag === "function") window.gtag("event", event, params); }
export function trackMeta(event, params) { if (typeof window.fbq === "function") window.fbq("track", event, params); }
