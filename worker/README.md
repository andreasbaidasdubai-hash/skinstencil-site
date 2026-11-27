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
- Day pass (7.99 USD): 15 designs and 5 realistic previews for the whole life of the key, not per day.
- 7-day pass (14.99 USD): 30 designs and 10 realistic previews for the whole pass.
- Pro (19 USD a month or 149 a year): 60 designs and 15 realistic previews per calendar month.
- Pools per UTC day: free 4 USD, paid 8 USD. When the free pool is empty, paying customers are still served. A paid pool of 8 USD is about 2 customers spending their whole allowance in one day; typical use is far lower. Raise `PAID_BUDGET_USD` as paying customers grow, and watch the number of `budget` answers to paid keys (target zero).
- Plan detection: a license key valid for 2 days or less in total (expires_at minus created_at, else the time left) is a day pass, up to 9 days a 7-day pass, longer is Pro. So the pass benefits in Polar must expire their keys, and Pro keys must not. Check this with the first real keys.
- Worst case per customer (all allowance used): day pass 1.70 USD of AI against 7.03 net; 7-day pass 3.40 against 13.63; Pro monthly 6.30 against 17.41; Pro yearly 6.30 a month against 11.7.

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

## Tattoo submissions

The Submit your tattoo page (`/submit/`) posts to `POST /submit`. The Worker checks the fields, the bot check and a limit of 5 per network address per day, then stores one KV entry per submission under `sub:<date>:<code>` in the same `LIMITS` namespace. Nothing is uploaded: the sender links to their own Instagram post. The entry keeps the permission wording the sender ticked (`consent`), so we can show we asked.

Read them (no secret needed, only your Cloudflare login):

```
npx wrangler kv key list --binding LIMITS --prefix sub:20
npx wrangler kv key get --binding LIMITS "<key from the list>"
```
