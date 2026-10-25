// Business details shown on the website. Anything left empty is simply not displayed, so only
// fill in details that are official and current. Nothing here is secret.
export const SITE = {
  name: "NAZ Coffee",
  tagline: "Never an empty cup",

  // Shown in "Visit us" and the footer when set.
  address: "9FWG+2JC, National Hwy, Balian, Pangil, 4018 Laguna",
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=14.395062,121.476516",

  // Map pin for the directions map. Decoded from the plus code 9FWG+2JC (Pangil, Laguna).
  location: { lat: 14.395062, lng: 121.476516, plusCode: "9FWG+2JC" },
  hours: [],                   // e.g. [["Mon – Fri", "7:00 AM – 9:00 PM"], ["Sat – Sun", "8:00 AM – 10:00 PM"]]
  phone: "",                   // public shop number, e.g. "0917 000 0000"
  email: "",

  social: {
    facebook: "",              // full https:// URLs
    instagram: "",
    tiktok: ""
  },

  // GCash details shown at checkout (unchanged from the original ordering page).
  gcash: { name: "Patrick Sutare", number: "0917 274 1129", qr: "/assets/img/brand/gcash-qr.jpg" },

  // Analytics IDs carried over from the original site. Set to "" to disable.
  analytics: { ga4: "G-6HN28KX89R", metaPixel: "570752581716611" }
};
