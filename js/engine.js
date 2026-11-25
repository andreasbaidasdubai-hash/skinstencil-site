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
    /* vertical pass, one row at a time (column-wise walking is several times slower on big images); same arithmetic as before */
    var acc = new Float64Array(w), ya, yb, o, a0, b0;
    for (y = -r; y <= r; y++) { a0 = Math.min(h - 1, Math.max(0, y)) * w; for (x = 0; x < w; x++) acc[x] += tmp[a0 + x]; }
    for (y = 0; y < h; y++) { o = y * w; ya = Math.min(h - 1, y + r + 1) * w; yb = Math.max(0, y - r) * w;
      for (x = 0; x < w; x++) { s = acc[x]; out[o + x] = s / d; acc[x] = s + tmp[ya + x] - tmp[yb + x]; } }
    return out;
  }
  /* max filter (grey dilation) with a square window of radius k, on any numeric array */
  function maxFilter(src, w, h, k, Type) {
    if (k < 1) return src;
    var t = new Type(w * h), o = new Type(w * h), x, y, i, a, b, m, row;
    for (y = 0; y < h; y++) { row = y * w;
      for (x = 0; x < w; x++) { a = Math.max(0, x - k); b = Math.min(w - 1, x + k); m = 0; for (i = a; i <= b; i++) { if (src[row + i] > m) m = src[row + i]; } t[row + x] = m; } }
    for (y = 0; y < h; y++) { a = Math.max(0, y - k); b = Math.min(h - 1, y + k); row = y * w;
      for (i = a; i <= b; i++) { var ro = i * w; for (x = 0; x < w; x++) { if (t[ro + x] > o[row + x]) o[row + x] = t[ro + x]; } } }
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

  /* Flat-field: estimate the paper brightness (lighting, shadows) with a grey closing on a small copy, so dark lines vanish from it. */
  function background(g, w, h) {
    var f = Math.max(1, Math.round(Math.min(w, h) / 300)), wd = Math.ceil(w / f), hd = Math.ceil(h / f), small = new Float32Array(wd * hd), x, y, i, j, xx, yy, s, n;
    for (y = 0; y < hd; y++) for (x = 0; x < wd; x++) { s = 0; n = 0; for (j = 0; j < f; j++) for (i = 0; i < f; i++) { xx = x * f + i; yy = y * f + j; if (xx < w && yy < h) { s += g[yy * w + xx]; n++; } } small[y * wd + x] = s / n; }
    var rr = Math.max(4, Math.round(Math.min(wd, hd) / 10));
    var d = maxFilter(small, wd, hd, rr, Float32Array), neg = new Float32Array(wd * hd);
    for (i = 0; i < neg.length; i++) neg[i] = 255 - d[i];
    var e = maxFilter(neg, wd, hd, rr, Float32Array), bgS = new Float32Array(wd * hd);
    for (i = 0; i < bgS.length; i++) bgS[i] = 255 - e[i];
    bgS = boxBlur(bgS, wd, hd, 2);
    var out = new Float32Array(w * h);
    for (y = 0; y < h; y++) { var fy = Math.min(hd - 1.001, y / f), y0 = Math.floor(fy), ty = fy - y0;
      for (x = 0; x < w; x++) { var fx = Math.min(wd - 1.001, x / f), x0 = Math.floor(fx), tx = fx - x0, k = y0 * wd + x0;
        out[y * w + x] = bgS[k] * (1 - tx) * (1 - ty) + bgS[k + 1] * tx * (1 - ty) + bgS[k + wd] * (1 - tx) * ty + bgS[k + wd + 1] * tx * ty; } }
    return out;
  }

  /* ---------- photo mode: a Canny-style pipeline ----------
     denoise (Gaussian sized to the picture and its measured noise) -> gradient -> non-maximum suppression -> hysteresis thresholds
     (derived from the picture's own strong edges and noise floor, and from the Sensitivity slider) -> bridge small gaps -> drop short weak fragments.
     Thin 1 px lines come out and are drawn as soft, anti-aliased ink. It is a classic image filter; nothing leaves the device. */
  function gaussBlur(src, w, h, sigma) {
    if (sigma < 0.35) return src;
    var r = Math.max(1, Math.ceil(sigma * 2.6)), k = new Float32Array(2 * r + 1), sum = 0, i, j, x, y, a, row, xx, kv, yy, o, s0;
    for (i = -r; i <= r; i++) { k[i + r] = Math.exp(-i * i / (2 * sigma * sigma)); sum += k[i + r]; }
    for (i = 0; i < k.length; i++) k[i] /= sum;
    var tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (y = 0; y < h; y++) { row = y * w;
      for (x = 0; x < w; x++) { a = 0;
        if (x >= r && x < w - r) { for (j = -r; j <= r; j++) a += k[j + r] * src[row + x + j]; }
        else { for (j = -r; j <= r; j++) { xx = x + j; xx = xx < 0 ? 0 : xx >= w ? w - 1 : xx; a += k[j + r] * src[row + xx]; } }
        tmp[row + x] = a; } }
    for (j = -r; j <= r; j++) { kv = k[j + r];
      for (y = 0; y < h; y++) { yy = y + j; yy = yy < 0 ? 0 : yy >= h ? h - 1 : yy; o = y * w; s0 = yy * w;
        for (x = 0; x < w; x++) out[o + x] += kv * tmp[s0 + x]; } }
    return out;
  }
  /* value at quantile q (0..1) of an array, from at most ~120k samples */
  function quantile(a, q) {
    var step = Math.max(1, Math.floor(a.length / 120000)), s = new Float32Array(Math.ceil(a.length / step)), i, j = 0;
    for (i = 0; i < a.length; i += step) s[j++] = a[i];
    s = s.subarray(0, j).sort(); return s[Math.min(s.length - 1, Math.floor(s.length * q))] || 0;
  }
  /* Noise level in grey levels: median of a 3x3 Laplacian-difference response (Immerkaer), which edges barely move. */
  function noiseSigma(gray, w, h) {
    var step = Math.max(1, Math.floor(Math.sqrt(w * h / 100000))), v = [], x, y, i, c;
    for (y = 1; y < h - 1; y += step) for (x = 1; x < w - 1; x += step) { i = y * w + x;
      c = gray[i - w - 1] - 2 * gray[i - w] + gray[i - w + 1] - 2 * gray[i - 1] + 4 * gray[i] - 2 * gray[i + 1] + gray[i + w - 1] - 2 * gray[i + w] + gray[i + w + 1];
      v.push(Math.abs(c)); }
    if (!v.length) return 0;
    var f = Float32Array.from(v).sort(); return f[f.length >> 1] / (0.6745 * 6);
  }
  /* constants chosen on the synthetic benchmark (see skinstencil-bench/quality-photo.mjs); not tuned on any real photograph */
  var TUNE = { sigS: 1.0, sigN: 0.11, floor: 3, keepFloor: 0, lowA: 0.34, lowB: 0.003, absLow: 1.5, nfMin: 0.5, hiR: 2.2, pct: 0.85, minLen: 10, hw: 1.1 };
  var edgeCache = null;
  /* gradient and direction-aware non-maximum suppression. Cached per image, so the drift reference and the stencil share the work. */
  function photoEdges(gray, w, h, smooth) {
    if (edgeCache && edgeCache.g === gray && edgeCache.w === w && edgeCache.h === h && edgeCache.smooth === smooth) return edgeCache;
    var s = Math.max(w, h) / 1000, nz = noiseSigma(gray, w, h);
    var sig = Math.sqrt(Math.pow(TUNE.sigS * s + TUNE.sigN * nz, 2) + Math.pow(0.75 * smooth, 2));
    var sm = gaussBlur(gray, w, h, sig), mag = new Float32Array(w * h), nms = new Uint8Array(w * h), i, x, y, gx, gy, ax, ay, m, a, b;
    var gxs = new Float32Array(w * h), gys = new Float32Array(w * h);
    for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) { i = y * w + x;
      gx = (-sm[i - w - 1] + sm[i - w + 1] - 2 * sm[i - 1] + 2 * sm[i + 1] - sm[i + w - 1] + sm[i + w + 1]) * 0.125;
      gy = (-sm[i - w - 1] - 2 * sm[i - w] - sm[i - w + 1] + sm[i + w - 1] + 2 * sm[i + w] + sm[i + w + 1]) * 0.125;
      gxs[i] = gx; gys[i] = gy; mag[i] = Math.sqrt(gx * gx + gy * gy); }
    for (y = 2; y < h - 2; y++) for (x = 2; x < w - 2; x++) { i = y * w + x; m = mag[i]; if (m < 1e-3) continue;
      ax = Math.abs(gxs[i]); ay = Math.abs(gys[i]);
      if (ay <= ax * 0.4142) { a = mag[i - 1]; b = mag[i + 1]; }
      else if (ay >= ax * 2.4142) { a = mag[i - w]; b = mag[i + w]; }
      else if ((gxs[i] > 0) === (gys[i] > 0)) { a = mag[i - w - 1]; b = mag[i + w + 1]; }
      else { a = mag[i - w + 1]; b = mag[i + w - 1]; }
      if (m > a && m >= b) nms[i] = 1; }
    var nf = Math.max(TUNE.nfMin, quantile(mag, 0.5)), cand = [];
    for (i = 0; i < nms.length; i++) if (nms[i] && mag[i] > TUNE.floor * nf) cand.push(mag[i]);
    var L = cand.length ? Float32Array.from(cand).sort()[Math.floor(cand.length * TUNE.pct)] : 0;
    edgeCache = { g: gray, w: w, h: h, smooth: smooth, mag: mag, nms: nms, nf: nf, L: L, noise: nz, sigma: sig, s: s, ncand: cand.length };
    return edgeCache;
  }
  function labelMask(m, w, h) {
    var lab = new Int32Array(w * h), sizes = [0], st = new Int32Array(w * h), n = 0, i, sp, p, x, y, dx, dy, q, nx, ny, sz;
    for (i = 0; i < w * h; i++) { if (!m[i] || lab[i]) continue; n++; sp = 0; sz = 0; st[sp++] = i; lab[i] = n;
      while (sp) { p = st[--sp]; sz++; x = p % w; y = (p / w) | 0;
        for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) { nx = x + dx; ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; q = ny * w + nx; if (m[q] && !lab[q]) { lab[q] = n; st[sp++] = q; } } }
      sizes.push(sz); }
    return { lab: lab, sizes: sizes, n: n };
  }
  function drawLine(m, w, x0, y0, x1, y1) {
    var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)), k, t;
    for (k = 0; k <= n; k++) { t = n ? k / n : 0; m[Math.round(y0 + (y1 - y0) * t) * w + Math.round(x0 + (x1 - x0) * t)] = 1; }
  }
  /* Bridge small gaps: from each line end look ahead along the line for another line, and join them when there is some edge evidence between. */
  function bridgeGaps(m, mag, w, h, G, minMag, minSize) {
    var lb = labelMask(m, w, h), lab = lb.lab, ends = [], i, x, y, dx, dy, c, nx, ny, q2, n, j, p, prev, cur, nxt, steps, vx, vy, d, bestD, best, X, Y, ex, ey, dist, cs, k, sum, t, len, add = [];
    for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) { i = y * w + x; if (!m[i] || lb.sizes[lab[i]] < minSize) continue;
      c = 0; for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) if ((dx || dy) && m[i + dy * w + dx]) c++;
      if (c === 1) ends.push(i); }
    for (j = 0; j < ends.length; j++) {
      p = ends[j]; prev = -1; ex = p % w; ey = (p / w) | 0; cur = p;
      for (steps = 0; steps < 7; steps++) { nxt = -1; x = cur % w; y = (cur / w) | 0;
        for (dy = -1; dy <= 1 && nxt < 0; dy++) for (dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; nx = x + dx; ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; q2 = ny * w + nx; if (m[q2] && q2 !== prev) { nxt = q2; break; } }
        if (nxt < 0) break; prev = cur; cur = nxt; }
      vx = ex - (cur % w); vy = ey - ((cur / w) | 0); len = Math.sqrt(vx * vx + vy * vy); if (len < 2) continue; vx /= len; vy /= len;
      best = -1; bestD = 1e9;
      for (Y = Math.max(0, ey - G); Y <= Math.min(h - 1, ey + G); Y++) for (X = Math.max(0, ex - G); X <= Math.min(w - 1, ex + G); X++) {
        q2 = Y * w + X; if (!m[q2] || lab[q2] === lab[p]) continue; dx = X - ex; dy = Y - ey; dist = Math.sqrt(dx * dx + dy * dy); if (dist < 1.5 || dist > G) continue;
        cs = (dx * vx + dy * vy) / dist; if (cs < 0.8) continue; d = dist * (2 - cs); if (d < bestD) { bestD = d; best = q2; } }
      if (best < 0) continue;
      X = best % w; Y = (best / w) | 0; n = Math.max(Math.abs(X - ex), Math.abs(Y - ey)); sum = 0;
      for (k = 0; k <= n; k++) { t = k / n; sum += mag[Math.round(ey + (Y - ey) * t) * w + Math.round(ex + (X - ex) * t)]; }
      if (sum / (n + 1) >= minMag) add.push(ex, ey, X, Y);
    }
    for (j = 0; j < add.length; j += 4) drawLine(m, w, add[j], add[j + 1], add[j + 2], add[j + 3]);
  }
  function photoInk(gray, w, h, sens, smooth) {
    var e = photoEdges(gray, w, h, smooth), mag = e.mag, nms = e.nms, s = e.s, n = w * h, i, out = new Float32Array(n);
    if (!e.L) return out;
    var low = Math.max(TUNE.floor * e.nf, TUNE.absLow, e.L * (TUNE.lowA - TUNE.lowB * sens)), high = Math.min(Math.max(low * TUNE.hiR, low), Math.max(low, e.L * 0.9));
    var m = new Uint8Array(n), st = new Int32Array(n), sp = 0, p, x, y, dx, dy, nx, ny, q, l;
    for (i = 0; i < n; i++) if (nms[i] && mag[i] >= high) { m[i] = 1; st[sp++] = i; }
    while (sp) { p = st[--sp]; x = p % w; y = (p / w) | 0;
      for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) { nx = x + dx; ny = y + dy; if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue; q = ny * w + nx; if (!m[q] && nms[q] && mag[q] >= low) { m[q] = 1; st[sp++] = q; } } }
    var minLen = Math.max(4, Math.round(TUNE.minLen * s));
    bridgeGaps(m, mag, w, h, Math.max(4, Math.round(12 * s)), low * 0.5, Math.max(3, minLen >> 1));
    var lb = labelMask(m, w, h), sumM = new Float64Array(lb.n + 1);
    for (i = 0; i < n; i++) if (m[i]) sumM[lb.lab[i]] += mag[i];
    for (i = 0; i < n; i++) if (m[i]) { l = lb.lab[i]; if (lb.sizes[l] < minLen && sumM[l] / lb.sizes[l] < Math.max(0.6 * e.L, TUNE.keepFloor * e.nf)) m[i] = 0; }
    /* draw the 1 px lines as soft ink about 2 px wide (scaled with the picture) */
    var hw = Math.max(1.0, TUNE.hw * s), sg = Math.max(0.7, 0.7 * hw), A = 0.5 / Math.exp(-hw * hw / (2 * sg * sg)) * sg * 2.5066;
    var lf = new Float32Array(n); for (i = 0; i < n; i++) lf[i] = m[i];
    var bl = gaussBlur(lf, w, h, sg);
    for (i = 0; i < n; i++) out[i] = clamp01(bl[i] * A);
    return out;
  }

  /* Soft ink in [0,1]: 0.5 sits exactly on the old hard threshold, and it ramps over a few grey levels so edges are anti-aliased. */
  var drawCache = null;
  function inkField(gray, w, h, mode, sens, smooth) {
    var out = new Float32Array(w * h), i;
    if (mode === 'draw') {
      /* everything but the final threshold depends only on the picture and Smoothing, so it is kept while Sensitivity moves */
      var dc = drawCache;
      if (!(dc && dc.g === gray && dc.w === w && dc.h === h && dc.smooth === smooth)) {
        var lr = Math.max(6, Math.round(Math.min(w, h) / 45)), sm = boxBlur(gray, w, h, smooth), bg = background(sm, w, h), g2 = new Float32Array(w * h);
        for (i = 0; i < w * h; i++) g2[i] = Math.min(255, sm[i] / Math.max(40, bg[i]) * 255);
        var inv = new Uint8Array(w * h); for (i = 0; i < w * h; i++) inv[i] = g2[i] < 125 ? 0 : 1;
        dc = drawCache = { g: gray, w: w, h: h, smooth: smooth, g2: g2, local: boxBlur(g2, w, h, lr), near: dilate(inv, w, h, Math.max(2, Math.round(lr * 0.55))) };
      }
      var c = 46 - 0.43 * sens, soft = 20, g2c = dc.g2, local = dc.local, near = dc.near;
      for (i = 0; i < w * h; i++) out[i] = near[i] ? clamp01((local[i] - g2c[i] - c) / soft + 0.5) : 0;
    } else {
      out = photoInk(gray, w, h, sens, smooth);
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

  /* ---------- Recommended settings ----------
     recommend(gray, w, h) reads simple statistics of the picture (how two-toned it is, how uneven the light is, noise, how many edges, how soft they are),
     picks Drawing or Photo from them, then tries a small grid of Sensitivity / Smoothing on a downsized copy and keeps the setting whose stencil
     scores best on a label-free check: it should agree with the fixed conservative reference (driftCheck), carry few loose specks, have a sensible amount of ink.
     It needs no network and no model. Values come back in the same pixel units as the sliders. */
  function shrink(gray, w, h, maxSide) {
    var f = Math.max(1, Math.round(Math.max(w, h) / maxSide));
    if (f === 1) return { g: gray, w: w, h: h, f: 1 };
    var w2 = Math.floor(w / f), h2 = Math.floor(h / f), o = new Float32Array(w2 * h2), x, y, i, j, s, inv = 1 / (f * f);
    for (y = 0; y < h2; y++) for (x = 0; x < w2; x++) { s = 0; for (j = 0; j < f; j++) for (i = 0; i < f; i++) s += gray[(y * f + j) * w + x * f + i]; o[y * w2 + x] = s * inv; }
    return { g: o, w: w2, h: h2, f: f };
  }
  /* Otsu split on a 64 bin histogram of values in 0..255: returns { eta (0..1, how cleanly two-toned), dark (share of pixels in the darker class) } */
  function otsu(v) {
    var hist = new Float64Array(64), n = v.length, i, k, t, tot = 0, sumAll = 0;
    for (i = 0; i < n; i++) { k = Math.min(63, Math.max(0, v[i] >> 2)); hist[k]++; }
    for (i = 0; i < 64; i++) sumAll += i * hist[i];
    var w0 = 0, s0 = 0, best = -1, bt = 0, m0, m1, w1, vb;
    var mean = sumAll / n, varT = 0; for (i = 0; i < 64; i++) varT += hist[i] * (i - mean) * (i - mean); varT /= n;
    for (t = 0; t < 63; t++) { w0 += hist[t]; s0 += t * hist[t]; w1 = n - w0; if (w0 < 1 || w1 < 1) continue; m0 = s0 / w0; m1 = (sumAll - s0) / w1; vb = w0 * w1 / (n * n) * (m0 - m1) * (m0 - m1); if (vb > best) { best = vb; bt = t; } }
    var d0 = 0; for (i = 0; i <= bt; i++) d0 += hist[i];
    return { eta: varT > 0 ? Math.max(0, best) / varT : 0, dark: d0 / n };
  }
  function imageStats(gray, w, h, sm) {
    var n = sm.w * sm.h, bg = background(sm.g, sm.w, sm.h), nr = new Float32Array(n), i, m = 0, v = 0;
    for (i = 0; i < n; i++) { nr[i] = Math.min(255, sm.g[i] / Math.max(40, bg[i]) * 255); m += bg[i]; } m /= n;
    for (i = 0; i < n; i++) v += (bg[i] - m) * (bg[i] - m);
    var o = otsu(nr), contrast = Math.max(8, quantile(sm.g, 0.95) - quantile(sm.g, 0.05)), e = photoEdges(sm.g, sm.w, sm.h, 0);
    var p99 = quantile(e.mag, 0.995), wid = contrast / (2.5 * Math.max(0.01, p99)), wpx = Math.sqrt(Math.max(0, wid * wid - e.sigma * e.sigma)) * sm.f;
    /* share of the picture that is flat mid tone (shading, grey fills): line art and flat silhouettes have almost none, photographs a lot */
    var lo = quantile(nr, 0.02), hi = quantile(nr, 0.98), span = Math.max(1, hi - lo), flat = Math.max(1.5 * e.nf, 0.02 * span), mid = 0, t;
    if (span > 14 * e.nf) for (i = 0; i < n; i++) { t = (nr[i] - lo) / span; if (t > 0.2 && t < 0.8 && e.mag[i] < flat) mid++; }
    return { twoTone: o.eta, ink: o.dark, evenness: Math.sqrt(v / n) / Math.max(1, m), contrast: contrast, noiseRel: e.nf / contrast, edgeDensity: e.ncand / n, blurPx: wpx, midTone: mid / n };
  }
  /* label-free quality of one candidate on the small copy, higher is better. Two fixed readings of the picture bracket what is plausible:
     a conservative one (lines that are surely there: the stencil must keep them, as in the drift check) and a permissive one (ink beyond it is noise or shadow).
     On top of that: loose specks and implausible amounts of ink cost points. */
  function proxyScore(sm, set, refs) {
    var w = sm.w, h = sm.h, n = w * h, r = makeStencil(sm.g, w, h, set), i, cov = 0, keptN = 0, loN = 0, finN = 0, addN = 0, finD = dilate(r.final, w, h, 2);
    for (i = 0; i < n; i++) { if (refs.lo[i]) { loN++; if (finD[i]) keptN++; } if (r.final[i]) { finN++; if (!refs.hiD[i]) addN++; } }
    cov = finN / n;
    var lb = labelMask(r.final, w, h), tiny = 0, c;
    for (c = 1; c <= lb.n; c++) if (lb.sizes[c] < 20) tiny++;
    var tinyFrac = lb.n ? tiny / lb.n : 0, kept = loN ? keptN / loN : 1, added = finN ? addN / finN : 0;
    return kept * (1 - added) - 0.5 * tinyFrac - 1.5 * Math.max(0, cov - 0.18) - 3 * Math.max(0, 0.004 - cov);
  }
  function recommend(gray, w, h) {
    var sm = shrink(gray, w, h, 400), st = imageStats(gray, w, h, sm), mode = decideMode(st), f = sm.f;
    var def = mode === 'draw' ? 55 : 60, sensL = mode === 'draw' ? [40, 55, 70, 90] : [45, 60, 80], smL = mode === 'draw' ? (st.noiseRel > 0.03 ? [0, 1] : [0]) : [0, 1, 2, 3], best = null, si, mi, sc, set, rs = mode === 'draw' ? 0 : 1 / f, refs = { lo: refMask(sm.g, sm.w, sm.h, mode, 30, rs) };
    refs.hiD = dilate(refMask(sm.g, sm.w, sm.h, mode, 90, rs), sm.w, sm.h, 2);
    var specks = 30, sp = Math.round(specks / (f * f));
    for (mi = 0; mi < smL.length; mi++) for (si = 0; si < sensL.length; si++) {
      set = { mode: mode, sens: sensL[si], smooth: mode === 'draw' ? Math.round(smL[mi] / f) : smL[mi] / f, weight: 1, specks: sp };
      sc = proxyScore(sm, set, refs) - 0.01 * (Math.abs(sensL[si] - def) / 30 + smL[mi] * 0.5);
      if (!best || sc > best.score + 1e-9) best = { score: sc, sens: sensL[si], smooth: smL[mi] };
    }
    var weight = st.edgeDensity > 0.06 ? 1 : 2;
    return { mode: mode, sens: best.sens, smooth: best.smooth, weight: weight, specks: Math.min(300, specks), stats: st, score: best.score };
  }
  /* Photo when there is continuous tone (shading) or the edges are soft; otherwise it is line art or a crisp flat design. */
  function decideMode(st) { return st.midTone > 0.035 || st.blurPx > 2.6 ? 'photo' : 'draw'; }

  /* Redraw a canvas at the size it is shown (times the device pixel ratio), shrinking in halving steps with smooth scaling.
     Left to CSS, a large canvas shown small loses pixels, and thin lines such as hatching turn into stair-steps. */
  function crisp(c) {
    var r = c.getBoundingClientRect(); if (!r.width || !c.width) return;
    var k = Math.min(2, window.devicePixelRatio || 1), w = Math.round(r.width * k);
    if (w >= c.width) return;
    var h = Math.max(1, Math.round(w * c.height / c.width)), cur = document.createElement('canvas'); cur.width = c.width; cur.height = c.height; cur.getContext('2d').drawImage(c, 0, 0);
    while (cur.width / 2 >= w) { var t = document.createElement('canvas'); t.width = Math.ceil(cur.width / 2); t.height = Math.ceil(cur.height / 2); var tx = t.getContext('2d'); tx.imageSmoothingQuality = 'high'; tx.drawImage(cur, 0, 0, t.width, t.height); cur = t; }
    c.width = w; c.height = h; var x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, w, h);
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
    grayFromCanvas: grayFromCanvas, canvasFromGray: canvasFromGray, renderStencil: renderStencil, fitToCanvas: fitToCanvas, samples: SAMPLES, degrade: degrade, recommend: recommend, crisp: crisp };
})(window);
