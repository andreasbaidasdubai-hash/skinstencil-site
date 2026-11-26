/* Small touches that make the pages feel alive, none of them needed to use the site:
   cards and sections fade up as they come into view, long articles show a reading progress bar, and the primary buttons catch the light.
   Everything is off for people who asked their system for less motion, and nothing is hidden if this file does not load. */
(function () {
  'use strict';
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('js');
  if (calm || !('IntersectionObserver' in window)) { document.querySelectorAll('.rv').forEach(function (e) { e.classList.add('in'); }); }
  else {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    var sel = '.pl, .qa details, .artists .in, .glist a, .gcard, .endcta, .sec h2, .art h2, .art .answer, .tbl';
    var i = 0; document.querySelectorAll(sel).forEach(function (e) { e.classList.add('rv'); e.style.setProperty('--d', (i++ % 4) * 70 + 'ms'); io.observe(e); });
  }
  // reading progress on guide pages
  var art = document.querySelector('article, .art, main .wrap > h1');
  if (art && /\/guides\/[^/]+\/?$/.test(location.pathname)) {
    var bar = document.createElement('div'); bar.className = 'readbar'; document.body.appendChild(bar);
    var tick = false;
    function f() { var h = document.documentElement.scrollHeight - innerHeight; bar.style.transform = 'scaleX(' + Math.max(0, Math.min(1, h > 0 ? scrollY / h : 0)) + ')'; tick = false; }
    addEventListener('scroll', function () { if (!tick) { tick = true; requestAnimationFrame(f); } }, { passive: true }); f();
  }
})();
