# NAZ Coffee website

Brand landing page and online ordering for NAZ Coffee: *Never an empty cup.*

- `/` is the landing page: hero, featured drinks, story, the NAZ experience, Naz Rewards, and visit info.
- `/order` is online ordering: menu, product options, cart, checkout and confirmation.
- `/privacy` is a plain-language note on how order details are used.

## Run it

Requires Node.js 20.12 or newer. There are no dependencies to install.

```bash
npm start          # http://localhost:3000  (dry-run by default)
npm run dev        # same, restarts on server file changes
npm test           # unit + integration tests
```

Configuration lives in environment variables; see `.env.example`. If a `.env` file exists, it is loaded automatically.

### Dry-run vs live

| | `NAZ_MODE=dry-run` (default) | `NAZ_MODE=live` |
|---|---|---|
| Menu availability | read from the live backend (read-only) | read from the live backend |
| Orders | validated and priced, then **logged only** | sent to the order board and Google Form |
| Naz Rewards | in-memory test accounts | real rewards backend |
| Confirmation screen | shows a "Test mode" banner | normal |

## How it fits together

```
browser ──► server/server.js ──► server/orders.js ──► existing NAZ backend (/api/naz)
   │              │                    │                 · getMenuAvailability
   │              │                    │                 · getLoyaltyAccount / createLoyaltyAccount
   │              │                    │                 · sendWebOrderNotification
   │              │                    │                 · recordLoyaltyOrder
   │              │                    └──────────────► Google Form backup (formResponse)
   └── /shared/menu.js + pricing.js ◄──┘  (the same files price the cart in the browser and on the server)
```

- **`shared/menu.js`** is the single source of truth for products, prices, options, delivery fees and promotion rules. To change a price or add an item, edit this file. Add the item's photo to `public/assets/img/menu/` as `<id>.webp`.
- The browser sends only item ids, options and quantities. The server re-prices every order, checks live availability, verifies rewards eligibility, and rejects anything a customer could have tampered with.
- Orders reach the existing order board and Google Form in **exactly the same payload shapes as before**, so staff tooling keeps working.
- Each checkout attempt carries a `clientOrderId`. Retries and double taps never create a second order. An identical order sent again within 10 minutes is flagged, and the customer has to confirm before it's sent.
- Menu availability is still managed in the existing backend. Items marked unavailable there are disabled on the site.

```
public/                 static site
  index.html            landing page
  order.html            ordering app
  privacy.html, 404.html
  assets/css            base.css (design system), landing.css, order.css
  assets/js             landing.js, order.js, cart.js, common.js, analytics.js, site-config.js, boot.js
  assets/img/menu       product photos (65), retrieved from the original site
  assets/img/brand      official logo, icons, GCash QR
  assets/fonts          Fraunces + Manrope (self-hosted, OFL)
shared/                 menu data + pricing rules (browser and server)
server/                 Node HTTP server, order pipeline, backend gateway
tests/                  node:test suites
```

## Business details

Edit `public/assets/js/site-config.js` to add the shop address, hours, phone, email and social links. Empty fields are not shown. The GCash details and analytics IDs (GA4, Meta Pixel) were carried over from the original site and are also set there.

## Going live checklist

1. Deploy anywhere that runs Node (a VPS, Render, Railway, Fly.io and so on) and set `NAZ_MODE=live`.
2. Behind a proxy or CDN, set `TRUST_PROXY=on`.
3. Place **one real test order** and confirm it appears on the order board, in the Google Form responses and in Naz Rewards. These live paths could not be exercised during development without creating real orders.
4. Fill in `site-config.js` with official contact details and social links.
5. Review `privacy.html` and the landing-page story copy.
