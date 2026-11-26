/* The AI generator and stencil workstation (ai-tattoo-generator/).
   One page, four steps: describe it (words, optionally a picture) -> choose the body part -> skin tone, size and turn -> make the stencil.
   What goes to the generator Worker (worker/index.js, after a Cloudflare Turnstile check): the description, the style, an example picture if the visitor added one,
   and, for "Show it realistic", the finished design with where it sits. Everything else (the stencil, the print sheet, the PNG) is made on the visitor's device.
   The stock skin photos are 48 files in /assets/lib: 8 body parts x 6 skin tones. */
(function () {
  'use strict';
  var C = window.SkinConfig || {}, U = window.SkinUnlock, T = window.I18N || {};
  var $ = function (id) { return document.getElementById(id); };
  function t(k, v) { var s = T[k] != null ? T[k] : k; if (v) for (var n in v) s = s.split('{' + n + '}').join(v[n]); return s; }
  var base = (C.generatorUrl || '').replace(/\/$/, '');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- scroll scenes ---------- */
  function sp(el) { var r = el.getBoundingClientRect(), tot = el.offsetHeight - window.innerHeight; return Math.max(0, Math.min(1, -r.top / Math.max(1, tot))); }
  function play(v, on) { if (!v || reduce) return; if (on && v.paused) { var pr = v.play(); pr && pr.catch && pr.catch(function () {}); } if (!on && !v.paused) v.pause(); v.classList.toggle('on', on && v.readyState > 1); }
  function scenes() {
    var p = sp($('a3')); play($('vHands'), p > 0 && p < 1);
    if (!reduce) { var z = 'translate(-50%,-50%) scale(' + (1 + p * .1) + ')'; $('handsImg').style.transform = z; $('vHands').style.transform = z; }
    var q = sp($('a3b')), k = Math.max(0, Math.min(1, (q - .45) / .3));
    if (!reduce) { $('artistImg').style.transform = 'translate(-50%,-50%) scale(' + (1 + q * .1) + ')'; $('machineImg').style.transform = 'translate(-50%,-50%) scale(' + (1.04 + q * .06) + ')'; }
    $('artistImg').style.opacity = 1 - k; $('machineImg').style.opacity = k;
    var ws = $('ws').getBoundingClientRect(), dock = document.querySelector('.dock'); if (dock) dock.style.display = (ws.bottom > 0 && ws.top < window.innerHeight) ? 'none' : '';   // the bottom button is for the later sections; on the form itself it would cover the controls
    var d = document.documentElement, h = d.scrollHeight - window.innerHeight; if ($('bar')) $('bar').style.width = (100 * (window.scrollY || 0) / Math.max(1, h)) + '%';
  }
  var tick = false;
  function onScroll() { if (tick) return; tick = true; requestAnimationFrame(function () { tick = false; scenes(); }); }
  window.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('resize', onScroll);
  var door = $('vDoor'); if (door && !reduce) { door.addEventListener('loadeddata', function () { play(door, true); }); play(door, true); }

  /* ---------- state ---------- */
  var PARTS = { shoulder: { d: { x: 54, y: 50, s: 50, r: -8 } }, back: { d: { x: 50, y: 46, s: 60, r: 0 } }, forearm: { d: { x: 50, y: 50, s: 42, r: 0 } }, arm: { d: { x: 50, y: 46, s: 46, r: -5 } },
    chest: { d: { x: 50, y: 46, s: 42, r: 0 } }, ribs: { d: { x: 52, y: 50, s: 46, r: -8 } }, thigh: { d: { x: 50, y: 50, s: 42, r: 0 } }, calf: { d: { x: 50, y: 50, s: 38, r: 0 } } };
  var TONES = [['t1', '#F1D3BE'], ['t2', '#E2B999'], ['t3', '#C99A74'], ['t4', '#A06A47'], ['t5', '#6A412B'], ['t6', '#3E2618']];
  var S = { design: null, part: 'shoulder', tone: 't3', view: 'back', x: 54, y: 50, s: 50, r: -8, style: 'bold', example: false };
  var Z = 1200;   // working size of the design and the stencil: big enough that thin hatching is still more than a pixel wide
  var D = document.createElement('canvas'); D.width = D.height = Z;      // the design: black on white
  var SC = document.createElement('canvas'); SC.width = SC.height = Z;   // the stencil
  var NN = Z, SET = { mode: 'draw', sens: 72, smooth: 0, weight: 2, specks: 30, mm: 88 }, vmode = 'art', did = 0, realFor = '';
  function unlocked() { try { return !!(U && U.isUnlocked()); } catch (e) { return false; } }

  /* ---------- design in, stencil out ---------- */
  function fitDesign(im) {
    var c = D.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, Z, Z); c.imageSmoothingQuality = 'high';
    var w = im.naturalWidth || im.width || Z, h = im.naturalHeight || im.height || Z, k = Math.min(Z * .85 / w, Z * .85 / h);
    c.drawImage(im, Z / 2 - w * k / 2, Z / 2 - h * k / 2, w * k, h * k);
  }
  function setDesign(im, example) {
    fitDesign(im); did++; S.design = true; S.example = !!example; clearReal();
    $('wempty').hidden = true; $('wart').style.visibility = ''; $('st4').classList.remove('off'); exampleTag(!!example);
    makeStencil();
  }
  /* the example wolf can be binned: the stage goes back to bare skin, and the stencil step waits for a real design */
  function exampleTag(on) {
    var tg = $('wtag'); tg.textContent = ''; tg.hidden = !on; if (!on) return;
    var sp = document.createElement('span'), bn = document.createElement('button'); sp.textContent = t('gen.w.example'); bn.type = 'button'; bn.className = 'rm'; bn.textContent = t('gen.w.removeExample');
    bn.addEventListener('click', function (e) { e.stopPropagation(); clearExample(); }); bn.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    tg.appendChild(sp); tg.appendChild(bn);
  }
  function clearExample() {
    S.design = null; S.example = false; clearReal(); setView('art'); exampleTag(false);
    $('wart').style.visibility = 'hidden'; $('wempty').hidden = false; $('st4').classList.add('off');
  }
  function blur3(a, passes) { var o = new Float32Array(a.length), tmp; for (var p = 0; p < passes; p++) { for (var y = 0; y < NN; y++) for (var x = 0; x < NN; x++) { var i = y * NN + x, l = x > 0 ? a[i - 1] : a[i], r = x < NN - 1 ? a[i + 1] : a[i]; o[i] = (l + a[i] + r) / 3; } tmp = a; a = o; o = tmp; for (var y2 = 0; y2 < NN; y2++) for (var x2 = 0; x2 < NN; x2++) { var j = y2 * NN + x2, u = y2 > 0 ? a[j - NN] : a[j], d = y2 < NN - 1 ? a[j + NN] : a[j]; o[j] = (u + a[j] + d) / 3; } tmp = a; a = o; o = tmp; } return a; }
  function dil(m, grow) { var o = new Uint8Array(m.length); for (var y = 0; y < NN; y++) for (var x = 0; x < NN; x++) { var i = y * NN + x, v = grow ? 0 : 1; for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= NN || Y >= NN) continue; var q = m[Y * NN + X]; if (grow) { if (q) v = 1; } else if (!q) v = 0; } o[i] = v; } return o; }
  function majority(m) { var f = new Float32Array(m.length); for (var i = 0; i < m.length; i++) f[i] = m[i]; f = blur3(f, 1); var o = new Uint8Array(m.length); for (i = 0; i < m.length; i++) o[i] = f[i] > .5 ? 1 : 0; return o; }
  function despeck(m, min) { if (min <= 0) return m; var seen = new Uint8Array(m.length), stack = [], comp; for (var i = 0; i < m.length; i++) { if (!m[i] || seen[i]) continue; comp = []; stack.length = 0; stack.push(i); seen[i] = 1; while (stack.length) { var p = stack.pop(); comp.push(p); var x = p % NN, y = (p / NN) | 0; if (x > 0 && m[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); } if (x < NN - 1 && m[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); } if (y > 0 && m[p - NN] && !seen[p - NN]) { seen[p - NN] = 1; stack.push(p - NN); } if (y < NN - 1 && m[p + NN] && !seen[p + NN]) { seen[p + NN] = 1; stack.push(p + NN); } } if (comp.length < min) for (var k = 0; k < comp.length; k++) m[comp[k]] = 0; } return m; }
  /* the stencil, from the design and a set of controls. Thin strokes are first made crisper (unsharp mask), then the line mask is cut, smoothed, thickened and cleaned of specks. */
  function stencilCore(set) {
    var d = D.getContext('2d').getImageData(0, 0, NN, NN).data, g = new Float32Array(NN * NN), orig = new Uint8Array(NN * NN), ink = new Uint8Array(NN * NN), i;
    for (i = 0; i < NN * NN; i++) { g[i] = .299 * d[i * 4] + .587 * d[i * 4 + 1] + .114 * d[i * 4 + 2]; orig[i] = g[i] < 128 ? 1 : 0; }
    if (set.mode === 'draw') {
      var bl = blur3(new Float32Array(g), 1), thr = 50 + set.sens * 1.7;
      for (i = 0; i < NN * NN; i++) { var sh = g[i] + 1.4 * (g[i] - bl[i]); ink[i] = sh < thr ? 1 : 0; }
    } else {
      var b = blur3(new Float32Array(g), 2), TT = 230 - set.sens * 2.1;
      for (var y = 1; y < NN - 1; y++) for (var x = 1; x < NN - 1; x++) { var k = y * NN + x, gx = -b[k - NN - 1] - 2 * b[k - 1] - b[k + NN - 1] + b[k - NN + 1] + 2 * b[k + 1] + b[k + NN + 1], gy = -b[k - NN - 1] - 2 * b[k - NN] - b[k - NN + 1] + b[k + NN - 1] + 2 * b[k + NN] + b[k + NN + 1]; ink[k] = Math.sqrt(gx * gx + gy * gy) > TT ? 1 : 0; }
      ink = dil(ink, true);
    }
    for (i = 0; i < set.smooth; i++) ink = majority(ink);
    if (set.weight < 2) ink = dil(ink, false); else for (i = 2; i < set.weight; i++) ink = dil(ink, true);
    ink = despeck(ink, set.specks * 2);   // specks are counted in pixels of the 1200 px working size
    var kept = 0, oc = 0, ic = 0, add = 0;
    for (i = 0; i < NN * NN; i++) { if (ink[i]) { ic++; if (orig[i]) kept++; else add++; } if (orig[i]) oc++; }
    return { ink: ink, orig: orig, kp: oc ? Math.round(100 * kept / oc) : 0, ad: ic ? Math.round(100 * add / ic) : 0 };
  }
  function makeStencil() {
    if (!S.design) return;
    var r = stencilCore(SET), ink = r.ink, i, c = SC.getContext('2d'), im = c.createImageData(NN, NN);
    // the mask is softened by one blur and boosted, so line edges are anti-aliased instead of stair-stepped
    var soft = new Float32Array(NN * NN); for (i = 0; i < NN * NN; i++) soft[i] = ink[i]; soft = blur3(soft, 1);
    for (i = 0; i < NN * NN; i++) { var o = i * 4, a = soft[i] < .06 ? 0 : Math.min(1, soft[i] * 1.7); im.data[o] = 255 - 176 * a; im.data[o + 1] = 255 - 202 * a; im.data[o + 2] = 255 - 55 * a; im.data[o + 3] = 255; }
    c.putImageData(im, 0, 0);
    $('kept').textContent = r.kp + '%'; $('lost').textContent = (100 - r.kp) + '%'; $('added').textContent = r.ad + '%'; $('meterFill').style.width = r.kp + '%';
    $('cO').getContext('2d').drawImage(D, 0, 0); $('cS').getContext('2d').drawImage(SC, 0, 0); paintView(); sizeOut();
  }
  /* "Recommended": look at the design, pick line art or photo mode, then try a few detail values and keep the one that keeps the most lines without adding any */
  function recommend() {
    if (!S.design) return;
    var d = D.getContext('2d').getImageData(0, 0, NN, NN).data, dark = 0, n = NN * NN, i;
    for (i = 0; i < n; i += 7) { var v = .299 * d[i * 4] + .587 * d[i * 4 + 1] + .114 * d[i * 4 + 2]; if (v < 235) dark++; }
    var photo = dark / (n / 7) > .5, best = null, cand = [56, 64, 72, 80, 88];
    $('recNote').textContent = '...';
    setTimeout(function () {
      cand.forEach(function (sv) { var st = { mode: photo ? 'photo' : 'draw', sens: sv, smooth: 0, weight: 2, specks: 30 }, r = stencilCore(st), score = r.kp - 0.25 * r.ad; if (!best || score > best.score) best = { score: score, sens: sv }; });
      SET.mode = photo ? 'photo' : 'draw'; SET.sens = best.sens; SET.smooth = 0; SET.weight = 2; SET.specks = 30;
      [['sens', 'sensV'], ['smooth', 'smoothV'], ['weight', 'weightV'], ['specks', 'specksV']].forEach(function (p) { $(p[0]).value = SET[p[0]]; $(p[1]).textContent = SET[p[0]]; });
      [].forEach.call($('smode').children, function (x) { x.setAttribute('aria-pressed', String(x.dataset.v === SET.mode)); });
      makeStencil(); $('recNote').textContent = t('s.recommendedDone');
    }, 30);
  }
  $('recBtn').addEventListener('click', recommend);
  var sT = 0; function later() { cancelAnimationFrame(sT); sT = requestAnimationFrame(makeStencil); }
  [['sens', 'sensV'], ['smooth', 'smoothV'], ['weight', 'weightV'], ['specks', 'specksV']].forEach(function (p) { $(p[0]).addEventListener('input', function () { SET[p[0]] = +this.value; $(p[1]).textContent = this.value; later(); }); });
  $('smode').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; SET.mode = b.dataset.v; [].forEach.call($('smode').children, function (x) { x.setAttribute('aria-pressed', String(x === b)); }); later(); });
  function sizeOut() { var mm = SET.mm, px = Math.round(mm / 25.4 * 300); $('sizeOut').textContent = t('gen.w.sizeOut', { inch: (mm / 25.4).toFixed(1), px: px }); $('ruler').style.setProperty('--cm', (10 / mm * 100) + '%'); }
  $('mm').addEventListener('input', function () { SET.mm = Math.max(10, Math.min(600, +this.value || 88)); sizeOut(); });

  /* ---------- views: tattoo on skin / stencil on skin / print sheet ---------- */
  function paintView() { var c = $('wc2').getContext('2d'); c.clearRect(0, 0, Z, Z); c.drawImage(vmode === 'stencil' ? SC : D, 0, 0); }
  function setView(m) {
    vmode = m; [].forEach.call($('vt').children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.m === m)); });
    $('sheet').hidden = m !== 'sheet'; $('wart').style.visibility = m === 'sheet' ? 'hidden' : '';
    showReal(m === 'art' && realFor === realKey()); paintView();
  }
  $('vt').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b && S.design) setView(b.dataset.m); });
  $('vt').addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  $('toSheet').addEventListener('click', function () { setView('sheet'); $('st4').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); });
  function split(x) { var r = $('sheet').getBoundingClientRect(), p = Math.max(0, Math.min(100, (x - r.left) / r.width * 100)); $('split').value = p; $('hd').style.left = p + '%'; $('cS').style.clipPath = 'inset(0 0 0 ' + p + '%)'; }
  $('cS').style.clipPath = 'inset(0 0 0 50%)';
  $('split').addEventListener('input', function () { var r = $('sheet').getBoundingClientRect(); split(r.left + this.value / 100 * r.width); });
  var sd = false;
  $('sheet').addEventListener('pointerdown', function (e) { sd = true; this.setPointerCapture(e.pointerId); split(e.clientX); e.stopPropagation(); });
  $('sheet').addEventListener('pointermove', function (e) { if (sd) split(e.clientX); });
  $('sheet').addEventListener('pointerup', function () { sd = false; });

  /* ---------- body map, skin tone, placement ---------- */
  function apply() { var a = $('wart'), st = $('wstage'), W = st.clientWidth, H = st.clientHeight, side = W * S.s / 100; a.style.width = S.s + '%'; a.style.left = (S.x / 100 * W - side / 2) + 'px'; a.style.top = (S.y / 100 * H - side / 2) + 'px'; a.style.transform = 'rotate(' + S.r + 'deg)'; $('rs').value = S.s; $('rr').value = S.r; $('rsv').textContent = S.s + '%'; $('rrv').textContent = S.r + '°'; }
  function setSkin() {
    $('wskin').src = '/assets/lib/' + S.part + '_' + S.tone + '.jpg'; clearReal(); $('pname').textContent = t('gen.w.p.' + S.part);
    [].forEach.call($('tones').children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.t === S.tone)); });
    [].forEach.call($('bmap').querySelectorAll('.zone'), function (z) { z.classList.toggle('sel', z.dataset.p === S.part); });
  }
  function dflt() { var d = PARTS[S.part].d; S.x = d.x; S.y = d.y; S.s = d.s; S.r = d.r; apply(); }
  function buildMap() {
    var m = $('bmap'), NS = 'http://www.w3.org/2000/svg', v = S.view; m.innerHTML = '';
    function mk(parent, tag, at) { var e = document.createElementNS(NS, tag); for (var k in at) e.setAttribute(k, at[k]); parent.appendChild(e); return e; }
    mk(m, 'ellipse', { cx: 80, cy: 24, rx: 15, ry: 19, 'class': 'base' }); mk(m, 'path', { d: 'M72 40 L88 40 L90 54 L70 54Z', 'class': 'base' });
    mk(m, 'path', { d: 'M56 50 C70 56 90 56 104 50 C118 54 126 64 124 84 C122 110 116 128 114 146 C112 164 116 182 114 204 L46 204 C44 182 48 164 46 146 C44 128 38 110 36 84 C34 64 42 54 56 50Z', 'class': 'base' });
    function zone(part, d, mirror) {
      var go = function () { S.part = part; setSkin(); dflt(); };
      [false, true].forEach(function (mr) {
        if (mr && !mirror) return;
        var g = mr ? mk(m, 'g', { transform: 'translate(160,0) scale(-1,1)' }) : m, e = mk(g, 'path', { d: d, 'class': 'zone' + (part === S.part ? ' sel' : '') });
        e.dataset.p = part; e.setAttribute('tabindex', '0'); e.setAttribute('role', 'button'); e.setAttribute('aria-label', t('gen.w.p.' + part));
        e.addEventListener('click', go); e.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } });
      });
    }
    if (v === 'front') { zone('chest', 'M58 62 C70 58 90 58 102 62 C108 72 108 92 102 100 C90 104 70 104 58 100 C52 92 52 72 58 62Z', false); zone('ribs', 'M54 106 C70 110 90 110 106 106 C108 122 106 138 104 150 C90 154 70 154 56 150 C54 138 52 122 54 106Z', false); }
    else { zone('shoulder', 'M50 60 C60 56 72 58 77 64 C79 78 77 92 70 100 C60 100 52 94 50 82 C49 74 49 66 50 60Z', true); zone('back', 'M60 106 C70 110 90 110 100 106 C104 124 102 144 100 162 C90 166 70 166 60 162 C58 144 56 124 60 106Z', false); }
    zone('arm', 'M36 66 C26 72 22 92 22 112 C22 124 24 130 28 130 L40 130 C42 112 42 90 44 74Z', true);
    zone('forearm', 'M22 134 C18 152 16 172 16 192 L30 192 C30 172 32 152 36 134Z', true);
    zone('thigh', 'M48 208 C44 240 46 262 52 282 L76 282 C80 262 82 240 78 208Z', true);
    zone('calf', 'M52 288 C50 308 52 324 56 336 L72 336 C76 324 78 308 76 288Z', true);
  }
  $('vw').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return; S.view = b.dataset.v;
    [].forEach.call($('vw').children, function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    if (S.view === 'front' && (S.part === 'shoulder' || S.part === 'back')) S.part = 'chest';
    if (S.view === 'back' && (S.part === 'chest' || S.part === 'ribs')) S.part = 'shoulder';
    buildMap(); setSkin(); dflt();
  });
  TONES.forEach(function (tn) { var b = document.createElement('button'); b.type = 'button'; b.dataset.t = tn[0]; b.title = t('gen.w.t.' + tn[0]); b.setAttribute('aria-label', t('gen.w.t.' + tn[0])); b.style.background = tn[1]; b.addEventListener('click', function () { S.tone = tn[0]; setSkin(); }); $('tones').appendChild(b); });
  var dr = false;
  function mv(e) { var r = $('wstage').getBoundingClientRect(); S.x = Math.max(8, Math.min(92, (e.clientX - r.left) / r.width * 100)); S.y = Math.max(8, Math.min(92, (e.clientY - r.top) / r.height * 100)); apply(); clearReal(); }
  $('wstage').addEventListener('pointermove', function (e) { var r = this.getBoundingClientRect(); $('lamp').style.setProperty('--lx', (e.clientX - r.left) + 'px'); $('lamp').style.setProperty('--ly', (e.clientY - r.top) + 'px'); if (dr) mv(e); });
  $('wstage').addEventListener('pointerdown', function (e) { if (!S.design || vmode === 'sheet') return; dr = true; this.setPointerCapture(e.pointerId); this.style.cursor = 'grabbing'; mv(e); });
  $('wstage').addEventListener('pointerup', function () { dr = false; this.style.cursor = ''; });
  $('rs').addEventListener('input', function () { S.s = +this.value; apply(); clearReal(); });
  $('rr').addEventListener('input', function () { S.r = +this.value; apply(); clearReal(); });
  window.addEventListener('resize', apply); $('wskin').addEventListener('load', apply);

  /* the design develops on the skin, then the skin around it looks a little fresh */
  function develop() {
    var a = $('wart'), c = a.firstElementChild, t0 = performance.now(), dur = reduce ? 1 : 3600; a.style.opacity = 1;
    (function f(n) {
      var p = Math.min(1, (n - t0) / dur), e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2, r = e * 140, m = 'radial-gradient(circle at 50% 50%,#000 ' + (r - 30) + '%,transparent ' + r + '%)';
      c.style.webkitMaskImage = m; c.style.maskImage = m; c.style.filter = 'blur(' + ((1 - e) * 7) + 'px) contrast(' + (.6 + e * .4) + ')'; c.style.opacity = .9 * Math.min(1, e * 2);
      if (p < 1) requestAnimationFrame(f);
      else { c.style.webkitMaskImage = ''; c.style.maskImage = ''; c.style.opacity = .9; c.style.filter = ''; }   // no red glow: the design sits on an opaque white square that only looks transparent through the multiply blend, so a glow would outline the square
    })(t0);
  }

  /* ---------- the generator service ---------- */
  var busy = false, st = $('genStatus'), REF = '', REFMODE = 'inspire';
  function say(k, cls, v) { st.textContent = k ? t(k, v) : ''; st.className = 'wnote' + (cls ? ' ' + cls : ''); }
  function route() {   // with a picture the style is chosen for us (the picture-aware model), so the choice is not drawn
    $('genStyle').hidden = !!REF;
  }
  [].forEach.call($('genStyle').querySelectorAll('button'), function (b) { b.addEventListener('click', function () { S.style = b.getAttribute('data-v'); [].forEach.call($('genStyle').querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', String(x === b)); }); route(); }); });
  $('attBtn').addEventListener('click', function () { $('ref').click(); });
  $('ref').addEventListener('change', function () {
    var f = this.files && this.files[0]; if (!f) return;
    if (f.size > 12e6) { say('gen.w.errBig', 'err'); return; }
    var r = new FileReader();
    r.onload = function () {
      var im = new Image();
      im.onload = function () {   // downscaled and re-encoded here: smaller upload, and the photo's metadata (location, camera) does not leave the device
        var k = Math.min(1, 1024 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
        var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
        REF = c.toDataURL('image/jpeg', .86); $('thumb').src = REF; $('thumbw').hidden = false; $('refmode').hidden = false; say(''); route();
      };
      im.onerror = function () { say('gen.w.errImg', 'err'); };
      im.src = r.result;
    };
    r.readAsDataURL(f);
  });
  $('attX').addEventListener('click', function () { REF = ''; $('ref').value = ''; $('thumbw').hidden = true; $('refmode').hidden = true; route(); });
  $('refmode').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; REFMODE = b.dataset.m; [].forEach.call($('refmode').children, function (x) { x.setAttribute('aria-pressed', String(x === b)); }); });

  /* Cloudflare Turnstile (free bot check): a fresh one-time token for every request; the widget stays invisible unless Cloudflare wants proof. */
  var tsKey = C.turnstileSiteKey || '', tsLoad = null;
  function tsScript() { if (!tsLoad) tsLoad = new Promise(function (ok, no) { var s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); return tsLoad; }
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
  function licenseKey() { try { var s = JSON.parse(localStorage.getItem('skinstencil.license') || 'null'); return s && unlocked() ? s.key : ''; } catch (e) { return ''; } }
  var ERR = { limit_free: 's.gen.errLimitFree', limit_paid: 's.gen.errLimitPaid', budget: 's.gen.errBudget', bot: 's.gen.errBot' };
  /* one call to the Worker: returns the picture as a blob, or throws {key} with the message to show */
  function ask(path, body) {
    var h = { 'Content-Type': 'application/json' }, key = licenseKey(); if (key) h['X-License'] = key;
    return humanToken().then(function (hu) {
      if (hu.id != null) { try { window.turnstile.remove(hu.id); } catch (e) {} }
      body.turnstile = hu.tok;
      return fetch(base + path, { method: 'POST', headers: h, body: JSON.stringify(body) });
    }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) { throw { key: (path === '/place' && (j.error === 'limit_free' || j.error === 'limit_paid')) ? 'gen.w.errPlaceLimit' : (ERR[j.error] || 's.gen.errUpstream') }; });
      var left = r.headers.get('X-Remaining'); return r.blob().then(function (b) { return { blob: b, left: left }; });
    }, function (e) { throw { key: e && e.message === 'bot' ? 's.gen.errBot' : 's.gen.errNetwork' }; });
  }
  function blobImg(blob) { return new Promise(function (ok, no) { var u = URL.createObjectURL(blob), im = new Image(); im.onload = function () { ok({ im: im, u: u }); }; im.onerror = function () { URL.revokeObjectURL(u); no({ key: 's.gen.errUpstream' }); }; im.src = u; }); }

  function create() {
    if (busy) return;
    var p = $('genPrompt').value.replace(/\s+/g, ' ').trim();
    if (p.length < 3 && !REF) { say('s.gen.errShort', 'err'); return; }
    busy = true; $('genBtn').disabled = true; say('s.gen.busy');
    var body = { prompt: p, style: S.style }; if (REF) { body.ref = REF; body.refMode = REFMODE; }
    ask('/generate', body).then(function (r) { return blobImg(r.blob).then(function (o) { setDesign(o.im, false); URL.revokeObjectURL(o.u); SET.mode = 'draw'; dflt(); develop(); say(r.left != null ? 's.gen.left' : '', 'ok', { n: r.left }); $('wstage').scrollIntoView({ block: 'nearest' }); }); })
      .catch(function (e) { say(e && e.key ? e.key : 's.gen.errNetwork', 'err'); })
      .then(function () { busy = false; $('genBtn').disabled = false; });
  }
  $('genBtn').addEventListener('click', create);

  /* ---------- "Show it realistic": the AI places the finished design on this stock photo ---------- */
  function realKey() { return S.part + '|' + S.tone + '|' + did + '|' + S.x + '|' + S.y + '|' + S.s + '|' + S.r; }
  function showReal(on) { $('wreal').style.opacity = on ? 1 : 0; if (on) { var tg = $('wtag'); tg.textContent = t('gen.w.realTag'); tg.hidden = false; } else exampleTag(S.example && vmode === 'art'); $('real').textContent = t(on ? 'gen.w.realBack' : 'gen.w.real'); }
  function clearReal() { if (realFor) { realFor = ''; showReal(false); } }
  $('real').addEventListener('click', function () {
    if (!S.design || busy) return;
    if (realFor === realKey()) { clearReal(); return; }
    var n = $('rnote'); busy = true; $('real').disabled = true; n.className = 'wnote'; n.textContent = t('gen.w.realBusy');
    var c = document.createElement('canvas'); c.width = c.height = 640; c.getContext('2d').drawImage(D, 0, 0, 640, 640);
    ask('/place', { part: S.part, tone: S.tone, design: c.toDataURL('image/jpeg', .9), x: S.x, y: S.y, s: S.s, r: S.r })
      .then(function (r) { var u = URL.createObjectURL(r.blob), im = $('wreal'); im.onload = function () { realFor = realKey(); setView('art'); showReal(true); URL.revokeObjectURL(u); }; im.src = u; n.textContent = t('gen.w.realNote'); n.className = 'wnote ok'; })
      .catch(function (e) { n.textContent = t(e && e.key ? e.key : 's.gen.errNetwork'); n.className = 'wnote err'; })
      .then(function () { busy = false; $('real').disabled = false; });
  });

  /* ---------- download and print ---------- */
  function blobOut(cb) {
    var px = Math.round(SET.mm / 25.4 * 300), c = document.createElement('canvas'); c.width = c.height = px;
    var x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(SC, 0, 0, px, px);
    if (!unlocked() && window.SkinPng) window.SkinPng.watermark(x, px, px, .5);
    c.toBlob(function (b) { if (!b) return; if (!window.SkinPng) return cb(b); b.arrayBuffer().then(function (ab) { cb(new Blob([window.SkinPng.withDpi(new Uint8Array(ab), 300)], { type: 'image/png' })); }); }, 'image/png');
  }
  $('dlBtn').addEventListener('click', function () { if (!S.design) return; blobOut(function (bl) { var a = document.createElement('a'); a.href = URL.createObjectURL(bl); a.download = 'skinstencil-stencil.png'; document.body.appendChild(a); a.click(); a.remove(); $('dlNote').textContent = t('gen.w.saved', { mm: SET.mm }); }); });
  $('printBtn').addEventListener('click', function () {
    if (!S.design) return;
    blobOut(function (bl) {
      var u = URL.createObjectURL(bl), w = window.open('', '_blank'); if (!w) { $('dlNote').textContent = t('gen.w.popup'); return; }
      w.document.write('<title>Stencil</title><style>@page{margin:10mm}body{margin:0}img{width:' + SET.mm + 'mm;height:auto;display:block}</style><img src="' + u + '" onload="print()">'); w.document.close();
    });
  });
  $('toStudio').addEventListener('click', function (e) { if (!S.design) return; e.preventDefault(); try { sessionStorage.setItem('skinstencil.handoff', D.toDataURL('image/png')); } catch (er) { /* storage full or blocked: the Studio then opens with its sample */ } location.href = $('genBox').getAttribute('data-studio') + '?from=ai'; });
  if (unlocked()) $('wmNote').hidden = true;

  /* phones: the preview is small so the form stays usable; this opens it full screen */
  function setBig(on) {
    var sc = document.querySelector('.stagecol'), x = $('xp'); sc.classList.toggle('big', on); document.documentElement.style.overflow = on ? 'hidden' : '';
    x.setAttribute('aria-label', x.getAttribute(on ? 'data-collapse' : 'data-expand')); setTimeout(apply, 30);
  }
  $('xp').addEventListener('click', function (e) { e.stopPropagation(); setBig(!document.querySelector('.stagecol').classList.contains('big')); });
  $('xp').addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  window.addEventListener('resize', function () { if (window.innerWidth > 860) setBig(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setBig(false); });

  /* ---------- start ---------- */
  if (!base) { $('st1').hidden = true; $('real').hidden = true; }   // a control that cannot be used is not drawn
  buildMap(); setSkin(); dflt(); sizeOut(); route(); onScroll();
  // an example design is on the skin from the start, labelled as an example, so the stencil and the body map can be tried before anything is made
  var ex = new Image(); ex.onload = function () { if (S.design) return; setDesign(ex, true); dflt(); develop(); }; ex.src = '/assets/example-wolf.webp';
})();
