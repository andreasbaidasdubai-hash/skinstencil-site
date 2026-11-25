/* Skinstencil Studio. All processing is in js/engine.js and runs in the browser; nothing is uploaded.
   While a slider moves, a smaller copy is processed so it stays fast; when you stop, the full-resolution result replaces it.
   Free downloads carry a watermark; a license key (js/unlock.js) removes it. */
(function () {
  'use strict';
  var E = window.SkinEngine, U = window.SkinUnlock, C = window.SkinConfig || {}, T = window.I18N || {};
  var $ = function (id) { return document.getElementById(id); };
  function t(k, v) { var s = T[k] != null ? T[k] : k; if (v) for (var n in v) s = s.split('{' + n + '}').join(v[n]); return s; }
  var vO = $('cOrig'), vS = $('cOut'), vD = $('cDrift'), stage = $('stage');   // what the visitor sees, sized to the screen
  var cO = document.createElement('canvas'), cS = document.createElement('canvas'), cD = document.createElement('canvas');   // full-resolution work canvases
  var FULL = null, SMALL = null, last = null;   // { canvas, gray, w, h }
  var state = { mode: 'draw', skin: null, drift: false };
  var SKINS = ['#F6DCC9', '#E8B98F', '#C98E5F', '#9A6240', '#6B4126', '#46281A'];
  var MAX_SIDE = 1600, FAST_SIDE = 640, timer = null, rafBusy = false;

  /* ---------- controls ---------- */
  function bindRange(id, vid) { var e = $(id), v = $(vid); e.addEventListener('input', function () { v.textContent = e.value; schedule(); }); }
  bindRange('sens', 'sensV'); bindRange('smooth', 'smoothV'); bindRange('weight', 'weightV'); bindRange('specks', 'specksV');
  function setMode(m) { state.mode = m; [].forEach.call($('mode').querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-v') === m)); }); }
  [].forEach.call($('mode').querySelectorAll('button'), function (b) { b.addEventListener('click', function () { setMode(b.getAttribute('data-v')); schedule(); }); });
  /* Recommended: SkinEngine.recommend reads the picture on this device and sets the controls; every control stays adjustable afterwards */
  function setRange(id, vid, v) { var e = $(id); e.value = v; $(vid).textContent = e.value; }
  $('recBtn').addEventListener('click', function () {
    if (!FULL) return;
    var b = this, st = $('recStatus'); b.disabled = true; st.textContent = '';
    setTimeout(function () {
      try {
        var r = E.recommend(FULL.gray, FULL.w, FULL.h);
        setMode(r.mode); setRange('sens', 'sensV', r.sens); setRange('smooth', 'smoothV', r.smooth); setRange('weight', 'weightV', r.weight); setRange('specks', 'specksV', r.specks);
        process(FULL); st.textContent = t('s.recommendedDone');
      } finally { b.disabled = false; }
    }, 30);
  });
  var sk = $('skins'), swBtns = [];
  var none = document.createElement('button'); none.type = 'button'; none.className = 'sw none'; none.setAttribute('aria-pressed', 'true'); none.setAttribute('aria-label', t('s.noSkin')); sk.appendChild(none); swBtns.push(none);
  SKINS.forEach(function (c, i) { var b = document.createElement('button'); b.type = 'button'; b.className = 'sw'; b.style.background = c; b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', t('s.skinN') + ' ' + (i + 1)); sk.appendChild(b); swBtns.push(b); });
  swBtns.forEach(function (b, i) { b.addEventListener('click', function () { swBtns.forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); b.setAttribute('aria-pressed', 'true'); state.skin = i === 0 ? null : SKINS[i - 1]; process(FULL); }); });
  $('driftBtn').addEventListener('click', function () { state.drift = !state.drift; this.setAttribute('aria-pressed', String(state.drift)); this.textContent = state.drift ? t('s.driftHide') : t('s.driftShow'); process(FULL); });
  $('split').addEventListener('input', applySplit);
  $('mm').addEventListener('input', updateSize);

  /* ---------- loading ---------- */
  var drop = $('drop'), file = $('file');
  drop.addEventListener('click', function () { file.click(); });
  drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
  ['dragover', 'dragenter'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) loadFile(f); });
  file.addEventListener('change', function () { if (file.files[0]) loadFile(file.files[0]); });
  function msg(k) { $('ph').hidden = false; $('ph').textContent = t(k); }
  function loadFile(f) {
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { msg('s.errType'); return; }
    var r = new FileReader();
    r.onload = function () { var im = new Image(); im.onload = function () { setSource(im, im.naturalWidth, im.naturalHeight); }; im.onerror = function () { msg('s.errRead'); }; im.src = r.result; };
    r.readAsDataURL(f);
  }
  var SB = $('samples');
  Object.keys(E.samples).forEach(function (k) {
    var s = E.samples[k], b = document.createElement('button');
    b.type = 'button'; b.className = 'btn alt'; b.style.cssText = 'width:auto;padding:7px 11px;font-size:13px'; b.textContent = T['sample.' + k] || s.label;
    b.addEventListener('click', function () { var c = s.draw(); setMode(s.mode); $('sens').value = s.mode === 'photo' ? 60 : 55; $('sensV').textContent = $('sens').value; setSource(c, c.width, c.height); });
    SB.appendChild(b);
  });

  function prepare(img, iw, ih, maxSide) { var c = E.fitToCanvas(img, iw, ih, maxSide), g = E.grayFromCanvas(c); return { canvas: c, gray: g.gray, w: g.w, h: g.h }; }
  function setSource(img, iw, ih) {
    FULL = prepare(img, iw, ih, MAX_SIDE);
    SMALL = prepare(FULL.canvas, FULL.w, FULL.h, FAST_SIDE);
    last = null;
    stage.style.aspectRatio = FULL.w + '/' + FULL.h;
    $('ph').hidden = true; $('handle').hidden = false; $('tagL').hidden = false; $('tagR').hidden = false;
    updateSize(); process(FULL);
  }

  /* ---------- processing ---------- */
  function schedule() {
    if (!FULL) return;
    $('recStatus').textContent = '';
    if (!rafBusy) { rafBusy = true; requestAnimationFrame(function () { rafBusy = false; process(SMALL); }); }
    clearTimeout(timer); timer = setTimeout(function () { process(FULL); }, 220);
  }
  function opts(src) {
    // pixel-based sliders are defined at full size; scale them for the small copy so both look alike
    var k = src.w / FULL.w;
    return { mode: state.mode, sens: +$('sens').value, smooth: Math.round(+$('smooth').value * k), weight: Math.max(1, Math.round(+$('weight').value * k)), specks: Math.round(+$('specks').value * k * k) };
  }
  function process(src) {
    if (!src) return;
    var o = opts(src), r = E.makeStencil(src.gray, src.w, src.h, o);
    if (src === FULL) last = { src: src, r: r };
    [cO, cS, cD].forEach(function (c) { if (c.width !== src.w || c.height !== src.h) { c.width = src.w; c.height = src.h; } });
    cO.getContext('2d').drawImage(src.canvas, 0, 0);
    E.renderStencil(cS, r.final, src.w, src.h, state.skin, null, r.alpha);
    if (!U.isUnlocked()) watermark(cS.getContext('2d'), src.w, src.h, 0.3);
    var dx = cD.getContext('2d'); dx.clearRect(0, 0, src.w, src.h);
    var d = E.driftCheck(E.referenceMask(src.gray, src.w, src.h, state.mode), r.final, src.w, src.h, o.weight, state.drift);
    if (state.drift && d.image) { var tc = document.createElement('canvas'); tc.width = src.w; tc.height = src.h; tc.getContext('2d').putImageData(d.image, 0, 0); dx.drawImage(tc, 0, 0); }
    $('kept').textContent = d.kept.toFixed(1) + '%'; $('lost').textContent = d.lost.toFixed(1) + '%'; $('added').textContent = d.added.toFixed(1) + '%';
    $('meterFill').style.width = d.kept + '%';
    showView(); applySplit();
  }
  /* The work canvases are larger than the screen. Letting the browser shrink them in CSS drops pixels and breaks thin hatching into
     stair-steps, so the visible canvases are drawn at screen size (times the device pixel ratio) with halving steps and smooth scaling. */
  function blit(dst, src) {
    var w = dst.width, h = dst.height, cur = src;
    while (cur.width / 2 >= w) { var t = document.createElement('canvas'); t.width = Math.ceil(cur.width / 2); t.height = Math.ceil(cur.height / 2); var tx = t.getContext('2d'); tx.imageSmoothingQuality = 'high'; tx.drawImage(cur, 0, 0, t.width, t.height); cur = t; }
    var d = dst.getContext('2d'); d.clearRect(0, 0, w, h); d.imageSmoothingEnabled = true; d.imageSmoothingQuality = 'high'; d.drawImage(cur, 0, 0, w, h);
  }
  function showView() {
    if (!cS.width) return;
    var r = stage.getBoundingClientRect(), k = Math.min(2, window.devicePixelRatio || 1), w = Math.max(1, Math.round(r.width * k)), h = Math.max(1, Math.round(w * cS.height / cS.width));
    [vO, vS, vD].forEach(function (c) { if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } });
    blit(vO, cO); blit(vS, cS); blit(vD, cD);
  }
  var resizeT = null; window.addEventListener('resize', function () { clearTimeout(resizeT); resizeT = setTimeout(showView, 120); });
  function applySplit() {
    var p = +$('split').value;
    vS.style.clipPath = 'inset(0 0 0 ' + p + '%)'; vD.style.clipPath = 'inset(0 0 0 ' + p + '%)';
    $('handle').style.left = 'calc(' + p + '% - 1px)';
  }

  /* ---------- size and ruler ---------- */
  function updateSize() {
    var mm = Math.max(10, Math.min(600, +$('mm').value || 88));
    if (!FULL) return;
    var hmm = mm * FULL.h / FULL.w, px = Math.round(mm / 25.4 * 300), py = Math.round(hmm / 25.4 * 300);
    $('sizeOut').textContent = mm.toFixed(0) + ' x ' + hmm.toFixed(0) + ' mm';
    $('pxOut').textContent = px + ' x ' + py + ' px';
    var r = $('ruler'); r.innerHTML = '';
    var step = mm >= 200 ? 50 : mm >= 80 ? 10 : mm >= 40 ? 5 : 2;
    for (var n = 0; n <= mm; n += step) {
      var tick = document.createElement('span');
      tick.style.cssText = 'position:absolute;bottom:0;left:' + (n / mm * 100) + '%;border-left:1px solid currentColor;height:' + (n % (step * 5) === 0 ? 12 : 7) + 'px;padding-left:2px';
      if (n % (step * 5) === 0 || n === 0) { tick.textContent = n; tick.style.height = '18px'; }
      r.appendChild(tick);
    }
    $('rulerNote').textContent = t('s.rulerNote', { mm: mm.toFixed(0) });
  }

  /* ---------- download, watermark, true-size PNG ---------- */
  function crc32(buf) {
    var tbl = crc32.t || (crc32.t = (function () { var a = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; a[n] = c >>> 0; } return a; })());
    var c = 0xFFFFFFFF; for (var i = 0; i < buf.length; i++) c = tbl[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0;
  }
  /* Insert a pHYs chunk so print software reads the file as 300 dpi, i.e. true size. */
  function withDpi(bytes, dpi) {
    var ppm = Math.round(dpi / 0.0254), chunk = new Uint8Array(21), dv = new DataView(chunk.buffer);
    dv.setUint32(0, 9); chunk.set([0x70, 0x48, 0x59, 0x73], 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1; dv.setUint32(17, crc32(chunk.subarray(4, 17)));
    var out = new Uint8Array(bytes.length + 21); out.set(bytes.subarray(0, 33), 0); out.set(chunk, 33); out.set(bytes.subarray(33), 54); return out;
  }
  function watermark(x, w, h, a) {
    var fs = Math.max(18, Math.round(Math.max(w, h) / 13)), txt = 'skinstencil.com', step = fs * 2.1, ext = Math.hypot(w, h);
    x.save(); x.globalAlpha = a == null ? 0.5 : a; x.fillStyle = '#4F35C8'; x.font = '700 ' + fs + 'px Archivo, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.translate(w / 2, h / 2); x.rotate(-Math.PI / 6);
    var row = 0; for (var yy = -ext; yy < ext; yy += step, row++) { for (var xx = -ext; xx < ext; xx += fs * 9) x.fillText(txt, xx + (row % 2 ? fs * 4.5 : 0), yy); }
    x.restore();
  }
  function setDl(k, cls, vars) { var s = $('dlStatus'); s.textContent = t(k, vars); s.className = 'status' + (cls ? ' ' + cls : ''); }
  function dlState() {
    var un = U.isUnlocked(), px = un ? C.paidMaxPx : C.freeMaxPx;
    setDl(un ? 's.dl.paid' : 's.dl.free', un ? 'ok' : '', { px: px });
    $('unlockBtn').hidden = un; if (un) $('plansBox').hidden = true; $('keyOut').hidden = !un;
  }
  function buildOutput() {
    if (!FULL) return null;
    if (!last || last.src !== FULL) process(FULL);
    var un = U.isUnlocked(), maxPx = un ? C.paidMaxPx : C.freeMaxPx;
    var mm = Math.max(10, Math.min(600, +$('mm').value || 88)), tw = Math.round(mm / 25.4 * 300), th = Math.round(tw * FULL.h / FULL.w);
    var sc = Math.min(1, maxPx / Math.max(tw, th)); tw = Math.max(2, Math.round(tw * sc)); th = Math.max(2, Math.round(th * sc));
    var tmp = document.createElement('canvas'); E.renderStencil(tmp, last.r.final, FULL.w, FULL.h, null, [23, 22, 28], last.r.alpha);
    var out = document.createElement('canvas'); out.width = tw; out.height = th;
    var x = out.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.fillStyle = '#fff'; x.fillRect(0, 0, tw, th); x.drawImage(tmp, 0, 0, tw, th);
    if (!un) watermark(x, tw, th);
    return { canvas: out, un: un, mm: mm };
  }
  function download() {
    var o = buildOutput(); if (!o) return;
    var btn = $('dlBtn'); btn.disabled = true; setDl('s.dl.busy');
    o.canvas.toBlob(function (blob) {
      blob.arrayBuffer().then(function (buf) {
        var bytes = new Uint8Array(buf); if (o.un) bytes = withDpi(bytes, 300);
        var url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' })), a = document.createElement('a');
        a.href = url; a.download = 'skinstencil-' + Math.round(o.mm) + 'mm' + (o.un ? '' : '-free') + '.png'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000); btn.disabled = false; dlState();
      });
    }, 'image/png');
  }
  /* Print: opens a clean page with the stencil at its true width in millimetres and starts the print dialog. Free prints carry the watermark. */
  function printTrue() {
    var o = buildOutput(); if (!o) return;
    var w = window.open('', '_blank'); if (!w) { setDl('s.dl.network', 'err'); return; }
    var uri = o.canvas.toDataURL('image/png');
    w.document.write('<!doctype html><title>skinstencil ' + Math.round(o.mm) + ' mm</title><style>@page{margin:8mm}html,body{margin:0;background:#fff}img{display:block;width:' + o.mm + 'mm;height:auto}</style><img src="' + uri + '" onload="setTimeout(function(){window.print()},150)">');
    w.document.close();
  }
  /* PDF at true size: one sheet, or several with a 10 mm overlap when the stencil is bigger than the paper (js/pdf-util.js) */
  var pl = (navigator.language || '').toLowerCase(); if (/^(en-us|en-ca|es-mx|es-us)/.test(pl)) $('paper').value = 'letter';
  function downloadPdf() {
    var o = buildOutput(); if (!o) return;
    var btn = $('pdfBtn'); btn.disabled = true; setDl('s.dl.busy');
    window.SkinPdf.build(o.canvas, o.mm, $('paper').value).then(function (r) {
      var url = URL.createObjectURL(r.blob), a = document.createElement('a');
      a.href = url; a.download = 'skinstencil-' + Math.round(o.mm) + 'mm' + (o.un ? '' : '-free') + '.pdf'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }).catch(function () { setDl('s.dl.network', 'err'); }).then(function () { btn.disabled = false; dlState(); });
  }
  $('dlBtn').addEventListener('click', download);
  $('pdfBtn').addEventListener('click', downloadPdf);
  $('printBtn').addEventListener('click', printTrue);
  $('unlockBtn').addEventListener('click', function () { $('plansBox').hidden = !$('plansBox').hidden; });

  /* checkout links: live when configured, otherwise an honest "opens soon" */
  var anyLive = false;
  [].forEach.call(document.querySelectorAll('a.buy'), function (a) {
    var url = (C.checkout || {})[a.getAttribute('data-plan')];
    if (url) { a.href = url; a.target = '_blank'; a.rel = 'noopener'; anyLive = true; }
    else { a.href = 'mailto:' + (C.notifyEmail || '') + '?subject=Checkout%20interest%20' + a.getAttribute('data-plan'); }
  });
  if (!anyLive) $('soon').hidden = false;

  /* license key */
  $('keyBtn').addEventListener('click', function () {
    var s = $('keyStatus'); s.className = 'status'; s.textContent = t('s.dl.checking');
    U.activate($('keyIn').value).then(function (v) {
      if (v.ok) { s.textContent = t('s.dl.ok'); s.className = 'status ok'; dlState(); process(FULL); return; }
      var map = { invalid: 's.dl.invalid', expired: 's.dl.expired', network: 's.dl.network', notConfigured: 's.dl.notConfigured' };
      s.textContent = t(map[v.reason] || 's.dl.invalid'); s.className = 'status err';
    });
  });
  $('keyOut').addEventListener('click', function () { U.clear(); $('keyStatus').textContent = ''; dlState(); process(FULL); });
  dlState(); U.refresh().then(function () { dlState(); process(FULL); });
  window.addEventListener('storage', function (e) { if (e.key === 'skinstencil.license') { dlState(); process(FULL); } });
  if (/[?&]thanks=1/.test(location.search)) { $('thanks').hidden = false; $('keyBox').open = true; }

  /* ---------- design generator ----------
     Drawn only when js/config.js has generatorUrl (the Worker in /worker). The result, a vector or a picture, goes through the same
     stencil engine as an upload, so every control, the drift check, the PDF and the print all work on it. */
  (function () {
    var base = (C.generatorUrl || '').replace(/\/$/, ''); if (!base) return;
    $('genCard').hidden = false;
    var style = 'bold', busy = false, st = $('genStatus');
    function say(k, cls, v) { st.textContent = k ? t(k, v) : ''; st.className = 'status' + (cls ? ' ' + cls : ''); }
    [].forEach.call($('genStyle').querySelectorAll('button'), function (b) { b.addEventListener('click', function () { style = b.getAttribute('data-v'); [].forEach.call($('genStyle').querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', String(x === b)); }); }); });
    function licenseKey() { try { var s = JSON.parse(localStorage.getItem('skinstencil.license') || 'null'); return s && U.isUnlocked() ? s.key : ''; } catch (e) { return ''; } }
    function show(blob) {
      var u = URL.createObjectURL(blob), im = new Image();
      im.onload = function () {
        var w = im.naturalWidth || 1024, h = im.naturalHeight || 1024, k = Math.min(1, MAX_SIDE / Math.max(w, h)) * (w < 1200 ? Math.min(2, 1200 / w) : 1);   // a vector is drawn at full size; a small picture is not blown up beyond 2x
        var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
        var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u); setMode('draw'); setSource(c, c.width, c.height); $('recBtn').click();
      };
      im.onerror = function () { URL.revokeObjectURL(u); say('s.gen.errUpstream', 'err'); };
      im.src = u;
    }
    $('genBtn').addEventListener('click', function () {
      if (busy) return;
      var p = $('genPrompt').value.replace(/\s+/g, ' ').trim(); if (p.length < 3) { say('s.gen.errShort', 'err'); return; }
      busy = true; $('genBtn').disabled = true; say('s.gen.busy');
      var h = { 'Content-Type': 'application/json' }, key = licenseKey(); if (key) h['X-License'] = key;
      fetch(base + '/generate', { method: 'POST', headers: h, body: JSON.stringify({ prompt: p, style: style }) }).then(function (r) {
        if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) {
          var map = { limit_free: 's.gen.errLimitFree', limit_paid: 's.gen.errLimitPaid', budget: 's.gen.errBudget' };
          say(map[j.error] || 's.gen.errUpstream', 'err');
          if (j.error === 'limit_free') $('plansBox').hidden = false;   // the way to get more is right there
        });
        var left = r.headers.get('X-Remaining');
        return r.blob().then(function (b) { show(b); say(left != null ? 's.gen.left' : '', 'ok', { n: left }); });
      }).catch(function () { say('s.gen.errNetwork', 'err'); }).then(function () { busy = false; $('genBtn').disabled = false; });
    });
  })();

  /* open in a working state so the stage is never empty */
  var first = E.samples.dagger.draw(); setSource(first, first.width, first.height);
})();
