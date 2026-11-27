/* Skinstencil design generator: a small Cloudflare Worker that sits between the studio page and the image provider (fal.ai).
   The provider key lives only here (a Worker secret), never in the page. Every request is limited, so a bad day cannot become a big bill
   and every paid plan keeps a high margin even for its heaviest user. The numbers are in LIMITS and BUDGET below; the arithmetic is in the pricing study.
     free   no license: 2 Bold designs per UTC day and 1 realistic preview per week, counted per network address. No Fine detail, no example picture.
     pass1  a day-pass key (valid 1 to 2 days) and pass7 a 7-day-pass key (valid up to 9 days): DESIGNS + PREVIEWS for the whole life of the key, not per day.
     pro    a Pro license key (monthly or yearly): a monthly pool, per calendar month (UTC).
   Two spending pools per UTC day, so free traffic can never block a customer who paid: BUDGET.free and BUDGET.paid (USD).
   Counters are kept in Workers KV, which is eventually consistent: the limits are firm to within a few requests, not to the cent.
   Two styles: "bold" = Recraft V4.1 vector (an SVG with solid lines), "detail" = GPT Image 2 (fine linework).
   When the visitor attaches an example picture, GPT Image 2 (edit mode) is always used: it is the model that can see a picture, and Recraft cannot.
   /place draws a finished design onto a stock skin photo (GPT Image 2 edit) for the "Show it realistic" button; it counts as a preview. */
const STYLES = {
  bold: { model: 'fal-ai/recraft/v4.1/text-to-vector', body: {}, cost: 0.08 },
  detail: { model: 'openai/gpt-image-2', body: { image_size: 'square_hd', quality: 'medium' }, cost: 0.06 },
};
const REF = { model: 'openai/gpt-image-2/edit', body: { image_size: 'square_hd', quality: 'medium' }, cost: 0.08 };
const PLACE = { model: 'openai/gpt-image-2/edit', body: { image_size: 'portrait_4_3', quality: 'medium' }, cost: 0.10 };
/* Worst case per customer = designs x 0.08 + previews x 0.10.
   Day pass (7.99): 15 x 0.08 + 5 x 0.10 = 1.70. 7-day pass (14.99): 30 x 0.08 + 10 x 0.10 = 3.40. Pro (19 a month / 149 a year): 60 x 0.08 + 15 x 0.10 = 6.30 a month. */
const LIMITS = {
  free: { designs: 2, previews: 1 },     // designs per UTC day, previews per week
  pass1: { designs: 15, previews: 5 },   // per day pass
  pass7: { designs: 30, previews: 10 },  // per 7-day pass
  pro: { designs: 60, previews: 15 },    // per calendar month
};
const DAY_PASS_MAX_DAYS = 2;   // a license key that lives at most this long is a day pass
const PASS_MAX_DAYS = 9;       // up to this long it is a 7-day pass; anything longer is Pro
const BUDGET = { free: 4, paid: 8 };    // USD per UTC day, each pool (env FREE_BUDGET_USD / PAID_BUDGET_USD override)
const PARTS = { shoulder: 'the shoulder blade', back: 'the middle of the upper back', forearm: 'the middle of the forearm, running along the arm', arm: 'the upper arm', chest: 'the centre of the chest', ribs: 'the ribs', thigh: 'the thigh', calf: 'the calf' };
const SITE = 'https://skinstencil.com';
const MAX_DATA = 2000000;   // characters of base64 a picture may carry
const isImg = v => typeof v === 'string' && v.length < MAX_DATA && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v);
/* The prompt is wrapped so every result is stencil-ready: black ink, white paper, no grey. */
const SUFFIX = ', tattoo stencil design, black ink line art on a plain white background, clean confident outlines, no color, no gray shading, no background texture, centered, full design visible';
const ORIGINS = ['https://skinstencil.com', 'https://www.skinstencil.com', 'http://localhost:8099', 'http://127.0.0.1:8099', 'http://127.0.0.1:8100'];

const day = () => new Date().toISOString().slice(0, 10);
const month = () => new Date().toISOString().slice(0, 7);
const week = () => String(Math.floor(Date.now() / (7 * 86400000)));
async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join(''); }
function cors(req) { const o = req.headers.get('Origin'); return { 'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0], 'Access-Control-Allow-Headers': 'Content-Type, X-License', 'Access-Control-Expose-Headers': 'X-Remaining, X-Style, X-Model, X-Plan', 'Vary': 'Origin' }; }
function json(req, status, obj) { return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors(req) } }); }
async function count(kv, k) { return parseInt((await kv.get(k)) || '0', 10) || 0; }
async function bump(kv, k, by, ttl) { const v = Math.max(0, (await count(kv, k)) + by); await kv.put(k, String(v), { expirationTtl: ttl }); return v; }

/* Polar's public license check. Returns the plan too: a key that is valid for at most DAY_PASS_MAX_DAYS in total is a day pass, up to PASS_MAX_DAYS a 7-day pass, a longer one is Pro.
   (Polar's response carries expires_at and, we expect, created_at. Without created_at the time left decides. Check this with the first real keys.) */
async function licenseInfo(env, key) {
  if (!key || !env.POLAR_ORG_ID) return null;
  try {
    const r = await fetch('https://api.polar.sh/v1/customer-portal/license-keys/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, organization_id: env.POLAR_ORG_ID }) });
    if (!r.ok) return null;
    const j = await r.json();
    if (j.status !== 'granted' || (j.expires_at && new Date(j.expires_at) <= new Date())) return null;
    let plan = 'pro';
    if (j.expires_at) {
      const end = new Date(j.expires_at).getTime(), start = j.created_at ? new Date(j.created_at).getTime() : Date.now();
      const days = (end - start) / 86400000;
      if (days <= DAY_PASS_MAX_DAYS) plan = 'pass1'; else if (days <= PASS_MAX_DAYS) plan = 'pass7';
    }
    return { plan };
  } catch (e) { return null; }
}

/* Cloudflare Turnstile: a free bot check. The page gets a one-time token from the visitor's browser; it is verified here before anything is counted or paid for.
   Enforced whenever the TURNSTILE_SECRET secret is set (worker/README.md), so scripts that skip the page cannot reach the image provider. */
async function humanOk(env, token, ip) {
  if (!token || token.length > 2048) return false;
  try {
    const f = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token }); if (ip) f.set('remoteip', ip);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: f });
    return r.ok && (await r.json()).success === true;
  } catch (e) { return false; }
}

/* Tattoo submissions (the "submit your tattoo" page). Nothing is uploaded: the sender links to their own Instagram post and we invite them to collaborate on it.
   What is kept is the permission record: who said yes, to what, when, and the exact wording they ticked. Read the list with
   `npx wrangler kv key list --binding LIMITS --prefix sub:20` and `... kv key get --binding LIMITS "<key>"` (worker/README.md). */
const CONSENT_V = 'v1: I made this tattoo or have the artist\'s permission. I allow Skinstencil to post it on Instagram with credit. I can ask for it to be removed at any time.';
const SUB_ROLES = ['artist', 'client', 'studio'];
const IG_HANDLE = /^@?[A-Za-z0-9._]{1,30}$/;
const IG_LINK = /^https:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv)\/[A-Za-z0-9_-]{4,}\/?(\?[^\s]*)?$/;
const MAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
async function submit(req, env) {
  if (!ORIGINS.includes(req.headers.get('Origin'))) return json(req, 403, { error: 'origin' });
  let b; try { b = await req.json(); } catch (e) { return json(req, 400, { error: 'bad' }); }
  if (b.website) return json(req, 200, { ok: true });   // the hidden field only a script fills in: say thanks, keep nothing
  const role = clean(b.role, 10), name = clean(b.name, 80), email = clean(b.email, 254), artist = clean(b.artist, 31), link = clean(b.link, 300), note = clean(b.note, 500), by = clean(b.by, 31);
  if (!SUB_ROLES.includes(role) || !name || !MAIL.test(email) || !IG_HANDLE.test(artist) || !IG_LINK.test(link) || (by && !IG_HANDLE.test(by))) return json(req, 400, { error: 'bad' });
  if (b.consent !== true) return json(req, 400, { error: 'consent' });
  if (env.TURNSTILE_SECRET && !(await humanOk(env, String(b.turnstile || ''), req.headers.get('CF-Connecting-IP')))) return json(req, 403, { error: 'bot' });
  const kv = env.LIMITS, ip = await sha(req.headers.get('CF-Connecting-IP') || 'x'), rl = `sub:rl:${ip}:${day()}`;
  if (await count(kv, rl) >= 5) return json(req, 429, { error: 'limit' });
  await bump(kv, rl, 1, 2 * 86400);
  const at = new Date().toISOString(), id = `sub:${at}:${(await sha(link + email)).slice(0, 8)}`;
  await kv.put(id, JSON.stringify({ at, role, name, email, artist: artist.replace(/^@/, ''), link, by: by.replace(/^@/, ''), note, consent: CONSENT_V, ipHash: ip }));
  return json(req, 200, { ok: true });
}

/* Which counter applies, how big it is and how long it is kept. */
function allowance(plan, placing, who) {
  const kind = placing ? 'p' : 'd', cap = LIMITS[plan][placing ? 'previews' : 'designs'];
  if (plan === 'free') return placing ? { k: `f:p:${who}:${week()}`, cap, ttl: 9 * 86400 } : { k: `f:d:${who}:${day()}`, cap, ttl: 2 * 86400 };
  if (plan === 'pass1' || plan === 'pass7') return { k: `s:${kind}:${who}`, cap, ttl: (PASS_MAX_DAYS + 1) * 86400 };
  return { k: `m:${kind}:${who}:${month()}`, cap, ttl: 35 * 86400 };
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname === '/health') return json(req, 200, { ok: true });
    if (req.method === 'POST' && url.pathname === '/submit') return submit(req, env);
    if (req.method !== 'POST' || (url.pathname !== '/generate' && url.pathname !== '/place')) return json(req, 404, { error: 'not_found' });
    if (!ORIGINS.includes(req.headers.get('Origin'))) return json(req, 403, { error: 'origin' });

    let b; try { b = await req.json(); } catch (e) { return json(req, 400, { error: 'bad' }); }
    const placing = url.pathname === '/place';
    const prompt = String(b.prompt || '').replace(/\s+/g, ' ').trim();
    const ref = !placing && b.ref ? b.ref : '';
    if (ref && !isImg(ref)) return json(req, 400, { error: 'bad' });
    const style = ref ? 'detail' : (STYLES[b.style] ? b.style : 'bold');
    const S = placing ? PLACE : ref ? REF : STYLES[style];
    if (placing) {
      if (!PARTS[b.part] || !/^t[1-6]$/.test(String(b.tone)) || !isImg(b.design)) return json(req, 400, { error: 'bad' });
    } else if (prompt.length > 200 || (prompt.length < 3 && !ref)) return json(req, 400, { error: 'bad' });

    if (env.TURNSTILE_SECRET && !(await humanOk(env, String(b.turnstile || ''), req.headers.get('CF-Connecting-IP')))) return json(req, 403, { error: 'bot' });

    const kv = env.LIMITS, d = day(), ip = req.headers.get('CF-Connecting-IP') || 'x';
    const lic = req.headers.get('X-License') || '', info = await licenseInfo(env, lic);
    const plan = info ? info.plan : 'free';
    // Fine detail and example pictures cost more and are part of the paid plans
    if (plan === 'free' && !placing && (ref || style === 'detail')) return json(req, 403, { error: 'paid_only' });

    const who = plan === 'free' ? await sha(ip) : await sha(lic), A = allowance(plan, placing, who);
    const pool = plan === 'free' ? 'free' : 'paid', budget = +(pool === 'free' ? (env.FREE_BUDGET_USD || BUDGET.free) : (env.PAID_BUDGET_USD || BUDGET.paid));
    const spendK = `spend:${pool}:${d}`, cents = Math.round(S.cost * 100);

    if (await count(kv, A.k) >= A.cap) return json(req, 429, { error: plan === 'free' ? 'limit_free' : 'limit_plan', plan, cap: A.cap });
    if ((await count(kv, spendK)) + cents > budget * 100) return json(req, 429, { error: 'budget', pool });
    // reserve first, give back if the provider fails
    const used = await bump(kv, A.k, 1, A.ttl); await bump(kv, spendK, cents, 2 * 86400);
    const refund = async () => { await bump(kv, A.k, -1, A.ttl); await bump(kv, spendK, -cents, 2 * 86400); };

    try {
      let payload;
      if (placing) {
        const x = Math.round(+b.x || 50), y = Math.round(+b.y || 50), sz = Math.round(+b.s || 45), rot = Math.round(+b.r || 0);
        payload = { prompt: `Place the tattoo design from the second image onto ${PARTS[b.part]} of the person in the first image, as a real healed black-ink tattoo: follow the curvature of the skin, match the lighting and shadows, keep skin texture visible through the ink, correct contrast for this skin tone. Centre it about ${x}% from the left and ${y}% from the top of the photo, about ${sz}% of the photo width, turned ${rot} degrees. Do not change the photo otherwise.`, image_urls: [SITE + '/assets/lib/' + b.part + '_' + b.tone + '.jpg', b.design], num_images: 1, ...S.body };
      } else if (ref) {
        const lead = b.refMode === 'trace' ? 'Redraw the subject of the picture as a clean tattoo design, keeping its composition: ' : 'Use the picture as inspiration for a new tattoo design: ';
        payload = { prompt: lead + (prompt || 'a tattoo design') + SUFFIX, image_urls: [ref], num_images: 1, ...S.body };
      } else payload = { prompt: prompt + SUFFIX, num_images: 1, ...S.body };
      const r = await fetch('https://fal.run/' + S.model, { method: 'POST', headers: { Authorization: 'Key ' + env.FAL_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) { await refund(); return json(req, 502, { error: 'upstream', status: r.status }); }
      const data = await r.json(), im = (data.images && data.images[0]) || data.image;
      if (!im || !im.url) { await refund(); return json(req, 502, { error: 'upstream' }); }
      const img = await fetch(im.url);
      if (!img.ok) { await refund(); return json(req, 502, { error: 'upstream' }); }
      const ct = im.content_type || img.headers.get('Content-Type') || 'image/png';
      return new Response(img.body, { status: 200, headers: { 'Content-Type': ct, 'Cache-Control': 'no-store', 'X-Remaining': String(Math.max(0, A.cap - used)), 'X-Plan': plan, 'X-Style': style, 'X-Model': placing ? 'place' : ref ? 'reference' : style, ...cors(req) } });
    } catch (e) { await refund(); return json(req, 502, { error: 'upstream' }); }
  },
};
