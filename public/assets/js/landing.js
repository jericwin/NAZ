import "./analytics.js";
import { MENU, DELIVERY_AREAS } from "/shared/menu.js";
import { findItem, money } from "/shared/pricing.js";
import { SITE } from "./site-config.js";
import { initDirections } from "./directions.js";
import { esc, initHeader, initReveal, fetchAvailability, reducedMotion } from "./common.js";

// Picked from the live menu; names must match shared/menu.js ids.
const FEATURED = ["spanish-latte", "sea-salt-latte", "caramel-cloud", "naz-signature", "dirty-matcha-latte", "mont-blanc"];

function optionSummary(item) {
  if (!item.options) return "";
  const { type, choices } = item.options;
  if (type === "Temperature") return choices.length === 2 ? "Hot or iced" : choices[0] + " only";
  if (type === "Size") return "Regular or upsized";
  return choices.join(" · ");
}

function renderFeatured() {
  const grid = document.getElementById("featuredGrid");
  grid.innerHTML = FEATURED.map((id, i) => {
    const found = findItem(id);
    if (!found) return "";
    const { item, category } = found;
    return `<a class="f-card reveal" style="--d:${(i % 3) * 0.08}s" href="/order?item=${encodeURIComponent(item.id)}" data-name="${esc(item.name)}">
      <span class="f-badge" hidden>Not available today</span>
      <div class="plate"><img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy" width="480" height="480"></div>
      <div class="f-body">
        <div class="f-meta"><span>${esc(category.name)}</span></div>
        <h3 class="f-name">${esc(item.name)}</h3>
        <p class="f-opts">${esc(optionSummary(item))}</p>
        <div class="f-foot"><span class="f-price">${money(item.price)}</span><span class="f-cta">Order <span aria-hidden="true">→</span></span></div>
      </div>
    </a>`;
  }).join("");
  initReveal(grid);
}

function markAvailability(availability) {
  for (const card of document.querySelectorAll(".f-card")) {
    const unavailable = availability[card.dataset.name] === false;
    card.classList.toggle("is-unavailable", unavailable);
    card.querySelector(".f-badge").hidden = !unavailable;
  }
}

function renderChips() {
  document.getElementById("categoryChips").innerHTML = MENU
    .map(c => `<li><a href="/order#${esc(c.id)}">${esc(c.name)}</a></li>`).join("");
}

function renderVisit() {
  document.getElementById("feeList").innerHTML = DELIVERY_AREAS.map(area => {
    const [towns] = area.label.split(" — ");
    return `<li><span>${esc(towns)}</span><strong>${money(area.fee)}</strong></li>`;
  }).join("");

  const blocks = [];
  if (SITE.address) {
    blocks.push(`<div><h3>Address</h3><p>${esc(SITE.address)}${SITE.mapsUrl ? ` · <a class="link-arrow" href="${esc(SITE.mapsUrl)}" target="_blank" rel="noopener">Get directions</a>` : ""}</p></div>`);
  }
  if (SITE.hours.length) {
    blocks.push(`<div><h3>Hours</h3><dl>${SITE.hours.map(([d, h]) => `<dt>${esc(d)}</dt><dd>${esc(h)}</dd>`).join("")}</dl></div>`);
  }
  blocks.push(`<div><h3>Ways to order</h3><p>Dine in, pick up, or delivery around the towns listed here. Order online and choose ASAP or a later time.</p></div>`);
  document.getElementById("visitDetails").innerHTML = blocks.join("");

  const contact = [];
  if (SITE.phone) contact.push(`<li><a href="tel:${esc(SITE.phone.replace(/\s/g, ""))}">${esc(SITE.phone)}</a></li>`);
  if (SITE.email) contact.push(`<li><a href="mailto:${esc(SITE.email)}">${esc(SITE.email)}</a></li>`);
  if (SITE.address) contact.push(`<li>${esc(SITE.address)}</li>`);
  for (const [label, url] of [["Facebook", SITE.social.facebook], ["Instagram", SITE.social.instagram], ["TikTok", SITE.social.tiktok]]) {
    if (url) contact.push(`<li><a href="${esc(url)}" target="_blank" rel="noopener">${label}</a></li>`);
  }
  if (contact.length) document.getElementById("footerContactList").innerHTML = contact.join("");
}

// Decorative motion: steam over the cups, drifting beans, pointer parallax, reward count-up.
const STEAM = `<div class="steam" aria-hidden="true"><svg viewBox="0 0 120 150">
  <path d="M40 145 C 26 120, 54 100, 40 76 S 28 34, 42 8"/>
  <path d="M62 145 C 48 118, 76 98, 62 72 S 50 30, 64 4"/>
  <path d="M84 145 C 70 122, 98 102, 84 80 S 72 40, 86 14"/>
</svg></div>`;

function addSteam() {
  document.querySelector(".cup-plate")?.insertAdjacentHTML("beforeend", STEAM);
  document.querySelector(".cta")?.insertAdjacentHTML("afterbegin", STEAM);
}

function scatterBeans(host, count) {
  if (!host) return;
  const rand = (min, max) => (min + Math.random() * (max - min)).toFixed(2);
  const beans = Array.from({ length: count }, () =>
    `<span class="bean" style="--x:${rand(2, 96)}%;--y:${rand(6, 90)}%;--s:${rand(.6, 1.3)};--r:${rand(0, 360)}deg;--o:${rand(.25, .6)};--t:${rand(9, 16)}s;--dl:-${rand(0, 10)}s;--dx:${rand(-20, 20)}px"></span>`);
  host.insertAdjacentHTML("afterbegin", `<div class="beans" aria-hidden="true">${beans.join("")}</div>`);
}

function initParallax() {
  const hero = document.querySelector(".hero");
  if (!hero || reducedMotion() || !matchMedia("(pointer: fine)").matches) return;
  hero.addEventListener("pointermove", e => {
    const r = hero.getBoundingClientRect();
    hero.style.setProperty("--px", ((e.clientX - r.left) / r.width - .5).toFixed(3));
    hero.style.setProperty("--py", ((e.clientY - r.top) / r.height - .5).toFixed(3));
  });
  hero.addEventListener("pointerleave", () => { hero.style.setProperty("--px", 0); hero.style.setProperty("--py", 0); });
}

function initCountUp() {
  const els = [...document.querySelectorAll(".rewards-facts dt")].filter(el => /\d/.test(el.textContent));
  if (!els.length || reducedMotion() || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(entries => {
    for (const { isIntersecting, target } of entries) {
      if (!isIntersecting) continue;
      io.unobserve(target);
      const text = target.textContent, end = Number(text.match(/\d+/)[0]), start = performance.now();
      const tick = now => {
        const t = Math.min((now - start) / 1200, 1);
        target.textContent = text.replace(/\d+/, Math.round(end * (1 - (1 - t) ** 3)));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }, { threshold: .6 });
  els.forEach(el => io.observe(el));
}

initHeader();
addSteam();
scatterBeans(document.querySelector(".hero"), 9);
scatterBeans(document.querySelector(".cta"), 6);
initParallax();
initCountUp();
renderChips();
renderVisit();
initDirections();
renderFeatured();
initReveal();
document.getElementById("year").textContent = new Date().getFullYear();
fetchAvailability().then(markAvailability);
