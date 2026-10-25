// "Get directions" map on the landing page: Leaflet (vendored) + OpenStreetMap tiles, routes from the
// public OSRM servers at routing.openstreetmap.de, and place search through Nominatim.
import { SITE } from "./site-config.js";
import { esc } from "./common.js";

const SHOP = SITE.location;
const ROUTER = "https://routing.openstreetmap.de";
const GEOCODER = "https://nominatim.openstreetmap.org/search";

// OSRM has no motorcycle or jeepney profile: both follow the car route, with their own time estimates.
const MODES = {
  walk:  { label: "Walk",       profile: "routed-foot/route/v1/foot",    google: "walking", note: "",
           fallback: route => route.distance / 1000 / 4.8 * 3600 },
  motor: { label: "Motorcycle", profile: "routed-car/route/v1/driving", google: "driving", note: "",
           time: route => route.duration * 0.85 },
  jeep:  { label: "Jeepney",    profile: "routed-car/route/v1/driving", google: "transit",
           time: route => route.distance / 1000 / 18 * 3600,
           note: "Ride a jeepney that runs along the National Highway through Pangil and ask the driver to drop you off at Balian. NAZ Coffee is right on the highway. The time shown excludes waiting." },
  car:   { label: "Car",        profile: "routed-car/route/v1/driving", google: "driving", note: "" }
};

let L, map, routeLayer, originMarker;
let mode = "car";
let origin = null; // { lat, lng, label }
let requestId = 0;

const $ = id => document.getElementById(id);

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  const css = document.createElement("link");
  css.rel = "stylesheet"; css.href = "/assets/vendor/leaflet/leaflet.css";
  document.head.append(css);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/assets/vendor/leaflet/leaflet.js";
    s.onload = () => resolve(window.L);
    s.onerror = reject;
    document.head.append(s);
  });
}

function initMap() {
  const streets = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
  });
  const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19, attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics"
  });

  map = L.map("dirMap", {
    center: [SHOP.lat, SHOP.lng], zoom: 17, layers: [streets],
    scrollWheelZoom: false, dragging: !L.Browser.mobile, tap: false
  });
  L.control.layers({ "Map": streets, "Satellite": satellite }, null, { position: "topright" }).addTo(map);
  L.control.scale({ imperial: false, position: "bottomright" }).addTo(map);
  // Let the page scroll past the map; wheel-zoom only once someone interacts with it.
  map.on("focus click", () => map.scrollWheelZoom.enable());
  map.on("blur mouseout", () => map.scrollWheelZoom.disable());
  // The map's height follows the panel (route steps, notes), so keep Leaflet in sync with its box.
  if ("ResizeObserver" in window) new ResizeObserver(() => map.invalidateSize()).observe($("dirMap"));

  const shopIcon = L.divIcon({
    className: "map-pin", iconSize: [52, 64], iconAnchor: [26, 62], popupAnchor: [0, -58],
    html: '<span class="map-pin-badge"><img src="/assets/img/brand/naz-logo-192.webp" alt=""></span>'
  });
  const pin = L.marker([SHOP.lat, SHOP.lng], { icon: shopIcon, title: "NAZ Coffee", keyboard: true })
    .addTo(map)
    .bindPopup(`<strong>NAZ Coffee</strong><br>${esc(SITE.address)}`, { maxWidth: 240, autoPanPadding: [12, 12] });
  // On narrow maps the popup would hide the pin, so only open it where there's room.
  if (map.getSize().x >= 420) pin.openPopup();
}

function formatDistance(m) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

function formatTime(sec) {
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

function stepText(step, isLast) {
  const { type, modifier = "", exit, bearing_after: bearing } = step.maneuver;
  const road = step.name || step.ref || "";
  const onto = road ? ` onto ${road}` : "";
  const turn = modifier === "straight" ? "Continue straight" : modifier === "uturn" ? "Make a U-turn" : `Turn ${modifier}`;
  if (type === "depart") return `Head ${COMPASS[Math.round(bearing / 45) % 8]}${road ? ` on ${road}` : ""}`;
  if (type === "arrive" || isLast) return "Arrive at NAZ Coffee, on the National Highway in Balian";
  if (type === "roundabout" || type === "rotary") return `At the roundabout, take exit ${exit || 1}${onto}`;
  if (type === "fork") return `Keep ${modifier.replace("slight ", "")} at the fork${onto}`;
  if (type === "merge") return `Merge${onto}`;
  if (type === "on ramp" || type === "off ramp") return `Take the ramp${onto}`;
  if (type === "new name" || type === "continue") return modifier && !modifier.includes("straight") ? `Bear ${modifier.replace("slight ", "")}${onto}` : `Continue${onto}`;
  return `${turn}${onto}`;
}

function setLinks() {
  const dest = `${SHOP.lat},${SHOP.lng}`;
  const from = origin ? `&origin=${origin.lat},${origin.lng}` : "";
  $("dirGoogle").href = `https://www.google.com/maps/dir/?api=1${from}&destination=${dest}&travelmode=${MODES[mode].google}`;
  $("dirWaze").hidden = mode === "walk" || mode === "jeep";
}

function setSummary(html) { $("dirSummary").innerHTML = html; }

async function route() {
  setLinks();
  if (!origin || !map) return;
  const id = ++requestId;
  const cfg = MODES[mode];
  setSummary(`<p class="dir-hint">Finding the ${cfg.label.toLowerCase()} route from ${esc(origin.label)}…</p>`);
  $("dirSteps").innerHTML = "";

  let data;
  const fetchRoute = async (profile, timeoutMs) => {
    const url = `${ROUTER}/${profile}/${origin.lng},${origin.lat};${SHOP.lng},${SHOP.lat}?overview=full&geometries=geojson&steps=true`;
    const data = await (await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })).json();
    if (data.code !== "Ok" || !data.routes?.length) throw new Error(data.code);
    return data.routes[0];
  };
  let r, seconds;
  try {
    r = await fetchRoute(cfg.profile, cfg.fallback ? 7000 : 20000);
    seconds = cfg.time ? cfg.time(r) : r.duration;
  } catch {
    // The public foot router is often slow; walk along the car route at walking pace instead.
    try { if (cfg.fallback) { r = await fetchRoute(MODES.car.profile, 20000); seconds = cfg.fallback(r); } } catch { r = null; }
  }
  if (id !== requestId) return; // a newer request superseded this one
  if (!r) {
    setSummary(`<p class="dir-error">We couldn't find a route from there. Try a nearby town or landmark, or open the route in Google Maps below.</p>`);
    return;
  }

  const line = r.geometry.coordinates.map(([lng, lat]) => [lat, lng]);

  routeLayer?.remove();
  routeLayer = L.layerGroup([
    L.polyline(line, { color: "#0b0908", weight: 9, opacity: .55 }),
    L.polyline(line, { color: mode === "walk" ? "#dda265" : "#c98a4b", weight: 5, opacity: .95, dashArray: mode === "walk" ? "2 9" : null, lineCap: "round" })
  ]).addTo(map);
  originMarker?.remove();
  originMarker = L.circleMarker([origin.lat, origin.lng], { radius: 8, color: "#fff", weight: 3, fillColor: "#3b82f6", fillOpacity: 1 })
    .addTo(map).bindTooltip(origin.label);
  map.closePopup();
  map.fitBounds(L.latLngBounds(line), { padding: [36, 36] });

  const longWalk = mode === "walk" && r.distance > 5000
    ? `<p class="dir-note">That's a long walk. A jeepney or tricycle along the highway is quicker.</p>` : "";
  setSummary(`
    <div class="dir-result">
      <span class="dir-time">${formatTime(seconds)}</span>
      <span class="dir-dist">${formatDistance(r.distance)} · ${cfg.label}${cfg.time ? " (estimate)" : ""}</span>
    </div>
    <p class="dir-from-label">From ${esc(origin.label)}</p>
    ${cfg.note ? `<p class="dir-note">${esc(cfg.note)}</p>` : ""}${longWalk}`);

  const steps = r.legs.flatMap(leg => leg.steps).filter((s, i, all) => s.distance > 0 || i === all.length - 1);
  $("dirSteps").innerHTML = steps.map((s, i) => `<li>
      <span class="dir-step-text">${esc(stepText(s, i === steps.length - 1))}</span>
      ${s.distance > 0 ? `<span class="dir-step-dist">${formatDistance(s.distance)}</span>` : ""}
    </li>`).join("");
}

async function searchPlace(query) {
  setSummary(`<p class="dir-hint">Looking up “${esc(query)}”…</p>`);
  try {
    const url = `${GEOCODER}?format=jsonv2&limit=1&countrycodes=ph&viewbox=121.15,14.65,121.75,14.05&q=${encodeURIComponent(query)}`;
    const [hit] = await (await fetch(url, { headers: { "accept-language": "en" } })).json();
    if (!hit) throw new Error("not found");
    origin = { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name.split(",").slice(0, 2).join(",") };
    route();
  } catch {
    setSummary(`<p class="dir-error">We couldn't find “${esc(query)}”. Try a town or landmark, like “Siniloan” or “Paete Church”.</p>`);
  }
}

function locate() {
  if (!navigator.geolocation) {
    setSummary(`<p class="dir-error">Your browser can't share its location. Type where you're coming from instead.</p>`);
    return;
  }
  setSummary(`<p class="dir-hint">Getting your location…</p>`);
  navigator.geolocation.getCurrentPosition(
    pos => { origin = { lat: pos.coords.latitude, lng: pos.coords.longitude, label: "your location" }; route(); },
    () => setSummary(`<p class="dir-error">We couldn't get your location. Allow location access, or type where you're coming from.</p>`),
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
  );
}

function bindControls() {
  for (const btn of document.querySelectorAll(".dir-modes button")) {
    btn.addEventListener("click", () => {
      mode = btn.dataset.mode;
      for (const b of document.querySelectorAll(".dir-modes button")) b.setAttribute("aria-pressed", String(b === btn));
      route();
    });
  }
  $("dirFrom").addEventListener("submit", e => {
    e.preventDefault();
    const q = $("dirOrigin").value.trim();
    if (q) searchPlace(q);
  });
  $("dirLocate").addEventListener("click", locate);
  setLinks();
}

export function initDirections() {
  const section = $("directions");
  if (!section || !SHOP) return;
  bindControls();
  const start = () => loadLeaflet().then(lib => { L = lib; initMap(); route(); })
    .catch(() => { $("dirMap").innerHTML = `<p class="dir-error">The map couldn't load. Use the Google Maps button instead.</p>`; });
  // Only fetch Leaflet and tiles when the map is about to scroll into view.
  if (!("IntersectionObserver" in window)) { start(); return; }
  const io = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) { io.disconnect(); start(); }
  }, { rootMargin: "400px 0px" });
  io.observe(section);
}
