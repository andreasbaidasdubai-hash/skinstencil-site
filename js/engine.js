/* Skinstencil engine: the classic stencil filter, drift check and sample designs. Runs in the browser, uploads nothing.
   Shared by the landing page demos and the free studio tool. Exposes window.SkinEngine.
   v2: lines are built as soft (anti-aliased) ink instead of a hard on/off mask, so edges stay sharp and smooth at any zoom. */
(function (g) {
  'use strict';

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function boxBlur(src, w, h, r) {
    if (r < 1) return src;
    var tmp = new Float32Array(w * h), out = new Float32Array(w * h), d = 2 * r + 1, x, y, s, row;
    for (y = 0; y < h; y++) { row = y * w; s = 0;
      for (x = -r; x <= r; x++) s += src[row + Math.min(w - 1, Math.max(0, x))];
      for (x = 0; x < w; x++) { tmp[row + x] = s / d; s += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)]; } }
    for (x = 0; x < w; x++) { s = 0;
      for (y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (y = 0; y < h; y++) { out[y * w + x] = s / d; s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
    return out;
  }
  /* max filter (grey dilation) with a square window of radius k, on any numeric array */
  function maxFilter(src, w, h, k, Type) {
    if (k < 1) return src;
    var t = new Type(w * h), o = new Type(w * h), x, y, i, a, b, m, row;
    for (y = 0; y < h; y++) { row = y * w;
      for (x = 0; x < w; x++) { a = Math.max(0, x - k); b = Math.min(w - 1, x + k); m = 0; for (i = a; i <= b; i++) { if (src[row + i] > m) m = src[row + i]; } t[row + x] = m; } }
    for (x = 0; x < w; x++) {
      for (y = 0; y < h; y++) { a = Math.max(0, y - k); b = Math.min(h - 1, y + k); m = 0; for (i = a; i <= b; i++) { if (t[i * w + x] > m) m = t[i * w + x]; } o[y * w + x] = m; } }
    return o;
  }
  function dilate(m, w, h, k) { return maxFilter(m, w, h, k, Uint8Array); }

  function removeSpecks(m, w, h, minSize) {
    if (minSize < 2) return m;
    var out = new Uint8Array(m), seen = new Uint8Array(w * h), stack = new Int32Array(w * h), buf = new Int32Array(w * h), i, sp, n, p, x, y, dx, dy, q, nx, ny, j;
    for (i = 0; i < w * h; i++) {
      if (!m[i] || seen[i]) continue;
      sp = 0; n = 0; stack[sp++] = i; seen[i] = 1;
      while (sp > 0) { p = stack[--sp]; buf[n++] = p; x = p % w; y = (p / w) | 0;
        for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; nx = x + dx; ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; q = ny * w + nx; if (m[q] && !seen[q]) { seen[q] = 1; stack[sp++] = q; } } }
      if (n < minSize) for (j = 0; j < n; j++) out[buf[j]] = 0;
    }
    return out;
  }

  /* Soft ink in [0,1]: 0.5 sits exactly on the old hard threshold, and it ramps over a few grey levels so edges are anti-aliased. */
  function inkField(gray, w, h, mode, sens, smooth) {
    var sm = boxBlur(gray, w, h, smooth), out = new Float32Array(w * h), i;
    if (mode === 'draw') {
      var lr = Math.max(6, Math.round(Math.min(w, h) / 45)), local = boxBlur(sm, w, h, lr), c = 46 - 0.43 * sens, soft = 20;
      for (i = 0; i < w * h; i++) out[i] = clamp01((local[i] - sm[i] - c) / soft + 0.5);
    } else {
      var mag = new Float32Array(w * h), x, y, gx, gy, a, b, c2, d, f, gg, hh, ii;
      for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) { i = y * w + x;
        a = sm[i - w - 1]; b = sm[i - w]; c2 = sm[i - w + 1]; d = sm[i - 1]; f = sm[i + 1]; gg = sm[i + w - 1]; hh = sm[i + w]; ii = sm[i + w + 1];
        gx = -a + c2 - 2 * d + 2 * f - gg + ii; gy = -a - 2 * b - c2 + gg + 2 * hh + ii; mag[i] = Math.sqrt(gx * gx + gy * gy); }
      var sample = []; for (i = 0; i < mag.length; i += 7) sample.push(mag[i]); sample.sort(function (p, q) { return p - q; });
      var norm = sample[Math.floor(sample.length * 0.98)] || 1, thr = norm * (0.62 - 0.0055 * sens), softM = Math.max(1, thr * 0.5);
      for (i = 0; i < w * h; i++) out[i] = clamp01((mag[i] - thr) / softM + 0.5);
    }
    return out;
  }
  function threshold(f) { var m = new Uint8Array(f.length); for (var i = 0; i < f.length; i++) m[i] = f[i] > 0.5 ? 1 : 0; return m; }
  function refMask(gray, w, h, mode, sens, smooth) { return threshold(inkField(gray, w, h, mode, sens, smooth)); }
  /* Fixed reference for the drift check: a sensitive reading of the original that does not depend on the user's settings.
     Without this, lowering sensitivity would shrink the reference too and the check could never show lost lines. */
  function referenceMask(gray, w, h, mode) { return refMask(gray, w, h, mode, 72, 0); }

  /* opts: mode 'draw'|'photo', sens 1-100, smooth 0-4, weight 1-6, specks px.
     Returns { ref, final (binary, for the drift check), alpha (soft, for drawing) } */
  function makeStencil(gray, w, h, o) {
    var n = w * h, i, ink = inkField(gray, w, h, o.mode, o.sens, o.smooth), bin = threshold(ink), ref = bin;
    if (o.specks && o.specks > 1) {
      var clean = removeSpecks(bin, w, h, o.specks), gone = new Uint8Array(n), any = false;
      for (i = 0; i < n; i++) if (bin[i] && !clean[i]) { gone[i] = 1; any = true; }
      if (any) { var halo = dilate(gone, w, h, 1); for (i = 0; i < n; i++) if (halo[i]) ink[i] = 0; }
    }
    var k = (o.weight || 2) - 1, alpha = ink;
    if (k > 0) { alpha = boxBlur(maxFilter(ink, w, h, k, Float32Array), w, h, 1); }   // thicken, then round the corners
    var final = new Uint8Array(n);
    for (i = 0; i < n; i++) { var a = clamp01((alpha[i] - 0.25) / 0.5); alpha[i] = a; final[i] = a > 0.5 ? 1 : 0; }
    return { ref: ref, final: final, alpha: alpha };
  }

  /* Drift check: share of source lines kept, lost, and ink added that is not in the source. Also builds a red/blue overlay. */
  function driftCheck(ref, final, w, h, weight, wantImage) {
    var n = w * h, i, refN = 0, kept = 0, finN = 0, addedN = 0, tol = 2;
    var finD = dilate(final, w, h, tol), refD = dilate(ref, w, h, tol + weight - 1);
    var img = wantImage ? new ImageData(w, h) : null, dd = img && img.data;
    for (i = 0; i < n; i++) {
      if (ref[i]) { refN++; if (finD[i]) kept++; else if (dd) { dd[i * 4] = 210; dd[i * 4 + 1] = 54; dd[i * 4 + 2] = 43; dd[i * 4 + 3] = 235; } }
      if (final[i]) { finN++; if (!refD[i]) { addedN++; if (dd) { dd[i * 4] = 27; dd[i * 4 + 1] = 111; dd[i * 4 + 2] = 224; dd[i * 4 + 3] = 235; } } }
    }
    var kp = refN ? kept / refN * 100 : 100;
    return { kept: kp, lost: 100 - kp, added: finN ? addedN / finN * 100 : 0, image: img };
  }
  function grayFromCanvas(c) {
    var w = c.width, h = c.height, d = c.getContext('2d').getImageData(0, 0, w, h).data, gray = new Float32Array(w * h);
    for (var i = 0, p = 0; i < d.length; i += 4, p++) gray[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return { gray: gray, w: w, h: h };
  }
  function canvasFromGray(gray, w, h) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d'), img = x.createImageData(w, h);
    for (var i = 0; i < w * h; i++) { var v = Math.max(0, Math.min(255, gray[i])); img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    x.putImageData(img, 0, 0); return c;
  }
  /* Paint the stencil lines onto a canvas. skin = hex colour or null (white). alpha (soft) is used when given. */
  function renderStencil(canvas, final, w, h, skin, rgb, alpha) {
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d'); ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = skin || '#ffffff'; ctx.fillRect(0, 0, w, h);
    var lc = document.createElement('canvas'); lc.width = w; lc.height = h;
    var lx = lc.getContext('2d'), img = lx.createImageData(w, h), d = img.data, col = rgb || [79, 53, 200];
    for (var i = 0; i < final.length; i++) {
      var a = alpha ? alpha[i] : (final[i] ? 1 : 0);
      if (a > 0.004) { d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = Math.round(a * 255); }
    }
    lx.putImageData(img, 0, 0);
    ctx.globalCompositeOperation = skin ? 'multiply' : 'source-over'; ctx.drawImage(lc, 0, 0); ctx.globalCompositeOperation = 'source-over';
  }
  /* Fit any image or canvas into a canvas no larger than maxSide, on white, with smooth downscaling. */
  function fitToCanvas(img, iw, ih, maxSide) {
    var s = Math.min(1, maxSide / Math.max(iw, ih)), w = Math.max(2, Math.round(iw * s)), h = Math.max(2, Math.round(ih * s));
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h); return c;
  }

  /* ---------- sample designs (drawn in code, free to use). Drawn at 2x so they stay crisp on sharp screens. ---------- */
  var S2 = 2;
  function newCanvas(w, h) { var c = document.createElement('canvas'); c.width = w * S2; c.height = h * S2; var x = c.getContext('2d'); x.scale(S2, S2); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.lineJoin = 'round'; x.lineCap = 'round'; x.strokeStyle = '#111'; return [c, x]; }
  function hatchFill(x, clip, ang, gap, alpha, lw, cx, cy, ext) {
    x.save(); clip(); x.clip(); x.strokeStyle = 'rgba(17,17,17,' + alpha + ')'; x.lineWidth = lw; x.translate(cx, cy); x.rotate(ang);
    for (var i = -ext; i < ext; i += gap) { x.beginPath(); x.moveTo(i, -ext); x.lineTo(i, ext); x.stroke(); } x.restore();
  }
  var SAMPLES = {
    dagger: { label: 'Dagger', mode: 'draw', draw: function () {
      var o = newCanvas(700, 900), c = o[0], x = o[1];
      function bladeHalf() { x.beginPath(); x.moveTo(350, 70); x.lineTo(430, 520); x.lineTo(350, 600); x.closePath(); }
      hatchFill(x, bladeHalf, Math.PI / 4, 9, .55, 2, 350, 450, 700);
      x.lineWidth = 7; x.beginPath(); x.moveTo(350, 70); x.lineTo(430, 520); x.lineTo(350, 600); x.lineTo(270, 520); x.closePath(); x.stroke();
      x.lineWidth = 4; x.beginPath(); x.moveTo(350, 70); x.lineTo(350, 600); x.stroke();
      x.lineWidth = 7; x.beginPath(); x.moveTo(190, 600); x.quadraticCurveTo(350, 570, 510, 600); x.quadraticCurveTo(350, 650, 190, 600); x.stroke();
      function grip() { x.beginPath(); x.rect(326, 640, 48, 170); }
      hatchFill(x, grip, -Math.PI / 4, 10, .5, 2, 350, 450, 700);
      x.lineWidth = 7; grip(); x.stroke();
      x.lineWidth = 3; for (var y = 665; y < 805; y += 22) { x.beginPath(); x.moveTo(326, y); x.lineTo(374, y + 14); x.stroke(); }
      x.lineWidth = 7; x.beginPath(); x.arc(350, 838, 26, 0, Math.PI * 2); x.stroke();
      x.lineWidth = 4; x.beginPath(); x.arc(350, 838, 12, 0, Math.PI * 2); x.stroke();
      x.lineWidth = 5; x.beginPath(); x.moveTo(190, 700); x.bezierCurveTo(120, 640, 130, 560, 200, 540); x.stroke();
      x.beginPath(); x.moveTo(510, 700); x.bezierCurveTo(580, 640, 570, 560, 500, 540); x.stroke();
      return c; } },
    mandala: { label: 'Mandala', mode: 'draw', draw: function () {
      var o = newCanvas(800, 800), c = o[0], x = o[1], cx = 400, cy = 400, i;
      x.lineWidth = 6; x.beginPath(); x.arc(cx, cy, 340, 0, Math.PI * 2); x.stroke();
      x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, 300, 0, Math.PI * 2); x.stroke();
      for (i = 0; i < 12; i++) { x.save(); x.translate(cx, cy); x.rotate(i * Math.PI / 6); x.lineWidth = 5;
        x.beginPath(); x.moveTo(0, -120); x.bezierCurveTo(70, -190, 70, -260, 0, -300); x.bezierCurveTo(-70, -260, -70, -190, 0, -120); x.stroke();
        x.lineWidth = 3; x.beginPath(); x.moveTo(0, -150); x.lineTo(0, -270); x.stroke(); x.restore(); }
      for (i = 0; i < 8; i++) { x.save(); x.translate(cx, cy); x.rotate(i * Math.PI / 4 + Math.PI / 8); x.lineWidth = 5;
        x.beginPath(); x.moveTo(0, -40); x.quadraticCurveTo(38, -80, 0, -125); x.quadraticCurveTo(-38, -80, 0, -40); x.stroke(); x.restore(); }
      x.lineWidth = 5; x.beginPath(); x.arc(cx, cy, 30, 0, Math.PI * 2); x.stroke();
      hatchFill(x, function () { x.beginPath(); x.arc(cx, cy, 30, 0, Math.PI * 2); }, Math.PI / 4, 8, .7, 2, cx, cy, 200);
      return c; } },
    lettering: { label: 'Lettering', mode: 'draw', draw: function () {
      var o = newCanvas(900, 520), c = o[0], x = o[1];
      x.fillStyle = '#111'; x.font = 'italic 700 200px Georgia, "Times New Roman", serif'; x.textAlign = 'center'; x.fillText('Resolve', 450, 300);
      x.lineWidth = 7; x.beginPath(); x.moveTo(120, 370); x.quadraticCurveTo(450, 450, 780, 370); x.stroke();
      x.lineWidth = 4; x.beginPath(); x.moveTo(200, 400); x.quadraticCurveTo(450, 470, 700, 400); x.stroke();
      return c; } },
    orb: { label: 'Shaded orb', mode: 'photo', draw: function () {
      var o = newCanvas(800, 800), c = o[0], x = o[1];
      var g = x.createRadialGradient(300, 280, 30, 400, 400, 300); g.addColorStop(0, '#f2f2f2'); g.addColorStop(.35, '#aaaaaa'); g.addColorStop(.75, '#444'); g.addColorStop(1, '#151515');
      x.fillStyle = g; x.beginPath(); x.arc(400, 400, 300, 0, Math.PI * 2); x.fill();
      x.save(); x.beginPath(); x.arc(400, 400, 300, 0, Math.PI * 2); x.clip(); x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 3;
      for (var k = -3; k <= 3; k++) { x.beginPath(); x.ellipse(400, 400, 300, 300 * Math.abs(k) / 3.4, 0, 0, Math.PI * 2); x.stroke(); } x.restore();
      return c; } }
  };

  /* ---------- degraded versions, to show why input quality matters ---------- */
  function degrade(canvas, kind) {
    var g0 = grayFromCanvas(canvas), w = g0.w, h = g0.h, gray = g0.gray, i;
    if (kind === 'blur') { var b = boxBlur(gray, w, h, Math.round(w / 100)); return canvasFromGray(b, w, h); }
    if (kind === 'lowcontrast') { var l = new Float32Array(w * h); for (i = 0; i < w * h; i++) l[i] = 150 + (gray[i] - 128) * 0.07; return canvasFromGray(l, w, h); }
    if (kind === 'padded') {
      var c = document.createElement('canvas'); c.width = w; c.height = h; var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
      x.imageSmoothingQuality = 'high'; x.drawImage(canvas, w * 0.34, h * 0.34, w * 0.32, h * 0.32); return c;
    }
    return canvas;
  }

  g.SkinEngine = { boxBlur: boxBlur, dilate: dilate, removeSpecks: removeSpecks, makeStencil: makeStencil, referenceMask: referenceMask, driftCheck: driftCheck,
    grayFromCanvas: grayFromCanvas, canvasFromGray: canvasFromGray, renderStencil: renderStencil, fitToCanvas: fitToCanvas, samples: SAMPLES, degrade: degrade };
})(window);
