# Design generator Worker

Sits between the studio page and fal.ai so the provider key never reaches the browser, and limits spending.

One-time setup (about 5 minutes, needs your Cloudflare login):

```
cd worker
npx wrangler login
npx wrangler kv namespace create LIMITS        # paste the printed id into wrangler.toml
npx wrangler secret put FAL_KEY                # paste a NEW fal key (not the one used for testing)
npx wrangler deploy
```

Wrangler prints the Worker address (`https://skinstencil-generate.<you>.workers.dev`). Put it in `js/config.js` as `generatorUrl`, run `node src/build.mjs`, commit, push. Until `generatorUrl` is set the generator is not drawn on the page.

Limits (changed 26 Nov 2026, see the pricing study): the numbers are in `index.js` (`LIMITS`, `BUDGET`), the two spending pools can be overridden in `wrangler.toml` (`FREE_BUDGET_USD`, `PAID_BUDGET_USD`).
- Free (no license): 2 Bold designs per UTC day and 1 realistic preview per week, per network address. No Fine detail and no example picture (the Worker answers `paid_only`).
- Day pass: 20 designs and 6 realistic previews for the whole life of the key, not per day.
- Pro (monthly or yearly): 60 designs and 15 realistic previews per calendar month.
- Pools per UTC day: free 4 USD, paid 8 USD. When the free pool is empty, paying customers are still served.
- Plan detection: a license key valid for 9 days or less in total (expires_at minus created_at, else the time left) is a day pass, anything longer is Pro. So the day pass benefit in Polar must expire the key, and Pro keys must not. Check this with the first real keys; if Polar does not return created_at, a Pro key that has an expiry set in the last 9 days of its period would be treated as a pass.
- Worst case per customer: day pass 2.20 USD of AI against 13.63 net; Pro monthly 6.30 against 26.83; Pro yearly 6.30 a month against 15.6.

Costs per call: bold (Recraft vector) 0.08 USD, detail (GPT Image 2) about 0.06 USD (priced by tokens, so the real figure can differ slightly; check the fal dashboard).

## Bot check (Cloudflare Turnstile, free)

1. Cloudflare dashboard -> Turnstile -> Add widget. Hostnames: `skinstencil.com` (add `www.skinstencil.com` if used). Mode: Managed. Copy the **site key** and the **secret key**.
2. `cd worker`, then `npx wrangler secret put TURNSTILE_SECRET` and paste the secret key. From then on the Worker refuses every request without a valid token.
3. Put the site key in `js/config.js` as `turnstileSiteKey`, run `node src/build.mjs`, commit, push.

Order with no gap: (1) push the page with `turnstileSiteKey` set (the old Worker ignores the extra token), (2) `npx wrangler deploy` to publish the Worker with the check, (3) `npx wrangler secret put TURNSTILE_SECRET`. If the secret is set before the page has the site key, the generator shows "could not confirm you are a person" until the push lands.

## Example picture and "Show it realistic" (added with the workstation page)

Two things now go through the Worker besides the text prompt, both with the same Turnstile check, license lookup and daily budget:

- `POST /generate` accepts `ref` (a data: URL of a picture, at most about 2 MB, png/jpeg/webp) and `refMode` (`inspire` or `trace`). With a picture the Worker always uses `openai/gpt-image-2/edit` (about 0.08 USD), because Recraft cannot see a picture. The page shrinks and re-encodes the picture first, which also removes its metadata.
- `POST /place` draws a finished design onto one of the stock skin photos (`https://skinstencil.com/assets/lib/<part>_<tone>.jpg`, 48 files in this repo) with `openai/gpt-image-2/edit` (about 0.10 USD). Its own allowance: 1 per day without a license, 10 with one (`PLACE_PER_DAY` in `index.js`); it also counts against `DAILY_BUDGET_USD`.

Deploy order with no gap: (1) push the site (the new page then calls `/place`, which the old Worker answers with 404, so the "realistic" button shows a failure message until step 2), (2) `cd worker && npx wrangler deploy`. The stock photos must be live on skinstencil.com before `/place` can fetch them, so push first.
