/* AI design generator page. The description goes to the generator Worker (worker/index.js), which checks it is a person (Cloudflare Turnstile),
   applies the daily limits and asks the image provider. The picture comes back here and is drawn on a canvas; "Turn this into a stencil" hands it
   to the Studio through this browser's session storage (nothing more is uploaded), where the stencil engine runs on the device. */
(function () {
  'use strict';
  var C = window.SkinConfig || {}, U = window.SkinUnlock, T = window.I18N || {};
  var $ = function (id) { return document.getElementById(id); };
  function t(k, v) { var s = T[k] != null ? T[k] : k; if (v) for (var n in v) s = s.split('{' + n + '}').join(v[n]); return s; }
  var base = (C.generatorUrl || '').replace(/\/$/, '');
  if (!base) { $('genBox').hidden = true; return; }   // a control that cannot be used is not drawn

  var style = 'bold', busy = false, st = $('genStatus'), MAX = 1400;
  function say(k, cls, v) { st.textContent = k ? t(k, v) : ''; st.className = 'status' + (cls ? ' ' + cls : ''); }
  [].forEach.call($('genStyle').querySelectorAll('button'), function (b) { b.addEventListener('click', function () { style = b.getAttribute('data-v'); [].forEach.call($('genStyle').querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', String(x === b)); }); }); });
  [].forEach.call($('genChips').querySelectorAll('button'), function (b) { b.addEventListener('click', function () { $('genPrompt').value = b.textContent; $('genPrompt').focus(); }); });

  /* Cloudflare Turnstile (free bot check): a fresh one-time token for every design; the widget stays invisible unless Cloudflare wants proof. */
  var tsKey = C.turnstileSiteKey || '', tsLoad = null;
  function tsScript() {
    if (!tsLoad) tsLoad = new Promise(function (ok, no) { var s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
    return tsLoad;
  }
  function humanToken() {
    if (!tsKey) return Promise.resolve({ tok: '', id: null });
    return tsScript().then(function () {
      return new Promise(function (ok, no) {
        var id, done = false, to = setTimeout(function () { if (!done) { done = true; try { window.turnstile.remove(id); } catch (e) {} no(new Error('bot')); } }, 25000);
        id = window.turnstile.render($('genTs'), { sitekey: tsKey, appearance: 'interaction-only',
          callback: function (tok) { if (done) return; done = true; clearTimeout(to); ok({ tok: tok, id: id }); },
          'error-callback': function () { if (done) return; done = true; clearTimeout(to); no(new Error('bot')); } });
      });
    });
  }
  function licenseKey() { try { var s = JSON.parse(localStorage.getItem('skinstencil.license') || 'null'); return s && U && U.isUnlocked() ? s.key : ''; } catch (e) { return ''; } }

  function show(blob) {
    var u = URL.createObjectURL(blob), im = new Image();
    im.onload = function () {
      var w = im.naturalWidth || 1024, h = im.naturalHeight || 1024, k = Math.min(MAX / Math.max(w, h), 2);   // a vector is drawn large; a picture is not blown up beyond 2x
      var c = $('genCanvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
      var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u); $('genResult').hidden = false; $('genResult').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    im.onerror = function () { URL.revokeObjectURL(u); say('s.gen.errUpstream', 'err'); };
    im.src = u;
  }

  $('genBtn').addEventListener('click', function () {
    if (busy) return;
    var p = $('genPrompt').value.replace(/\s+/g, ' ').trim(); if (p.length < 3) { say('s.gen.errShort', 'err'); return; }
    busy = true; $('genBtn').disabled = true; say('s.gen.busy');
    var h = { 'Content-Type': 'application/json' }, key = licenseKey(); if (key) h['X-License'] = key;
    humanToken().then(function (hu) {
      if (hu.id != null) { try { window.turnstile.remove(hu.id); } catch (e) {} }   // the token is single-use
      return fetch(base + '/generate', { method: 'POST', headers: h, body: JSON.stringify({ prompt: p, style: style, turnstile: hu.tok }) });
    }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) {
        var map = { limit_free: 's.gen.errLimitFree', limit_paid: 's.gen.errLimitPaid', budget: 's.gen.errBudget', bot: 's.gen.errBot' };
        say(map[j.error] || 's.gen.errUpstream', 'err');
      });
      var left = r.headers.get('X-Remaining');
      return r.blob().then(function (b) { show(b); say(left != null ? 's.gen.left' : '', 'ok', { n: left }); });
    }).catch(function (e) { say(e && e.message === 'bot' ? 's.gen.errBot' : 's.gen.errNetwork', 'err'); }).then(function () { busy = false; $('genBtn').disabled = false; });
  });

  $('genAgain').addEventListener('click', function () { $('genResult').hidden = true; $('genPrompt').focus(); });
  $('genToStencil').addEventListener('click', function () {
    var c = $('genCanvas'), dest = $('genBox').getAttribute('data-studio') + '?from=ai';
    try { sessionStorage.setItem('skinstencil.handoff', c.toDataURL('image/png')); } catch (e) { /* storage full or blocked: the Studio then opens with its sample and the visitor can load the picture by hand */ }
    location.href = dest;
  });
})();
