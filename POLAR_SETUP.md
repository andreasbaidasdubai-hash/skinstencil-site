# Polar product setup for Skinstencil (copy and paste)

Prices are in USD. Polar fees and limits are from polar.sh/resources/pricing (read 23 Nov 2026); check the current page when you sign up.

## 0. Before you start
- Decide which legal entity sells this. Options: Belline Technologies Ltd (DIFC), or a separate company. Ask your accountant about tax and which entity should receive payouts. Baidas AG (Zug) is not suitable.
- Do NOT reuse Belline's live Stripe account. Reasons are in the "Stripe question" section at the bottom.

## 1. Create the organisation
Sign up at polar.sh, create an organisation named "Skinstencil", complete the seller verification (identity and payout details). Polar is the merchant of record: it sells to your customers, collects and pays the sales tax and VAT, and pays you out.
Copy the organisation id (Settings) into `polarOrgId` in `js/config.js` later.

## 2. License key benefit (create it once per product, or once and attach it to all)
Create a benefit of type "License Keys":
- Prefix: `SKST`
- Activation limit: 2 (one artist on two devices; raise it if people complain)
- Expiration: set per product below.
- Show the key in the order confirmation email (default).

## 3. Products

### Product 1: Day pass
- Name: `Skinstencil day pass`
- Description: `24 hours without the watermark. Download and print clean stencils at true size, up to 4000 px, with the 300 dpi size inside the file. One payment, no subscription.`
- Pricing: one-time, USD 7.99 (changed from 4.99 on 26 Nov 2026: edit the existing product price in Polar, or create a new product and a new checkout link and paste it into `js/config.js`)
- Benefit: License Keys, expiration 1 day after purchase
- Checkout link success URL: `https://skinstencil.com/studio/?thanks=1`

### Product 1b: 7-day pass (new, 26 Nov 2026)
- Name: `Skinstencil 7-day pass`
- Description: `7 days without the watermark. Download and print clean stencils at true size, up to 4000 px, with the 300 dpi size inside the file. 30 AI designs and 10 realistic previews. One payment, no subscription.`
- Pricing: one-time, USD 14.99
- Benefit: License Keys, expiration 7 days after purchase (the Worker reads the key's lifetime to pick the plan limits)
- Paste its checkout link into `js/config.js` as `checkout.week`
- Checkout link success URL: `https://skinstencil.com/studio/?thanks=1`

### Product 2: Pro, monthly
- Name: `Skinstencil Pro, monthly`
- Description: `No watermark for as long as you subscribe. Clean downloads and prints at true size, up to 4000 px, 300 dpi size inside the file. New features first, such as AI cleanup and PDF export. Cancel any time.`
- Pricing: recurring monthly, USD 19 (changed from 12 on 26 Nov 2026)
- Benefit: License Keys, no fixed expiry (the key is revoked automatically when the subscription ends)
- Success URL: `https://skinstencil.com/studio/?thanks=1`

### Product 3: Pro, yearly
- Name: `Skinstencil Pro, yearly`
- Description: same as monthly, plus: `Billed once a year.`
- Pricing: recurring yearly, USD 149 (changed from 79 on 26 Nov 2026)
- Benefit: License Keys, no fixed expiry
- Success URL: `https://skinstencil.com/studio/?thanks=1`

## 4. Checkout links
For each product create a Checkout Link in Polar and copy its URL into `js/config.js`:
```js
polarOrgId: "<your organization id>",
checkout: { day: "<day pass link>", month: "<monthly link>", year: "<yearly link>" },
```
Commit and push `js/config.js`. All buy buttons (landing pages in every language, and the studio) switch from "opens soon" to real checkout automatically.

## 5. Test before going live
1. Use Polar's sandbox organisation first (its own id and links) and Stripe's test cards.
2. Buy the day pass. Check the email arrives with a key, paste it in the studio under "I have a license key", confirm the watermark disappears and the PNG downloads without it.
3. Check the key stops working after the day-pass expiry (or set a test product to expire in a short time).
4. Cancel a test subscription and confirm the key is revoked.
5. If the studio says "Could not reach the license server" in a normal browser, the browser blocked the call to Polar (CORS). Tell me and I will add a small proxy.

## 6. Customer support texts
- Lost key: customers can open the Polar customer portal (link in the order email) to see their keys.
- Refunds: set the policy in Polar's checkout settings and make it match `terms.html`.
- Subscription changes and cancellation: through the Polar customer portal.

## 7. Fees you will pay (new organisation, Starter plan) [M]
5% + USD 0.50 per transaction, plus 1.5% for international cards. Examples before the international surcharge: day pass USD 7.99 costs about USD 0.90 (11%); 7-day pass USD 14.99 about USD 1.25 (8%); Pro monthly USD 19 about USD 1.45 (8%); Pro yearly USD 149 about USD 7.95 (5%). Payouts: Stripe fees of USD 2 a month while active plus 0.25% + USD 0.25 per payout. A dispute costs USD 15.
At the prices set on 26 Nov 2026 the fixed USD 0.50 matters much less than before.

## The Stripe question: can we use the existing Stripe account?
Short answer: not Belline's account, and not directly with Polar.
- Polar pays you out through its own Stripe-based payout account that Polar sets up for your organisation. You cannot plug Belline's existing Stripe account into it.
- Using Belline's live Stripe account directly would make you the seller of record. Then you, not a provider, must register for and remit VAT, GST and US sales tax in every country where you sell, and Stripe has no license-key product, so you would also need a small server to issue keys. Selling a different product through Belline's account also mixes disputes and chargebacks into the account that runs your main business, and Belline's own rules say not to touch live providers lightly.
- If you still prefer Stripe only: Stripe Payment Links plus Stripe Tax for calculation, a separate Stripe account for Skinstencil, and a small Cloudflare Worker that listens to the Stripe webhook, creates a key and emails it. That is more work and more tax responsibility than Polar for a global USD 5 to 12 product.

## Signup and account review (read 25 Nov 2026 on polar.sh/docs/merchant-of-record)
Polar will not accept real payments until it approves your account. Build first, submit second.
1. Sign up at polar.sh and create the organisation. Add the website (https://skinstencil.com) and a support email on your domain. The support email is verified with a code, so hello@skinstencil.com must receive mail first.
2. Create the three products and checkout links in Polar's sandbox (sandbox.polar.sh) and test them. The sandbox is a separate organisation.
3. In the live organisation create the same products and attach the license key benefit. A reviewer wants to see a product, how checkout works and how the customer gets what they paid for.
4. Finance, then Account: complete the checklist. Required: identity verification of the organisation owner (Stripe Identity, an ID document and a selfie), a payout account (Stripe Connect Express, your country of tax residency and a bank account), a verified support email, a product description and a reachable website. Social links speed things up.
5. Before you submit, make sure the website shows what is sold, the prices, a working privacy page and terms with the operator name and address filled in, and the refund policy. Placeholders in square brackets will slow the review.
6. Submit for review. Initial reviews can take up to 14 days. Polar may ask you to email a 100% discount code so they can test your flow. After approval, put the live checkout links into js/config.js and push.

## Optional later: automatic unlock without pasting a key
Polar can send the buyer back to https://skinstencil.com/studio/?checkout_id={CHECKOUT_ID} (the success URL supports this placeholder). A small Cloudflare Worker holding a Polar access token can confirm that checkout and return the unlock, so the buyer never sees a key. It needs a free Cloudflare account and a Worker; ask for it once the sandbox works.
