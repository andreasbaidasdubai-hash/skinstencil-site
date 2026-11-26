/* Skinstencil design generator: a small Cloudflare Worker that sits between the studio page and the image provider (fal.ai).
   The provider key lives only here (a Worker secret), never in the page. Every request is limited three ways, so a bad day cannot become a big bill:
     1. visitors without a license key get FREE_PER_DAY designs per day (counted per network address),
     2. a valid license key (checked against Polar's public endpoint) gets PAID_PER_DAY per day,
     3. a hard daily spending ceiling, DAILY_BUDGET_USD, for everyone together.
   Counters are kept in Workers KV, which is eventually consistent: the limits are firm to within a few requests, not to the cent.
   Two styles: "bold" = Recraft V4.1 vector (an SVG with solid lines), "detail" = GPT Image 2 (fine linework).
   When the visitor attaches an example picture, GPT Image 2 (edit mode) is always used: it is the model that can see a picture, and Recraft cannot.
   /place draws a finished design onto a stock skin photo (GPT Image 2 edit) for the "Show it realistic" button; it has its own small daily allowance. */
const STYLES = {
  bold: { model: 'fal-ai/recraft/v4.1/text-to-vector', body: {}, cost: 0.08 },
  detail: { model: 'openai/gpt-image-2', body: { image_size: 'square_hd', quality: 'medium' }, cost: 0.06 },
};
/* The prompt is wrapped so every result is stencil-ready: black ink, white paper, no grey. */
const REF = { model: 'openai/gpt-image-2/edit', body: { image_size: 'square_hd', quality: 'medium' }, cost: 0.08 };
const PLACE = { model: 'openai/gpt-image-2/edit', body: { image_size: 'portrait_4_3', quality: 'medium' }, cost: 0.10 };
const PLACE_PER_DAY = { free: 1, paid: 10 };
const PARTS = { shoulder: 'the shoulder blade', back: 'the middle of the upper back', forearm: 'the middle of the forearm, running along the arm', arm: 'the upper arm', chest: 'the centre of the chest', ribs: 'the ribs', thigh: 'the thigh', calf: 'the calf' };
const SITE = 'https://skinstencil.com';
const MAX_DATA = 2000000;   // characters of base64 a picture may carry
const isImg = v => typeof v === 'string' && v.length < MAX_DATA && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v);
const SUFFIX = ', tattoo stencil design, black ink line art on a plain white background, clean confident outlines, no color, no gray shading, no background texture, centered, full design visible';
const ORIGINS = ['https://skinstencil.com', 'https://www.skinstencil.com', 'http://localhost:8099', 'http://127.0.0.1:8099', 'http://127.0.0.1:8100'];

const day = () => new Date().toISOString().slice(0, 10);
async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join(''); }
function cors(req) { const o = req.headers.get('Origin'); return { 'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0], 'Access-Control-Allow-Headers': 'Content-Type, X-License', 'Access-Control-Expose-Headers': 'X-Remaining, X-Style, X-Model', 'Vary': 'Origin' }; }
function json(req, status, obj) { return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors(req) } }); }
async function count(kv, k) { return parseInt((await kv.get(k)) || '0', 10) || 0; }
async function bump(kv, k, by) { const v = Math.max(0, (await count(kv, k)) + by); await kv.put(k, String(v), { expirationTtl: 2 * 86400 }); return v; }

async function licenseOk(env, key) {
  if (!key || !env.POLAR_ORG_ID) return false;
  try {
    const r = await fetch('https://api.polar.sh/v1/customer-portal/license-keys/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, organization_id: env.POLAR_ORG_ID }) });
    if (!r.ok) return false;
    const j = await r.json(); return j.status === 'granted' && !(j.expires_at && new Date(j.expires_at) <= new Date());
  } catch (e) { return false; }
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

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname === '/health') return json(req, 200, { ok: true });
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
    const lic = req.headers.get('X-License') || '', paid = await licenseOk(env, lic);
    const who = paid ? 'lic:' + await sha(lic) : 'ip:' + await sha(ip), cap = placing ? (paid ? PLACE_PER_DAY.paid : PLACE_PER_DAY.free) : paid ? +(env.PAID_PER_DAY || 30) : +(env.FREE_PER_DAY || 2);
    const budget = +(env.DAILY_BUDGET_USD || 10), spendK = 'spend:' + d, whoK = who + (placing ? ':place:' : ':') + d;

    if (await count(kv, whoK) >= cap) return json(req, 429, { error: paid ? 'limit_paid' : 'limit_free', cap });
    const spentCents = await count(kv, spendK);
    if (spentCents + Math.round(S.cost * 100) > budget * 100) return json(req, 429, { error: 'budget' });
    // reserve first, give back if the provider fails
    const used = await bump(kv, whoK, 1); await bump(kv, spendK, Math.round(S.cost * 100));
    const refund = async () => { await bump(kv, whoK, -1); await bump(kv, spendK, -Math.round(S.cost * 100)); };

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
      return new Response(img.body, { status: 200, headers: { 'Content-Type': ct, 'Cache-Control': 'no-store', 'X-Remaining': String(Math.max(0, cap - used)), 'X-Style': style, 'X-Model': placing ? 'place' : ref ? 'reference' : style, ...cors(req) } });
    } catch (e) { await refund(); return json(req, 502, { error: 'upstream' }); }
  },
};
