# Switching on checkout (Polar, merchant of record)

The site is built so checkout can be switched on by editing ONE file: `js/config.js`. Until then every "buy" button honestly says checkout opens soon and offers an email link.

## The model
- Free: unlimited stencils, all controls. Downloads carry a diagonal "skinstencil.com" watermark and are capped at 800 px.
- Day pass (test price USD 4.99): 24 hours, no watermark, up to 4000 px, PNG carries 300 dpi so print software uses true size.
- Pro (test prices USD 12 a month, USD 79 a year): same, for as long as the subscription runs.
- Studio (from USD 49 a month): in development; email interest only.
Why this shape: the preview stays clean so the tool sells itself; only the file you take away is gated. A day pass is the "one click, one time" option for an artist who needs a single clean stencil; Pro is for daily users.

## Fees to expect [M, polar.sh/resources/pricing, cached 23 Nov 2026]
New Polar organisations pay 5% + USD 0.50 per transaction, plus 1.5% on international cards; payouts have separate Stripe fees (USD 2 a month while active, 0.25% + USD 0.25 per payout); a dispute costs USD 15. On a USD 4.99 day pass that is about USD 0.75 (15%), on USD 12 about USD 1.10 (9%), on USD 79 about USD 4.45 (6%), before the international surcharge. Cheaper tiers exist at higher volume. Tiny one-off prices are expensive to process: if day passes dominate, raise the price or bundle.

## Steps (you do these; I cannot create accounts)
1. Create a Polar organisation (polar.sh) and complete its seller verification. Use the entity you decided on (a DIFC company is the plan); ask an accountant about tax and payout.
2. Create three products: "Day pass" (one-time), "Pro monthly" and "Pro yearly" (subscriptions). Add a License Key benefit to each. For the day pass set the key to expire after 1 day. For subscriptions the key is revoked automatically when the subscription ends. Optional: limit activations to 2 devices.
3. For each product create a checkout link. Paste them into `js/config.js` under `checkout.day`, `checkout.month`, `checkout.year`, and put your organization id in `polarOrgId`.
4. Test in Polar's sandbox first (a sandbox organisation has its own id and links), then switch to live.
5. Rebuild is NOT needed for config changes. Commit and push `js/config.js`. Buy buttons on the landing pages and in the studio turn into real checkout links automatically.
6. Fill the refund terms in Polar's checkout settings and keep `terms.html` in line.

## How unlocking works
After paying, the customer gets a license key by email. In the studio they open "I have a license key", paste it, and the studio checks it with Polar's public validation endpoint (`POST https://api.polar.sh/v1/customer-portal/license-keys/validate` with the key and your organization id; Polar documents this for use from an app without your own server [M]). The result is kept in the browser and re-checked every few hours.

## Honest limits
- This is a light lock for a low-priced tool, not copy protection: someone technical can bypass a watermark that is applied in the browser, and a key can be shared unless you limit activations.
- It is two steps (pay, then paste the key), not literally one click. Checkout itself can be quick, but whether Apple Pay or Google Pay appear depends on Polar and your settings (unverified). A one-click return (a success page that unlocks automatically) needs a small server or Cloudflare Worker to read the key; add it later if conversion shows the paste step hurts.
- The browser call to Polar's endpoint has not been tested against the live service. If the browser blocks it (CORS) the studio shows "could not reach the license server"; the fix is a small proxy.
- Prices are tests. Watch conversion from "Remove the watermark" to checkout before changing anything.
