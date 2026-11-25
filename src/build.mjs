// Builds the static site from templates and string files. Run: node src/build.mjs
// English lives at the site root; every other language lives under /<code>/ (home and studio).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://skinstencil.com';
const NOTIFY = 'hello@skinstencil.com';

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
const TPL = { index: read('src/index.tpl.html'), studio: read('src/studio.tpl.html') };

const baseOf = l => (l.code === 'en' ? '/' : `/${l.code}/`);
const urlOf = (l, page) => baseOf(l) + (page === 'studio' ? 'studio/' : '');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function strings(l) {
  if (l.code === 'en') return en;
  const f = path.join(ROOT, 'src/strings', l.code + '.json');
  if (!existsSync(f)) { console.warn('missing strings for', l.code, '- falling back to English'); return en; }
  const own = JSON.parse(readFileSync(f, 'utf8'));
  for (const k of Object.keys(en)) if (!(k in own)) console.warn(`[${l.code}] missing key ${k}, using English`);
  return { ...en, ...own };
}
function hreflang(page) {
  const out = [];
  for (const l of LANGS) {
    out.push(`<link rel="alternate" hreflang="${l.code}" href="${SITE}${urlOf(l, page)}">`);
    for (const r of l.regions) out.push(`<link rel="alternate" hreflang="${r}" href="${SITE}${urlOf(l, page)}">`);
  }
  out.push(`<link rel="alternate" hreflang="x-default" href="${SITE}${urlOf(LANGS[0], page)}">`);
  return out.join('\n');
}
function langSelect(cur, page, S) {
  const opts = LANGS.map(l => `<option value="${urlOf(l, page)}"${l.code === cur.code ? ' selected' : ''} lang="${l.code}">${l.name}</option>`).join('');
  return `<select class="langsel" id="langSel" aria-label="${esc(S['lang.label'])}">${opts}</select>`;
}
function i18nJson(S, prefixes) {
  const o = {}; for (const k of Object.keys(S)) if (prefixes.some(p => k.startsWith(p))) o[k] = S[k];
  return JSON.stringify(o).replace(/</g, '\\u003c');
}

const plain = s => String(s).replace(/<[^>]+>/g, '');
function ldjson(S, l, page) {
  if (page !== 'index') return '';
  const faq = []; for (let i = 1; i <= 11; i++) if (S['q' + i + '.h']) faq.push({ '@type': 'Question', name: plain(S['q' + i + '.h']), acceptedAnswer: { '@type': 'Answer', text: plain(S['q' + i + '.p']) } });
  const app = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Skinstencil', applicationCategory: 'DesignApplication', operatingSystem: 'Any (web browser)', url: SITE + urlOf(l, 'index'), inLanguage: l.code, description: plain(S['meta.desc']),
    offers: [{ '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD' }, { '@type': 'Offer', name: 'Day pass', price: '4.99', priceCurrency: 'USD' }, { '@type': 'Offer', name: 'Pro monthly', price: '12', priceCurrency: 'USD' }, { '@type': 'Offer', name: 'Pro yearly', price: '79', priceCurrency: 'USD' }] };
  const wrap = o => '<script type="application/ld+json">' + JSON.stringify(o).replace(/</g, '\\u003c') + '</script>';
  return wrap(app) + '\n' + wrap({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq });
}
let count = 0;
for (const l of LANGS) {
  const S = strings(l);
  for (const page of ['index', 'studio']) {
    const vars = {
      ...S, lang: l.code, dir: l.dir, base: baseOf(l), canonical: SITE + urlOf(l, page), ogLocale: l.locale,
      hreflang: hreflang(page), langSelect: langSelect(l, page, S), notifyEmail: NOTIFY,
      ftMt: l.code === 'en' ? '' : `<br>${S['ft.mt']}`,
      ldjson: ldjson(S, l, page),
      i18n_json: i18nJson(S, page === 'index' ? ['sample.', 'g.', 'd.'] : ['s.', 'sample.']),
    };
    let html = TPL[page].replace(/\{\{([A-Za-z0-9_.\-]+)\}\}/g, (m, k) => {
      if (!(k in vars)) throw new Error(`Unknown placeholder {{${k}}} in ${page} template`);
      return vars[k];
    });
    const dir = path.join(ROOT, l.code === 'en' ? '' : l.code, page === 'studio' ? 'studio' : '');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'index.html'), html);
    count++;
  }
}

// sitemap with language alternates
const urls = [];
for (const page of ['index', 'studio']) {
  for (const l of LANGS) {
    const alts = LANGS.map(a => `    <xhtml:link rel="alternate" hreflang="${a.code}" href="${SITE}${urlOf(a, page)}"/>`).join('\n') +
      `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${urlOf(LANGS[0], page)}"/>`;
    urls.push(`  <url>\n    <loc>${SITE}${urlOf(l, page)}</loc>\n${alts}\n  </url>`);
  }
}
writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`);
console.log(`built ${count} pages in ${LANGS.length} languages, plus sitemap.xml`);
