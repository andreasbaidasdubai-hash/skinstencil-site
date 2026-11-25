# Switching on visit counting (Cloudflare Web Analytics)

Why this one: free, no cookies, no personal data, no consent banner needed, and it works on a site that is not behind Cloudflare's proxy.

1. Sign up at dash.cloudflare.com (free), open Web Analytics, "Add a site", host `skinstencil.com`, choose the JavaScript snippet option (not automatic setup).
2. Copy the token from the snippet: `data-cf-beacon='{"token": "THIS-VALUE"}'`.
3. Put it in `js/config.js` as `analyticsToken`, commit, push.
4. Change the privacy page sentence "This site does not set cookies and does not use analytics at this time." to:
   "This site does not set cookies. It counts page visits with Cloudflare Web Analytics, which does not use cookies or store personal data about you."
   and add Cloudflare to the list of providers that may see your IP address.
5. What you get: visits, pages, countries, referrers and device types. Not who bought: Polar's dashboard shows sales.
