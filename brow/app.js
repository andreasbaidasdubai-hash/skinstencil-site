/* Skinstencil brow mapping. Everything runs in the browser: the photo is never uploaded or stored, and the face model (MediaPipe Face Landmarker)
   is served from this site (/vendor/mediapipe, /models), so the page makes no third-party requests.
   The geometry is in js/brow-geometry.js, the drawing in js/brow-render.js, PNG helpers in js/png-util.js. Free downloads carry the same watermark as the studio. */
(function () {
  'use strict';
  var G = window.SkinBrowGeo, R = window.SkinBrowRender, PNG = window.SkinPng, U = window.SkinUnlock, C = window.SkinConfig || {}, T = window.I18N || {}, V = G.vec;
  var $ = function (id) { return document.getElementById(id); };
  function t(k, v) { var s = T[k] != null ? T[k] : k; if (v) for (var n in v) s = s.split('{' + n + '}').join(v[n]); return s; }
  var MAX_SIDE = 2000, CARD_MM = 85.6, ROLL_WARN = 5, TURN_LO = 0.87, TURN_HI = 1.15, SMALL_PX = 150;
  var SIDES = ['R', 'L'];

  var S = { work: null, w: 0, h: 0, pts: null, orig: null, mk: null, manual: null, mode: 'ipd', card: null, delegate: '', busy: false };
  var cv = $('cv'), ctx = cv.getContext('2d'), stage = $('stage'), layer = $('handles');
  var LM = null, LMLoading = null, handleEls = [], raf = 0;

  function setStatus(k, cls, vars) { var s = $('status'); s.textContent = k ? t(k, vars) : ''; s.className = 'status' + (cls ? ' ' + cls : ''); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- consent gate: nothing loads until it is ticked; unticking removes the photo ---------- */
  var consent = $('consent'), drop = $('drop'), file = $('file');
  function gate() {
    var ok = consent.checked;
    drop.setAttribute('aria-disabled', String(!ok)); drop.tabIndex = ok ? 0 : -1; drop.classList.toggle('locked', !ok);
    $('dropText').textContent = ok ? t('brow.drop') : t('brow.dropLocked');
    if (!ok && S.work) clearPhoto();
  }
  consent.addEventListener('change', gate);

  /* ---------- loading a photo ---------- */
  drop.addEventListener('click', function () { if (consent.checked) file.click(); });
  drop.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && consent.checked) { e.preventDefault(); file.click(); } });
  ['dragover', 'dragenter'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); if (consent.checked) drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files[0]; if (!consent.checked) { setStatus('brow.dropLocked', 'err'); return; } if (f) loadFile(f); });
  file.addEventListener('change', function () { if (consent.checked && file.files[0]) loadFile(file.files[0]); file.value = ''; });

  function decode(f) {
    if (window.createImageBitmap) return createImageBitmap(f, { imageOrientation: 'from-image' }).catch(function () { return viaImg(f); });
    return viaImg(f);
  }
  function viaImg(f) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(f), im = new Image();
      im.onload = function () { URL.revokeObjectURL(u); res(im); }; im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('read')); }; im.src = u;
    });
  }
  function loadFile(f) {
    if (S.busy) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { setStatus('brow.errType', 'err'); return; }
    S.busy = true; setStatus('brow.loading');
    decode(f).then(function (img) {
      var iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight, k = Math.min(1, MAX_SIDE / Math.max(iw, ih));
      var c = document.createElement('canvas'); c.width = Math.max(2, Math.round(iw * k)); c.height = Math.max(2, Math.round(ih * k));
      var x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height); if (img.close) img.close();
      S.work = c; S.w = c.width; S.h = c.height; S.pts = null; S.mk = null;
      stage.style.aspectRatio = S.w + '/' + S.h; cv.width = S.w; cv.height = S.h; $('ph').hidden = true;
      return detect(c);
    }).then(function (res) {
      S.busy = false;
      if (!S.work) return;
      if (res && res.pts) { start(res.pts, false); setStatus(res.many ? 'brow.foundMany' : 'brow.found', 'ok', { d: S.delegate }); }
      else { start(G.template(S.w, S.h), true); setStatus(res && res.error === 'model' ? 'brow.errModel' : 'brow.errNoFace', 'err'); }
    }).catch(function () { S.busy = false; setStatus('brow.errRead', 'err'); });
  }

  /* ---------- face model (self-hosted; GPU delegate first, CPU if it cannot start) ---------- */
  function createLandmarker(mod, fileset, delegate) {
    return mod.FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: delegate }, runningMode: 'IMAGE', numFaces: 2 });
  }
  function getLandmarker() {
    if (LM) return Promise.resolve(LM);
    if (LMLoading) return LMLoading;
    LMLoading = import('/vendor/mediapipe/vision_bundle.mjs').then(function (mod) {
      return mod.FilesetResolver.forVisionTasks('/vendor/mediapipe').then(function (fs) {
        S.mod = mod; S.fs = fs;
        return createLandmarker(mod, fs, 'GPU').then(function (l) { S.delegate = 'GPU'; return l; }, function () { return createLandmarker(mod, fs, 'CPU').then(function (l) { S.delegate = 'CPU'; return l; }); });
      });
    }).then(function (l) { LM = l; return l; }, function (e) { LMLoading = null; throw e; });
    return LMLoading;
  }
  function detectOnce(l, canvas) { return l.detect(canvas); }
  function detect(canvas) {
    return getLandmarker().then(function (l) {
      var r; try { r = detectOnce(l, canvas); } catch (e) { r = null; }
      if (r) return r;
      /* the GPU delegate can fail only when it first runs: rebuild on the CPU and try again */
      if (S.delegate === 'GPU') return createLandmarker(S.mod, S.fs, 'CPU').then(function (l2) { try { l.close(); } catch (e) {} LM = l2; S.delegate = 'CPU'; return detectOnce(l2, canvas); });
      throw new Error('detect');
    }).then(function (r) {
      var faces = (r && r.faceLandmarks) || [];
      if (!faces.length) return { error: 'none' };
      var best = faces[0], area = -1;
      faces.forEach(function (f) { var a = 0, x0 = 1, x1 = 0, y0 = 1, y1 = 0; f.forEach(function (p) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }); a = (x1 - x0) * (y1 - y0); if (a > area) { area = a; best = f; } });
      return { pts: G.fromLandmarks(best, S.w, S.h), many: faces.length > 1 };
    }).catch(function () { return { error: 'model' }; });
  }

  /* ---------- the guide model ---------- */
  function start(pts, manualPlacement) {
    S.pts = pts; S.orig = clone(pts); S.manual = { R: { S: false, A: false, E: false }, L: { S: false, A: false, E: false } };
    S.card = [V.P(S.w * 0.3, S.h * 0.88), V.P(S.w * 0.7, S.h * 0.88)];
    S.byHand = !!manualPlacement;
    recompute(); buildHandles(); setEnabled(true); renderAll();
  }
  function frame() { return G.frame(S.pts.R.pupil, S.pts.L.pupil); }
  function recompute() {
    var F = frame();
    SIDES.forEach(function (s) {
      var sg = G.suggest(F, S.pts[s]); S.mk = S.mk || { R: {}, L: {} };
      ['S', 'A', 'E'].forEach(function (n) { if (!S.manual[s][n] || !S.mk[s][n]) S.mk[s][n] = sg[n]; });
    });
  }
  function mmPerPx() {
    if (S.mode === 'card' && S.card) return G.mmPerPxFromCard(CARD_MM, S.card[0], S.card[1]);
    return G.mmPerPxFromIpd(Math.max(30, Math.min(100, +$('ipd').value || 63)), S.pts.R.pupil, S.pts.L.pupil);
  }
  function model() { return { pts: S.pts, mk: S.mk, pxPerMm: 1 / mmPerPx() }; }

  /* ---------- on-screen drawing ---------- */
  function renderAll() { if (!S.pts) return; paint(); measure(); positionHandles(); }
  function schedule() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; renderAll(); }); }
  function paint() {
    var rect = cv.getBoundingClientRect(), cs = rect.width > 0 ? S.w / rect.width : 1;
    ctx.clearRect(0, 0, S.w, S.h); ctx.drawImage(S.work, 0, 0);
    R.draw(ctx, model(), { x0: 0, y0: 0, k: 1 }, { lw: 1.7 * cs, mr: 11 * cs, font: 12 * cs, outline: $('vOutline').checked && !S.byHand, level: $('vLevel').checked, letters: $('vLetters').checked, halo: true });
    if (S.mode === 'card' && S.card) {
      var a = S.card[0], b = S.card[1];
      ctx.setLineDash([]); ctx.lineWidth = 3 * cs; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.lineWidth = 1.6 * cs; ctx.strokeStyle = '#4F35C8'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      [a, b].forEach(function (p) { ctx.beginPath(); ctx.arc(p.x, p.y, 8 * cs, 0, Math.PI * 2); ctx.fillStyle = '#4F35C8'; ctx.fill(); ctx.lineWidth = 2 * cs; ctx.strokeStyle = '#fff'; ctx.stroke(); });
    }
  }

  /* ---------- draggable points (pointer events; arrow keys move the focused point) ---------- */
  function defs() {
    var d = [];
    SIDES.forEach(function (s) {
      ['S', 'A', 'E'].forEach(function (n) { d.push({ key: s + n, side: s, name: n, kind: 'mk', get: function () { return S.mk[s][n]; }, set: function (p) { S.mk[s][n] = p; S.manual[s][n] = true; } }); });
    });
    SIDES.forEach(function (s) {
      ['ala', 'iris', 'outer', 'inner'].forEach(function (n) { d.push({ key: s + n, side: s, name: n, kind: 'pt', get: function () { return S.pts[s][n]; }, set: function (p) { S.pts[s][n] = p; } }); });
      d.push({ key: s + 'pupil', side: s, name: 'pupil', kind: 'pt', get: function () { return S.pts[s].pupil; }, set: function (p) { var o = S.pts[s].pupil, dx = p.x - o.x, dy = p.y - o.y; S.pts[s].pupil = p; S.pts[s].iris = V.P(S.pts[s].iris.x + dx, S.pts[s].iris.y + dy); } });
    });
    [0, 1].forEach(function (i) { d.push({ key: 'card' + i, name: 'card' + (i + 1), kind: 'card', get: function () { return S.card[i]; }, set: function (p) { S.card[i] = p; } }); });
    return d;
  }
  function labelOf(d) {
    var side = d.side ? t('brow.side.' + d.side) + ': ' : '';
    return side + t('brow.pt.' + d.name);
  }
  function buildHandles() {
    layer.innerHTML = ''; handleEls = [];
    defs().forEach(function (d) {
      var e = document.createElement('div');
      e.className = 'pt pt-' + d.kind; e.tabIndex = 0; e.setAttribute('role', 'button'); e.setAttribute('aria-label', labelOf(d)); e.setAttribute('aria-describedby', 'kbHint'); e.title = labelOf(d);
      e.dataset.key = d.key; e._d = d;
      e.addEventListener('pointerdown', function (ev) { ev.preventDefault(); e.setPointerCapture(ev.pointerId); e.classList.add('drag'); e.focus({ preventScroll: true }); });
      e.addEventListener('pointermove', function (ev) { if (!e.hasPointerCapture(ev.pointerId)) return; moveTo(d, ev.clientX, ev.clientY); });
      var up = function (ev) { e.classList.remove('drag'); try { e.releasePointerCapture(ev.pointerId); } catch (x) {} };
      e.addEventListener('pointerup', up); e.addEventListener('pointercancel', up);
      e.addEventListener('keydown', function (ev) {
        var dx = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0, dy = ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowUp' ? -1 : 0;
        if (!dx && !dy) return; ev.preventDefault();
        var rect = cv.getBoundingClientRect(), step = (ev.shiftKey ? 10 : 1) * S.w / rect.width, p = d.get();
        apply(d, V.P(clamp(p.x + dx * step, 0, S.w), clamp(p.y + dy * step, 0, S.h)));
      });
      layer.appendChild(e); handleEls.push(e);
    });
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function moveTo(d, cx, cy) {
    var rect = cv.getBoundingClientRect();
    apply(d, V.P(clamp((cx - rect.left) / rect.width * S.w, 0, S.w), clamp((cy - rect.top) / rect.height * S.h, 0, S.h)));
  }
  function apply(d, p) { d.set(p); recompute(); schedule(); }
  function positionHandles() {
    handleEls.forEach(function (e) {
      var d = e._d, show = d.kind !== 'card' || S.mode === 'card';
      e.hidden = !show; if (!show) return;
      var p = d.get(); e.style.left = (p.x / S.w * 100) + '%'; e.style.top = (p.y / S.h * 100) + '%';
    });
  }

  /* ---------- measurements ---------- */
  var ROWS = [['width', 'brow.m.width', 1], ['length', 'brow.m.length', 1], ['arch', 'brow.m.arch', 1], ['tail', 'brow.m.tail', 'deg'], ['level', 'brow.m.level', 1], ['thickness', 'brow.m.thick', 1]];
  (function buildTable() {
    var tb = $('mBody'); tb.innerHTML = '';
    ROWS.forEach(function (r) {
      var tr = document.createElement('tr'); tr.innerHTML = '<th scope="row"></th><td id="m-' + r[0] + '-R"></td><td id="m-' + r[0] + '-L"></td>';
      tr.firstChild.textContent = t(r[1]); tb.appendChild(tr);
    });
  })();
  function fmt(v, kind) { if (!isFinite(v)) return '-'; return v.toFixed(1) + (kind === 'deg' ? '°' : ''); }
  function measure() {
    var F = frame(), mm = mmPerPx(), res = {};
    SIDES.forEach(function (s) { res[s] = G.measureSide(F, S.mk[s].S, S.mk[s].A, S.mk[s].E, mm, S.pts[s].brow); });
    ROWS.forEach(function (r) { SIDES.forEach(function (s) { $('m-' + r[0] + '-' + s).textContent = (r[0] === 'thickness' && S.byHand) ? '-' : fmt(res[s][r[0]], r[2] === 'deg' ? 'deg' : ''); }); });
    var st = G.startsDistance(F, S.mk.R.S, S.mk.L.S, mm);
    $('m-starts').textContent = fmt(st.across); $('m-startlevel').textContent = fmt(st.level);
    $('m-scale').textContent = (mm * 100).toFixed(1) + ' mm / 100 px'; $('m-roll').textContent = F.roll.toFixed(1) + '°';
    var w = [], roll = F.roll;
    if (Math.abs(roll) > ROLL_WARN) w.push(t('brow.w.tilt', { deg: Math.abs(roll).toFixed(1) }));
    var tr = G.turnRatio(S.pts.noseTip, S.pts.R.outer, S.pts.L.outer);
    if (tr < TURN_LO || tr > TURN_HI) w.push(t('brow.w.turn'));
    if (F.ipd < SMALL_PX) w.push(t('brow.w.small'));
    if (S.byHand) w.push(t('brow.w.byhand'));
    var box = $('warn'); box.innerHTML = ''; box.hidden = !w.length;
    w.forEach(function (x) { var p = document.createElement('p'); p.textContent = x; box.appendChild(p); });
    return res;
  }

  /* ---------- controls ---------- */
  function setEnabled(on) {
    ['dlGuides', 'dlPhoto', 'printBtn', 'resetBtn', 'clearBtn', 'manualBtn'].forEach(function (id) { $(id).disabled = !on; });
    $('ph').hidden = on; layer.hidden = !on;
  }
  ['vOutline', 'vLevel', 'vLetters'].forEach(function (id) { $(id).addEventListener('change', schedule); });
  $('ipd').addEventListener('input', schedule);
  [].forEach.call($('scaleMode').querySelectorAll('button'), function (b) {
    b.addEventListener('click', function () {
      S.mode = b.getAttribute('data-v');
      [].forEach.call($('scaleMode').querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      $('ipdBox').hidden = S.mode !== 'ipd'; $('cardBox').hidden = S.mode !== 'card'; schedule();
    });
  });
  $('manualBtn').addEventListener('click', function () { if (!S.work) return; start(G.template(S.w, S.h), true); setStatus('brow.byHandOn', 'ok'); });
  $('resetBtn').addEventListener('click', function () { if (!S.orig) return; start(clone(S.orig), S.byHand); setStatus('brow.resetDone', 'ok'); });
  $('clearBtn').addEventListener('click', clearPhoto);
  function clearPhoto() {
    S.work = null; S.pts = null; S.orig = null; S.mk = null; S.byHand = false; ctx.clearRect(0, 0, cv.width, cv.height); layer.innerHTML = ''; handleEls = [];
    stage.style.aspectRatio = '7/5'; setEnabled(false); $('warn').hidden = true; setStatus(''); $('ph').hidden = false;
    ['m-starts', 'm-startlevel', 'm-scale', 'm-roll'].forEach(function (id) { $(id).textContent = '-'; });
    ROWS.forEach(function (r) { SIDES.forEach(function (s) { $('m-' + r[0] + '-' + s).textContent = '-'; }); });
  }
  window.addEventListener('resize', schedule);

  /* ---------- exports: the same drawing at true size, cropped to the guides, with a ruler bar ---------- */
  function buildOutput(kind) {
    if (!S.pts) return null;
    var un = U.isUnlocked(), maxPx = un ? C.paidMaxPx : C.freeMaxPx, mm = mmPerPx(), ppm = 1 / mm;
    var m = model(), ext = R.extent(m, 14 * ppm), mg = 8 * ppm, x0 = ext.x0 - mg, y0 = ext.y0 - mg, bw = ext.x1 - ext.x0 + 2 * mg, bh = ext.y1 - ext.y0 + 2 * mg;
    var STRIP = 18, wMm = bw * mm, hMm = bh * mm + STRIP;
    var tw = Math.round(wMm / 25.4 * 300), th = Math.round(hMm / 25.4 * 300), sc = Math.min(1, maxPx / Math.max(tw, th));
    tw = Math.max(40, Math.round(tw * sc)); th = Math.max(40, Math.round(th * sc));
    var opm = tw / wMm, k = opm * mm;                       /* output px per mm, output px per source px */
    var out = document.createElement('canvas'); out.width = tw; out.height = th; var x = out.getContext('2d');
    var transparent = kind === 'guides' && $('ground').value === 'transparent';
    if (!transparent) { x.fillStyle = '#fff'; x.fillRect(0, 0, tw, th); }
    if (kind === 'photo') { x.save(); x.beginPath(); x.rect(0, 0, bw * k, bh * k); x.clip(); x.imageSmoothingQuality = 'high'; x.drawImage(S.work, -x0 * k, -y0 * k, S.w * k, S.h * k); x.restore(); }
    R.draw(x, m, { x0: x0, y0: y0, k: k }, { lw: Math.max(1.2, 0.3 * opm), mr: Math.max(5, 2.1 * opm), font: Math.max(8, 2.6 * opm), outline: $('vOutline').checked && !S.byHand, level: $('vLevel').checked, letters: true, halo: kind === 'photo' });
    /* ruler bar and the scale used, in the strip under the drawing */
    var rl = wMm >= 120 ? 100 : wMm >= 60 ? 50 : 20, step = rl >= 50 ? 10 : 5, by = bh * k + 5 * opm, bx = 4 * opm;
    x.strokeStyle = '#17161C'; x.fillStyle = '#17161C'; x.lineWidth = Math.max(1, 0.25 * opm); x.beginPath(); x.moveTo(bx, by); x.lineTo(bx + rl * opm, by); x.stroke();
    x.font = '500 ' + Math.max(8, 2.4 * opm) + 'px "IBM Plex Mono", ui-monospace, monospace'; x.textBaseline = 'top'; x.textAlign = 'center';
    for (var i = 0; i <= rl; i += step) { var tx = bx + i * opm; x.beginPath(); x.moveTo(tx, by); x.lineTo(tx, by - (i % (step * 5) === 0 || i === rl ? 3 : 2) * opm); x.stroke(); if (i === 0 || i === rl) x.fillText(i === rl ? rl + ' mm' : '0', tx, by + 0.8 * opm); }
    x.textAlign = 'left'; x.fillStyle = '#5E5C68'; x.font = '500 ' + Math.max(8, 2.2 * opm) + 'px "IBM Plex Mono", ui-monospace, monospace';
    var basis = S.mode === 'card' ? t('brow.x.card') : t('brow.x.ipd', { mm: String(Math.max(30, Math.min(100, +$('ipd').value || 63))) });
    x.fillText(basis, bx, by + 5 * opm); x.fillText(t('brow.x.aid'), bx, by + 8.2 * opm);
    if (!un) PNG.watermark(x, tw, th, kind === 'photo' ? 0.3 : 0.3);
    return { canvas: out, un: un, wMm: wMm, hMm: hMm };
  }
  function setDl(k, cls, vars) { var s = $('dlStatus'); s.textContent = k ? t(k, vars) : ''; s.className = 'status' + (cls ? ' ' + cls : ''); }
  function dlState() {
    var un = U.isUnlocked(), px = un ? C.paidMaxPx : C.freeMaxPx;
    setDl(un ? 's.dl.paid' : 's.dl.free', un ? 'ok' : '', { px: px });
    $('unlockBtn').hidden = un; if (un) $('plansBox').hidden = true; $('keyOut').hidden = !un;
  }
  function download(kind, btn) {
    var o = buildOutput(kind); if (!o) return;
    btn.disabled = true; setDl('s.dl.busy');
    o.canvas.toBlob(function (blob) {
      blob.arrayBuffer().then(function (buf) {
        var bytes = new Uint8Array(buf); if (o.un) bytes = PNG.withDpi(bytes, 300);
        var url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' })), a = document.createElement('a');
        a.href = url; a.download = 'skinstencil-brow-' + (kind === 'photo' ? 'on-photo' : 'guides') + '-' + Math.round(o.wMm) + 'mm' + (o.un ? '' : '-free') + '.png';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000); btn.disabled = false; dlState();
      });
    }, 'image/png');
  }
  /* Print: a clean page with the guides at their true width in millimetres, ruler bar included, then the print dialog. Free prints carry the watermark. */
  function printTrue() {
    var o = buildOutput('guides'); if (!o) return;
    var w = window.open('', '_blank'); if (!w) { setDl('s.dl.network', 'err'); return; }
    var uri = o.canvas.toDataURL('image/png');
    w.document.write('<!doctype html><title>skinstencil brow mapping ' + Math.round(o.wMm) + ' mm</title><style>@page{margin:8mm}html,body{margin:0;background:#fff}img{display:block;width:' + o.wMm.toFixed(2) + 'mm;height:auto}</style><img src="' + uri + '" onload="setTimeout(function(){window.print()},150)">');
    w.document.close();
    if (o.wMm > 194) setDl('brow.w.wide', 'err', { mm: Math.round(o.wMm) });
  }
  $('dlGuides').addEventListener('click', function () { download('guides', this); });
  $('dlPhoto').addEventListener('click', function () { download('photo', this); });
  $('printBtn').addEventListener('click', printTrue);
  $('unlockBtn').addEventListener('click', function () { $('plansBox').hidden = !$('plansBox').hidden; });

  /* checkout links and the license key box: the same as the studio, one price list for both tools */
  var anyLive = false, money = function (v) { try { return new Intl.NumberFormat('en', { style: 'currency', currency: (C.prices || {}).currency || 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(+v); } catch (e) { return v; } };
  [].forEach.call(document.querySelectorAll('a.buy'), function (a) {
    var plan = a.getAttribute('data-plan'), url = (C.checkout || {})[plan], price = (C.prices || {})[plan];
    a.textContent = t('s.dl.' + plan) + (price ? ' - ' + money(price) : '');
    if (url) { a.href = url; a.target = '_blank'; a.rel = 'noopener'; anyLive = true; }
    else { a.href = 'mailto:' + (C.notifyEmail || '') + '?subject=Checkout%20interest%20' + plan; }
  });
  if (!anyLive) $('soon').hidden = false;
  $('keyBtn').addEventListener('click', function () {
    var s = $('keyStatus'); s.className = 'status'; s.textContent = t('s.dl.checking');
    U.activate($('keyIn').value).then(function (v) {
      if (v.ok) { s.textContent = t('s.dl.ok'); s.className = 'status ok'; dlState(); return; }
      var map = { invalid: 's.dl.invalid', expired: 's.dl.expired', network: 's.dl.network', notConfigured: 's.dl.notConfigured' };
      s.textContent = t(map[v.reason] || 's.dl.invalid'); s.className = 'status err';
    });
  });
  $('keyOut').addEventListener('click', function () { U.clear(); $('keyStatus').textContent = ''; dlState(); });
  dlState(); U.refresh().then(dlState);
  if (/[?&]thanks=1/.test(location.search)) { $('thanks').hidden = false; $('keyBox').open = true; }

  clearPhoto(); gate();
  /* a small hook for the bench: lets a test place fabricated landmarks without a photo of a person */
  window.SkinBrowApp = { _start: function (pts, w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; var x = c.getContext('2d'); x.fillStyle = '#d9d6dd'; x.fillRect(0, 0, w, h); S.work = c; S.w = w; S.h = h; stage.style.aspectRatio = w + '/' + h; cv.width = w; cv.height = h; start(pts, false); }, _state: function () { return S; } };
})();
