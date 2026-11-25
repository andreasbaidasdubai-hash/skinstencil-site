# Deploying skinstencil.com (static site, no build step)

Files: `index.html` (landing, tattoo and brow tabs), `studio/index.html` (the free tool), `privacy.html`, `terms.html`, `404.html`, `robots.txt`, `sitemap.xml`. No server, no database, no keys.
Built from the preview artifacts with a script (kept in the Claude scratchpad); edit the HTML here directly from now on.

## Before it goes public (you must do these)
1. Create the mailbox: `hello@skinstencil.com` (Namecheap free email forwarding to your inbox is enough). Every button on the landing page that is not "Try a free stencil" is a `mailto:` link to it. Test it from another address.
2. Fill the [brackets] in `privacy.html` and `terms.html`: operator name and address, hosting provider, date. Have a lawyer read both before you advertise or take any money.
3. Fonts: the pages load Google Fonts, which shares visitors' IP addresses with Google. Fine for a quiet US/Gulf test, but self-host the fonts before any German or EU push.
4. Decide the operating entity (DIFC company is the plan) and whether to show its name in the footer.

## Host (pick one; I cannot create accounts for you)
Cloudflare Pages (free) or Netlify or Vercel, all can take a folder upload:
- Cloudflare Pages: Workers and Pages -> Create -> Pages -> Upload assets -> drag this folder -> name the project -> Deploy.
- Then Custom domains -> add `skinstencil.com` and `www.skinstencil.com`, and follow the DNS instructions.

## DNS at Namecheap (Domain List -> Manage -> Advanced DNS)
Easiest: change the domain's nameservers to the ones Cloudflare gives you (free), then manage DNS in Cloudflare.
Or keep Namecheap DNS and add the records the host shows (an `A` or `ALIAS` for the apex, a `CNAME` for `www`). HTTPS is issued automatically once DNS is correct.
Redirect `www` to the bare domain (or the other way) in the host's settings.

## After it is live
1. Open https://skinstencil.com, /studio/, /privacy.html, /terms.html and click every button on a phone and a laptop.
2. Search Console: add the domain, submit https://skinstencil.com/sitemap.xml.
3. Analytics later (privacy-friendly, for example Plausible or Cloudflare Web Analytics) and update privacy.html first.
4. Gate 2 measures: visits to /studio/, stencils made, and emails to hello@. A real payment flow needs a merchant of record (Paddle, Polar or Lemon Squeezy) and your decision; until then no price is an offer.

## Known limits
- The free tool is a classic filter, not the AI model.
- No download or print buttons yet (right-click Save image works).
- Brow mapping is not built; its page is a demand signal only.
