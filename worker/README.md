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

Limits live in `wrangler.toml`: `FREE_PER_DAY` (visitors without a license), `PAID_PER_DAY` (with a valid key), `DAILY_BUDGET_USD` (everyone together; the Worker refuses once it is reached). Change a value, run `npx wrangler deploy`.

Costs per design: bold (Recraft vector) 0.08 USD, detail (GPT Image 2) about 0.06 USD (priced by tokens, so the real figure can differ slightly; check the fal dashboard).
