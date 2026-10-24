import "./analytics.js";
import { MENU, DELIVERY_AREAS } from "/shared/menu.js";
import { findItem, money } from "/shared/pricing.js";
import { SITE } from "./site-config.js";
import { esc, initHeader, initReveal, fetchAvailability } from "./common.js";

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

initHeader();
renderChips();
renderVisit();
renderFeatured();
initReveal();
document.getElementById("year").textContent = new Date().getFullYear();
fetchAvailability().then(markAvailability);
