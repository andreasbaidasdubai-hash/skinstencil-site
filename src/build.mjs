// Builds the static site from templates and string files. Run: node src/build.mjs
// English lives at the site root; every other language lives under /<code>/ (home, studio and brow mapping).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://skinstencil.com';
const NOTIFY = 'hello@skinstencil.com';
// Brow mapping is switched off for now (the product starts with tattoos). Everything for it stays in the repo; set this to true to bring it back.
const SHOW_BROW = false;

const LANGS = [
  { code: 'en', name: 'English',          locale: 'en_US', dir: 'ltr', regions: ['en-US', 'en-GB', 'en-AU', 'en-CA', 'en-AE', 'en-NG', 'en-IE', 'en-NZ'] },
  { code: 'de', name: 'Deutsch',          locale: 'de_DE', dir: 'ltr', regions: ['de-DE', 'de-AT', 'de-CH'] },
  { code: 'fr', name: 'Français',         locale: 'fr_FR', dir: 'ltr', regions: ['fr-FR', 'fr-BE', 'fr-CH', 'fr-CA'] },
  { code: 'es', name: 'Español',          locale: 'es_ES', dir: 'ltr', regions: ['es-ES', 'es-MX', 'es-AR', 'es-CO', 'es-CL', 'es-US'] },
  { code: 'pt', name: 'Português',        locale: 'pt_BR', dir: 'ltr', regions: ['pt-BR', 'pt-PT'] },
  { code: 'it', name: 'Italiano',         locale: 'it_IT', dir: 'ltr', regions: ['it-IT', 'it-CH'] },
  { code: 'nl', name: 'Nederlands',       locale: 'nl_NL', dir: 'ltr', regions: ['nl-NL', 'nl-BE'] },
  { code: 'tr', name: 'Türkçe',           locale: 'tr_TR', dir: 'ltr', regions: ['tr-TR'] },
  { code: 'ar', name: 'العربية',          locale: 'ar_AR', dir: 'rtl', regions: ['ar-AE', 'ar-SA', 'ar-QA', 'ar-KW', 'ar-BH', 'ar-OM', 'ar-EG'] },
  { code: 'pl', name: 'Polski',           locale: 'pl_PL', dir: 'ltr', regions: ['pl-PL'] },
];

const read = p => readFileSync(path.join(ROOT, p), 'utf8');
const en = JSON.parse(read('src/strings/en.json'));
const TPL = { index: read('src/index.tpl.html'), studio: read('src/studio.tpl.html'), brow: read('src/brow.tpl.html'), gen: read('src/generator.tpl.html'), guide: read('src/guide.tpl.html') };

// Brow mapping strings live in their own files, src/brow/<code>.json (keys without prefix); they reach the templates as {{brow.<key>}}.
// A key missing in a language falls back to English, with a warning.
const browOf = code => { const f = path.join(ROOT, 'src/brow', code + '.json'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };
const enBrow = browOf('en');

// Guides: one JSON per language in src/guides/<code>.json. A language without a file is skipped silently.
const GUIDES = {};
for (const l of LANGS) {
  const f = path.join(ROOT, 'src/guides', l.code + '.json');
  if (!existsSync(f)) continue;
  const g = JSON.parse(readFileSync(f, 'utf8'));
  g.order = (g.order || Object.keys(g.guides)).filter(s => g.guides[s]);
  if (g.order.length) GUIDES[l.code] = g;
}
// Languages that have a given guide (slug null = the guides index), in LANGS order; the first is the x-default.
const guideLangs = slug => LANGS.filter(l => GUIDES[l.code] && (slug === null || GUIDES[l.code].guides[slug]));

// AI design generator page strings: src/gen/<code>.json (keys without prefix) reach every template as {{gen.<key>}}; missing keys fall back to English.
const genOf = code => { const f = path.join(ROOT, 'src/gen', code + '.json'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };
const enGen = genOf('en');
function genStrings(l) {
  const own = genOf(l.code) || {}, out = {};
  for (const k of Object.keys(enGen)) { if (!(k in own) && l.code !== 'en') console.warn(`[${l.code}] missing gen key ${k}, using English`); out['gen.' + k] = k in own ? own[k] : enGen[k]; }
  return out;
}

const baseOf = l => (l.code === 'en' ? '/' : `/${l.code}/`);
const urlOf = (l, page) => baseOf(l) + (page === 'studio' ? 'studio/' : page === 'brow' ? 'brow/' : page === 'gen' ? 'ai-tattoo-generator/' : page === 'guides' ? 'guides/' : page.startsWith('guide:') ? 'guides/' + page.slice(6) + '/' : '');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function browStrings(l) {
  const own = browOf(l.code) || {}, out = {};
  for (const k of Object.keys(enBrow)) { if (!(k in own) && l.code !== 'en') console.warn(`[${l.code}] missing brow key ${k}, using English`); out['brow.' + k] = k in own ? own[k] : enBrow[k]; }
  return out;
}
function strings(l) {
  if (l.code === 'en') return { ...en, ...browStrings(l), ...genStrings(l) };
  const f = path.join(ROOT, 'src/strings', l.code + '.json');
  if (!existsSync(f)) { console.warn('missing strings for', l.code, '- falling back to English'); return { ...en, ...browStrings(l), ...genStrings(l) }; }
  const own = JSON.parse(readFileSync(f, 'utf8'));
  for (const k of Object.keys(en)) if (!(k in own)) console.warn(`[${l.code}] missing key ${k}, using English`);
  return { ...en, ...own, ...browStrings(l), ...genStrings(l) };
}
function hreflang(page, only) {
  const out = [];
  for (const l of (only || LANGS)) {
    out.push(`<link rel="alternate" hreflang="${l.code}" href="${SITE}${urlOf(l, page)}">`);
    for (const r of l.regions) out.push(`<link rel="alternate" hreflang="${r}" href="${SITE}${urlOf(l, page)}">`);
  }
  out.push(`<link rel="alternate" hreflang="x-default" href="${SITE}${urlOf((only || LANGS)[0], page)}">`);
  return out.join('\n');
}
function langSelect(cur, page, S, only, label) {
  const opts = (only || LANGS).map(l => `<option value="${urlOf(l, page)}"${l.code === cur.code ? ' selected' : ''} lang="${l.code}">${l.name}</option>`).join('');
  return `<select class="langsel" id="langSel" aria-label="${esc(label || S['lang.label'])}">${opts}</select>`;
}
function i18nJson(S, prefixes) {
  const o = {}; for (const k of Object.keys(S)) if (prefixes.some(p => k.startsWith(p))) o[k] = S[k];
  return JSON.stringify(o).replace(/</g, '\\u003c');
}


// The workstation (generator, body map, stencil maker, scenes) is shared by the homepage and the generator page: one markup file, one stylesheet.
// Its stylesheet is scoped to .wsx so it cannot touch the page around it; a selector starting with & attaches to the wrapper itself (language and direction classes).
function scopeCss(css, scope) {
  let i = 0; const out = [];
  function block(inMedia) {
    while (i < css.length) {
      const open = css.indexOf('{', i), close = css.indexOf('}', i);
      if (inMedia && close !== -1 && (open === -1 || close < open)) { i = close + 1; return; }
      if (open === -1) { out.push(css.slice(i)); i = css.length; return; }
      const head = css.slice(i, open).replace(/\/\*[\s\S]*?\*\//g, '').trim(); i = open + 1;
      if (head.startsWith('@media')) { out.push(head + '{'); block(true); out.push('}'); continue; }
      const end = css.indexOf('}', i), body = css.slice(i, end); i = end + 1;
      if (!head) continue;
      out.push(head.split(',').map(sel => { sel = sel.trim(); return sel.startsWith('&') ? scope + sel.slice(1) : sel.startsWith(':root') ? scope + sel.slice(5) : scope + ' ' + sel; }).join(',') + '{' + body + '}');
    }
  }
  block(false); return out.join('\n');
}
const WS_TOKENS = '.wsx{--paper:#F4F1EA;--card:#FBFAF6;--ink:#1D1B19;--muted:#6F6A63;--line:rgba(29,27,25,.16);--stencil:#4F35C8;--stencil-soft:#E9E5F9;--ok:#1F7A4C;--bad:#B42318;color:var(--ink);background:var(--paper);color-scheme:light;font-size:17px;line-height:1.6}';
const WS_CSS = WS_TOKENS + '\n' + scopeCss(read('src/ws.css'), '.wsx');
// One header and one footer for every page, so the site reads as one site.
function siteHead(l, S, page, lsel) {
  const G = GUIDES[l.code], cur = k => (page === k ? ' aria-current="page"' : '');
  return `<div class="sh"><div class="wrap"><a class="mark" href="${baseOf(l)}">skin<span>stencil</span></a><nav>` +
    `<a href="${urlOf(l, 'studio')}"${cur('studio')}>Studio</a>` + (SHOW_BROW ? `<a href="${urlOf(l, 'brow')}"${cur('brow')}>${ent(S['tab.brow'])}</a>` : '') +
    (G ? `<a href="${urlOf(l, 'guides')}"${cur('guides')}>${ent(G.ui.guides)}</a>` : '') +
    `<a href="${baseOf(l)}#pricing">${ent(S['nav.pricing'])}</a></nav>${lsel}` +
    `<button class="shbtn" type="button" aria-expanded="false" aria-label="${esc(S['gen.w.menu'] || 'Menu')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button></div></div>` +
    `<script>(function(){var h=document.querySelector('.sh'),b=h&&h.querySelector('.shbtn');if(!b)return;function set(o){h.classList.toggle('open',o);b.setAttribute('aria-expanded',String(o))}b.addEventListener('click',function(e){e.stopPropagation();set(!h.classList.contains('open'))});h.querySelectorAll('nav a').forEach(function(a){a.addEventListener('click',function(){set(false)})});document.addEventListener('click',function(e){if(!h.contains(e.target))set(false)});document.addEventListener('keydown',function(e){if(e.key==='Escape')set(false)})})();<\/script>`;
}
function siteFoot(l, S) {
  const G = GUIDES[l.code];
  return `<div class="sf"><div class="wrap"><div class="links"><a href="${urlOf(l, 'studio')}">Studio</a>` + (SHOW_BROW ? `<a href="${urlOf(l, 'brow')}">${ent(S['tab.brow'])}</a>` : '') +
    (G ? `<a href="${urlOf(l, 'guides')}">${ent(G.ui.guides)}</a>` : '') + `<a href="${baseOf(l)}#pricing">${ent(S['nav.pricing'])}</a></div>` +
    `<div><a href="/privacy.html">${S['ft.privacy']}</a> &middot; <a href="/terms.html">${S['ft.terms']}</a> &middot; <a href="mailto:${NOTIFY}">${NOTIFY}</a></div><div>${S['ft.note']}${l.code === 'en' ? '' : '<br>' + S['ft.mt']}</div></div></div>` +
    `<button class="totop" type="button" aria-label="${esc(S['gen.w.totop'])}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>` +
    `<script>(function(){var b=document.querySelector('.totop');if(!b)return;function f(){b.classList.toggle('on',window.scrollY>900)}window.addEventListener('scroll',f,{passive:true});f();b.addEventListener('click',function(){window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})})})();<\/script>`;
}
const plain = s => String(s).replace(/<[^>]+>/g, '');
const OFFERS = [{ '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD' }, { '@type': 'Offer', name: 'Day pass', price: '7.99', priceCurrency: 'USD' }, { '@type': 'Offer', name: '7-day pass', price: '14.99', priceCurrency: 'USD' }, { '@type': 'Offer', name: 'Pro monthly', price: '19', priceCurrency: 'USD' }, { '@type': 'Offer', name: 'Pro yearly', price: '149', priceCurrency: 'USD' }];
function ldjsonBrow(S, l) {
  const faq = []; for (let i = 1; i <= 5; i++) if (S['brow.q' + i + '.h']) faq.push({ '@type': 'Question', name: plain(S['brow.q' + i + '.h']), acceptedAnswer: { '@type': 'Answer', text: plain(S['brow.q' + i + '.p']) } });
  const url = SITE + urlOf(l, 'brow');
  const app = { '@context': 'https://schema.org', '@type': 'WebApplication', name: plain(S['brow.appName']), applicationCategory: 'DesignApplication', operatingSystem: 'Any (web browser)', browserRequirements: 'Requires JavaScript and WebAssembly', url, inLanguage: l.code,
    description: plain(S['brow.desc']), isAccessibleForFree: true, offers: OFFERS, publisher: orgRef, isPartOf: { '@type': 'WebSite', name: 'Skinstencil', url: SITE + '/' } };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: plain(S['brow.bc.home']), item: SITE + baseOf(l) },
    { '@type': 'ListItem', position: 2, name: plain(S['brow.bc.name']), item: url }] };
  return [app, { '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: l.code, mainEntity: faq }, crumbs].map(ldWrap).join('\n');
}
function ldjsonGen(S, l) {
  const faq = []; for (let i = 1; i <= 4; i++) if (S['gen.q' + i + '.h']) faq.push({ '@type': 'Question', name: plain(S['gen.q' + i + '.h']), acceptedAnswer: { '@type': 'Answer', text: plain(S['gen.q' + i + '.p']) } });
  const url = SITE + urlOf(l, 'gen');
  const app = { '@context': 'https://schema.org', '@type': 'WebApplication', name: plain(S['gen.appName']), applicationCategory: 'DesignApplication', operatingSystem: 'Any (web browser)', browserRequirements: 'Requires JavaScript', url, inLanguage: l.code,
    description: plain(S['gen.desc']), isAccessibleForFree: true, offers: OFFERS, publisher: orgRef, isPartOf: { '@type': 'WebSite', name: 'Skinstencil', url: SITE + '/' } };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: plain(S['gen.bc.home']), item: SITE + baseOf(l) },
    { '@type': 'ListItem', position: 2, name: plain(S['gen.bc.name']), item: url }] };
  return [app, { '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: l.code, mainEntity: faq }, crumbs].map(ldWrap).join('\n');
}
function ldjson(S, l, page) {
  if (page === 'brow') return ldjsonBrow(S, l);
  if (page === 'gen') return ldjsonGen(S, l);
  if (page !== 'index') return '';
  const faq = ['gen.q1', 'q2', 'gen.q2', 'q7', 'gen.q4', 'q11'].filter(k => S[k + '.h']).map(k => ({ '@type': 'Question', name: plain(S[k + '.h']), acceptedAnswer: { '@type': 'Answer', text: plain(S[k + '.p']) } }));
  const app = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Skinstencil', applicationCategory: 'DesignApplication', operatingSystem: 'Any (web browser)', url: SITE + urlOf(l, 'index'), inLanguage: l.code, description: plain(S['meta.desc']),
    offers: OFFERS };
  const wrap = o => '<script type="application/ld+json">' + JSON.stringify(o).replace(/</g, '\\u003c') + '</script>';
  return wrap(app) + '\n' + wrap({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq });
}
// ---------- guides ----------
const ent = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Inline text: escapes HTML, then **bold** and [text](guide:slug) / [text](studio) links.
function inl(text, l) {
  return ent(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((guide:[a-z0-9-]+|studio|brow)\)/g, (m, t, target) => `<a href="${urlOf(l, target)}">${t}</a>`);
}
const dateOf = (iso, l) => { try { return new Date(iso + 'T00:00:00Z').toLocaleDateString(l.locale.replace('_', '-'), { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }); } catch { return iso; } };
const ldWrap = o => '<script type="application/ld+json">' + JSON.stringify(o).replace(/</g, '\\u003c') + '</script>';
const orgRef = { '@type': 'Organization', name: 'Skinstencil', url: SITE + '/' };
const crumbLd = (l, G, g) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
  { '@type': 'ListItem', position: 1, name: G.ui.home, item: SITE + baseOf(l) },
  { '@type': 'ListItem', position: 2, name: G.ui.guides, item: SITE + urlOf(l, 'guides') },
  ...(g ? [{ '@type': 'ListItem', position: 3, name: g.title, item: SITE + urlOf(l, 'guide:' + g.slug) }] : []) ] });
const crumbHtml = (l, G, g) => `<nav class="crumbs" aria-label="${ent(G.ui.breadcrumbLabel)}"><ol><li><a href="${baseOf(l)}">${ent(G.ui.home)}</a></li>` +
  (g ? `<li><a href="${urlOf(l, 'guides')}">${ent(G.ui.guides)}</a></li><li aria-current="page">${ent(g.short || g.title)}</li>` : `<li aria-current="page">${ent(G.ui.guides)}</li>`) + '</ol></nav>';

function renderGuide(l, G, slug, S) {
  const g = { ...G.guides[slug], slug };
  const blocks = [];
  const steps = [];
  for (const s of g.sections) {
    blocks.push(`<h2>${inl(s.h2, l)}</h2>`);
    if (s.stepsIntro) blocks.push(`<p>${inl(s.stepsIntro, l)}</p>`);
    if (s.steps) {
      blocks.push('<ol class="how">' + s.steps.map(x => `<li><b>${inl(x.name, l)}.</b> ${inl(x.text, l)}</li>`).join('') + '</ol>');
      if (g.howto) for (const x of s.steps) steps.push({ '@type': 'HowToStep', name: plain(x.name), text: plain(x.text) });
    }
    for (const b of s.blocks || []) {
      if (b.p) blocks.push(`<p>${inl(b.p, l)}</p>`);
      else if (b.h3) blocks.push(`<h3>${inl(b.h3, l)}</h3>`);
      else if (b.ul) blocks.push('<ul>' + b.ul.map(x => `<li>${inl(x, l)}</li>`).join('') + '</ul>');
      else if (b.ol) blocks.push('<ol>' + b.ol.map(x => `<li>${inl(x, l)}</li>`).join('') + '</ol>');
      else if (b.table) blocks.push('<div class="tbl"><table><thead><tr>' + b.table.head.map(h => `<th scope="col">${inl(h, l)}</th>`).join('') + '</tr></thead><tbody>' +
        b.table.rows.map(r => '<tr>' + r.map((c, i) => i === 0 ? `<th scope="row">${inl(c, l)}</th>` : `<td>${inl(c, l)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
    }
  }
  const faq = (g.faq || []).map(f => `<details><summary>${inl(f.q, l)}</summary><p>${inl(f.a, l)}</p></details>`).join('');
  const related = G.order.filter(s => s !== slug).map(s => `<a class="card" href="${urlOf(l, 'guide:' + s)}"><h3>${ent(G.guides[s].short || G.guides[s].title)}</h3><p>${ent(G.guides[s].blurb || '')}</p></a>`).join('');
  const body = crumbHtml(l, G, g) + `<article><h1>${ent(g.title)}</h1>
<p class="meta">${ent(G.ui.updated)}: <time datetime="${g.updated}">${ent(dateOf(g.updated, l))}</time></p>
<div class="answer"><b>${ent(G.ui.answerLabel)}</b><p>${inl(g.answer, l)}</p></div>
${blocks.join('\n')}
<h2>${ent(G.ui.faq)}</h2><div>${faq}</div>
<div class="cta"><p>${inl(g.cta, l)}</p>${g.tool === 'brow' ? `<a class="btn" href="${urlOf(l, 'brow')}">${ent(S['brow.guideCta'])}</a><p class="fine">${ent(S['brow.guideNote'])}</p>` : `<a class="btn" href="${urlOf(l, 'studio')}">${ent(G.ui.openTool)}</a><p class="fine">${ent(G.ui.toolNote)}</p>`}</div>
</article>
${related ? `<div class="related"><h2>${ent(G.ui.related)}</h2><div class="cards">${related}</div></div>` : ''}`;
  const url = SITE + urlOf(l, 'guide:' + slug);
  const ld = [{ '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.metaDesc, inLanguage: l.code, datePublished: g.updated, dateModified: g.updated,
      mainEntityOfPage: url, url, author: orgRef, publisher: orgRef },
    ...(steps.length ? [{ '@context': 'https://schema.org', '@type': 'HowTo', name: g.title, description: plain(g.answer), inLanguage: l.code, step: steps }] : []),
    { '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: l.code, mainEntity: (g.faq || []).map(f => ({ '@type': 'Question', name: plain(f.q), acceptedAnswer: { '@type': 'Answer', text: plain(f.a) } })) },
    crumbLd(l, G, g)].map(ldWrap).join('\n');
  return { page: 'guide:' + slug, metaTitle: g.metaTitle, metaDesc: g.metaDesc, ogType: 'article', ld, body, langs: guideLangs(slug) };
}
function renderGuideIndex(l, G) {
  const cards = G.order.map(s => `<a class="card" href="${urlOf(l, 'guide:' + s)}"><h2>${ent(G.guides[s].short || G.guides[s].title)}</h2><p>${ent(G.guides[s].blurb || '')}</p></a>`).join('');
  const body = crumbHtml(l, G, null) + `<h1>${ent(G.ui.indexTitle)}</h1><p class="lead">${ent(G.ui.indexLead)}</p><div class="cards">${cards}</div>
<div class="cta"><a class="btn" href="${urlOf(l, 'studio')}">${ent(G.ui.openTool)}</a><p class="fine">${ent(G.ui.toolNote)}</p></div>`;
  const ld = [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: G.ui.indexTitle, description: G.ui.indexMetaDesc, inLanguage: l.code, url: SITE + urlOf(l, 'guides'),
      hasPart: G.order.map(s => ({ '@type': 'Article', headline: G.guides[s].title, url: SITE + urlOf(l, 'guide:' + s) })) }, crumbLd(l, G, null)].map(ldWrap).join('\n');
  return { page: 'guides', metaTitle: G.ui.indexMetaTitle, metaDesc: G.ui.indexMetaDesc, ogType: 'website', ld, body, langs: guideLangs(null) };
}
// Landing page: nav link and a compact section, both empty when the language has no guides.
function guidesNav(l) { const G = GUIDES[l.code]; return G ? `<a href="#guides">${ent(G.ui.guides)}</a>` : ''; }
const guideTool = g => (g.tool === 'brow' ? 'brow' : 'tattoo');
if (!SHOW_BROW) for (const code of Object.keys(GUIDES)) GUIDES[code].order = GUIDES[code].order.filter(s => guideTool(GUIDES[code].guides[s]) !== 'brow');
function guidesSection(l, tool, S) {
  const G = GUIDES[l.code]; if (!G) return '';
  const slugs = G.order.filter(s => guideTool(G.guides[s]) === tool); if (!slugs.length) return '';
  const cards = slugs.map(s => `<a class="glink" href="${urlOf(l, 'guide:' + s)}"><h3>${ent(G.guides[s].short || G.guides[s].title)}</h3><p>${ent(G.guides[s].blurb || '')}</p></a>`).join('');
  return `<section id="${tool === 'brow' ? 'guides-brow' : 'guides'}"><div class="wrap">
  <h2>${ent(tool === 'brow' ? S['brow.l.guides.h'] : G.ui.homeSectionTitle)}</h2>
  <p class="lead">${ent(tool === 'brow' ? S['brow.l.guides.lead'] : G.ui.homeSectionLead)}</p>
  <div class="gl">${cards}</div>
  <p class="note"><a href="${urlOf(l, 'guides')}">${ent(G.ui.guides)}</a></p>
</div></section>`;
}

// The brow tool page lists its own guides (only the languages that have them).
function browGuidesBlock(l, S) {
  const G = GUIDES[l.code]; if (!G) return '';
  const slugs = G.order.filter(s => guideTool(G.guides[s]) === 'brow'); if (!slugs.length) return '';
  return `<h2>${ent(S['brow.guides.h'])}</h2><div class="glist">` + slugs.map(s => `<a href="${urlOf(l, 'guide:' + s)}"><b>${ent(G.guides[s].short || G.guides[s].title)}</b><span>${ent(G.guides[s].blurb || '')}</span></a>`).join('') + '</div>';
}

let count = 0;
for (const l of LANGS) {
  const S = strings(l);
  for (const page of ['index', 'studio', 'brow', 'gen'].filter(x => SHOW_BROW || x !== 'brow')) {
    const vars = {
      ...S, lang: l.code, dir: l.dir, base: baseOf(l), canonical: SITE + urlOf(l, page), ogLocale: l.locale,
      hreflang: hreflang(page), langSelect: langSelect(l, page, S), notifyEmail: NOTIFY,
      ftMt: l.code === 'en' ? '' : `<br>${S['ft.mt']}`,
      ldjson: ldjson(S, l, page),
      guidesNav: page === 'index' ? guidesNav(l) : '', guidesSection: page === 'index' ? guidesSection(l, 'tattoo', S) : '', guidesSectionBrow: page === 'index' ? guidesSection(l, 'brow', S) : '',
      browGuides: page === 'brow' ? browGuidesBlock(l, S) : '',
      i18n_json: i18nJson(S, page === 'index' ? ['gen.w.', 's.gen.', 's.recommended'] : page === 'brow' ? ['brow.', 's.dl.', 's.thanks', 'theme.'] : page === 'gen' ? ['s.gen.', 's.recommended', 'gen.w.'] : ['s.', 'sample.']),
    };
    const fill = t => t.replace(/\{\{([A-Za-z0-9_.\-]+)\}\}/g, (m, k) => { if (!(k in vars)) throw new Error(`Unknown placeholder {{${k}}} in workstation`); return vars[k]; });
    vars.siteHead = siteHead(l, S, page === 'gen' ? 'home' : page, vars.langSelect); vars.siteFoot = siteFoot(l, S);
    vars.wsCss = WS_CSS; vars.wsMarkup = ''; vars.wsScenes = '';
    if (page === 'gen' || page === 'index') {   // the tool, and the scenes that come after it (the homepage puts pricing in between)
      const full = fill(read('src/ws.part.html')), cut = full.indexOf('<!--SCENES-->'), open = full.slice(0, full.indexOf('>') + 1);
      vars.wsMarkup = full.slice(0, cut) + '</div>\n'; vars.wsScenes = open + '\n' + full.slice(cut + '<!--SCENES-->'.length);
    }
    let html = TPL[page].replace(/\{\{([A-Za-z0-9_.\-]+)\}\}/g, (m, k) => {
      if (!(k in vars)) throw new Error(`Unknown placeholder {{${k}}} in ${page} template`);
      return vars[k];
    });
    const dir = path.join(ROOT, l.code === 'en' ? '' : l.code, page === 'studio' ? 'studio' : page === 'brow' ? 'brow' : page === 'gen' ? 'ai-tattoo-generator' : '');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'index.html'), html);
    count++;
  }
}

// guide pages
const guidePages = [];
for (const l of LANGS) {
  const G = GUIDES[l.code]; if (!G) continue;
  const S = strings(l);
  for (const r of [renderGuideIndex(l, G), ...G.order.map(s => renderGuide(l, G, s, S))]) {
    const vars = {
      ...S, lang: l.code, dir: l.dir, base: baseOf(l), canonical: SITE + urlOf(l, r.page), ogLocale: l.locale,
      hreflang: hreflang(r.page, r.langs), langSelect: langSelect(l, r.page, S, r.langs, G.ui.language), notifyEmail: NOTIFY,
      ftMt: l.code === 'en' ? '' : `<br>${S['ft.mt']}`, ldjson: r.ld,
      metaTitle: esc(r.metaTitle), metaDesc: esc(r.metaDesc), ogType: r.ogType, body: r.body,
      guidesUrl: urlOf(l, 'guides'), guidesCurrent: r.page === 'guides' ? ' aria-current="page"' : '', uiGuides: ent(G.ui.guides), uiLanguage: ent(G.ui.language),
      i18n_json: JSON.stringify({ 'theme.label': G.ui.theme }).replace(/</g, '\u003c'),
    };
    vars.siteHead = siteHead(l, S, r.page === 'guides' ? 'guides' : 'x', vars.langSelect); vars.siteFoot = siteFoot(l, S);
    const html = TPL.guide.replace(/\{\{([A-Za-z0-9_.\-]+)\}\}/g, (m, k) => {
      if (!(k in vars)) throw new Error(`Unknown placeholder {{${k}}} in guide template`);
      return vars[k];
    });
    const dir = path.join(ROOT, l.code === 'en' ? '' : l.code, urlOf({ code: 'en' }, r.page));
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'index.html'), html);
    guidePages.push({ l, r }); count++;
  }
}

// sitemap with language alternates
const urls = [];
const entry = (l, page, langs) => {
  const alts = langs.map(a => `    <xhtml:link rel="alternate" hreflang="${a.code}" href="${SITE}${urlOf(a, page)}"/>`).join('\n') +
    `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${urlOf(langs[0], page)}"/>`;
  return `  <url>\n    <loc>${SITE}${urlOf(l, page)}</loc>\n${alts}\n  </url>`;
};
for (const page of ['index', 'studio', 'brow', 'gen'].filter(x => SHOW_BROW || x !== 'brow')) for (const l of LANGS) urls.push(entry(l, page, LANGS));
for (const { l, r } of guidePages) urls.push(entry(l, r.page, r.langs));
writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`);
console.log(`built ${count} pages in ${LANGS.length} languages (${Object.keys(GUIDES).length} with guides), plus sitemap.xml`);
