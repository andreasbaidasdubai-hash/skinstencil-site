/* Privacy-first visit counting. Loads Cloudflare Web Analytics (no cookies, no fingerprinting, no personal data) ONLY when a token is set in
   js/config.js (analyticsToken). While the token is empty nothing loads and the privacy page's "no analytics" statement is true.
   When you set a token, also switch the privacy page text (see ANALYTICS.md). */
(function () {
  var t = (window.SkinConfig || {}).analyticsToken;
  if (!t) return;
  var s = document.createElement('script');
  s.defer = true; s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  s.setAttribute('data-cf-beacon', JSON.stringify({ token: t }));
  document.head.appendChild(s);
})();
