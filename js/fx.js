/* One small touch, not needed to use the site: long articles show a reading progress bar.
   (Scroll fade-ins, the glowing Pro card, paper grain and button sheen were removed on 27 Nov 2026 because they made the pages look templated.) */
(function () {
  'use strict';
  document.documentElement.classList.add('js');
  // reading progress on guide pages
  var art = document.querySelector('article, .art, main .wrap > h1');
  if (art && /\/guides\/[^/]+\/?$/.test(location.pathname)) {
    var bar = document.createElement('div'); bar.className = 'readbar'; document.body.appendChild(bar);
    var tick = false;
    function f() { var h = document.documentElement.scrollHeight - innerHeight; bar.style.transform = 'scaleX(' + Math.max(0, Math.min(1, h > 0 ? scrollY / h : 0)) + ')'; tick = false; }
    addEventListener('scroll', function () { if (!tick) { tick = true; requestAnimationFrame(f); } }, { passive: true }); f();
  }
})();
