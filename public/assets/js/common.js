// Behaviour shared by the landing and ordering pages.

export const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function initHeader({ solidAfter = 24 } = {}) {
  const header = document.getElementById("siteHeader");
  const toggle = document.getElementById("menuToggle");
  const nav = document.getElementById("siteNav");
  if (!header) return;

  const onScroll = () => header.classList.toggle("is-solid", window.scrollY > solidAfter);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  if (!toggle || !nav) return;
  const setOpen = open => {
    toggle.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    header.classList.toggle("nav-open", open);
    document.documentElement.classList.toggle("nav-locked", open);
  };
  toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
  // Close on a link tap or a tap on the sheet's empty area.
  nav.addEventListener("click", e => { if (e.target === nav || e.target.closest("a")) setOpen(false); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) { setOpen(false); toggle.focus(); }
  });
  document.addEventListener("click", e => {
    if (nav.classList.contains("is-open") && !header.contains(e.target)) setOpen(false);
  });
  window.matchMedia("(min-width: 861px)").addEventListener("change", e => { if (e.matches) setOpen(false); });
}

export function initReveal(root = document) {
  const els = [...root.querySelectorAll(".reveal:not(.is-in)")];
  if (!("IntersectionObserver" in window) || reducedMotion()) { els.forEach(el => el.classList.add("is-in")); return; }
  const io = new IntersectionObserver(entries => {
    for (const entry of entries) {
      // Reveal on entry, and anything already scrolled past (fast scrolls, anchor jumps).
      if (entry.isIntersecting || entry.boundingClientRect.top < 0) { entry.target.classList.add("is-in"); io.unobserve(entry.target); }
    }
  }, { rootMargin: "0px 0px -8% 0px", threshold: .08 });
  els.forEach(el => io.observe(el));
}

export async function fetchAvailability() {
  try {
    const res = await fetch("/api/availability", { headers: { accept: "application/json" } });
    if (!res.ok) return {};
    const data = await res.json();
    return data.availability || {};
  } catch {
    return {};
  }
}

let toastRegion;
export function toast(message, { image = "", timeout = 2600 } = {}) {
  if (!toastRegion) {
    toastRegion = document.createElement("div");
    toastRegion.className = "toast-region";
    toastRegion.setAttribute("role", "status");
    toastRegion.setAttribute("aria-live", "polite");
    document.body.appendChild(toastRegion);
  }
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = (image ? `<span class="plate toast-plate"><img src="${esc(image)}" alt=""></span>` : "") + `<span>${esc(message)}</span>`;
  toastRegion.appendChild(el);
  setTimeout(() => { el.classList.add("is-out"); setTimeout(() => el.remove(), 320); }, timeout);
}
