/* The stencil engine of the generator page, with no page in it, so the same code runs in the browser and in the Node test (scripts in the repo notes).
   Input: a grey image (Float32Array, 0 = black ink, 255 = white paper) of N x N pixels and the controls. Output: the line mask.
   Why it looks the way it does: a pencil or hatched drawing is made of thin, light-grey strokes on paper that is not quite white. A single threshold either loses those
   strokes or turns dark areas into blobs. So a pixel becomes ink when it is clearly dark (absolute threshold) OR clearly darker than the paper around it (local threshold),
   after thin strokes have been made crisper with an unsharp mask. The Detail control moves both thresholds together. */
(function (g) {
  'use strict';
  function blur3(a, passes, N) { var o = new Float32Array(a.length), tmp; for (var p = 0; p < passes; p++) { for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) { var i = y * N + x, l = x > 0 ? a[i - 1] : a[i], r = x < N - 1 ? a[i + 1] : a[i]; o[i] = (l + a[i] + r) / 3; } tmp = a; a = o; o = tmp; for (var y2 = 0; y2 < N; y2++) for (var x2 = 0; x2 < N; x2++) { var j = y2 * N + x2, u = y2 > 0 ? a[j - N] : a[j], d = y2 < N - 1 ? a[j + N] : a[j]; o[j] = (u + a[j] + d) / 3; } tmp = a; a = o; o = tmp; } return a; }
  /* mean of the (2r+1) x (2r+1) neighbourhood of every pixel, through an integral image: fast whatever the radius */
  function boxMean(a, N, r) {
    var W = N + 1, I = new Float64Array(W * W), x, y, out = new Float32Array(N * N);
    for (y = 0; y < N; y++) { var row = 0; for (x = 0; x < N; x++) { row += a[y * N + x]; I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row; } }
    for (y = 0; y < N; y++) { var y0 = Math.max(0, y - r), y1 = Math.min(N, y + r + 1); for (x = 0; x < N; x++) { var x0 = Math.max(0, x - r), x1 = Math.min(N, x + r + 1); out[y * N + x] = (I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0]) / ((y1 - y0) * (x1 - x0)); } }
    return out;
  }
  function dil(m, grow, N) { var o = new Uint8Array(m.length); for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) { var i = y * N + x, v = grow ? 0 : 1; for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= N || Y >= N) continue; var q = m[Y * N + X]; if (grow) { if (q) v = 1; } else if (!q) v = 0; } o[i] = v; } return o; }
  function majority(m, N) { var f = new Float32Array(m.length); for (var i = 0; i < m.length; i++) f[i] = m[i]; f = blur3(f, 1, N); var o = new Uint8Array(m.length); for (i = 0; i < m.length; i++) o[i] = f[i] > .5 ? 1 : 0; return o; }
  function despeck(m, min, N) { if (min <= 0) return m; var seen = new Uint8Array(m.length), stack = [], comp; for (var i = 0; i < m.length; i++) { if (!m[i] || seen[i]) continue; comp = []; stack.length = 0; stack.push(i); seen[i] = 1; while (stack.length) { var p = stack.pop(); comp.push(p); var x = p % N, y = (p / N) | 0; if (x > 0 && m[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); } if (x < N - 1 && m[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); } if (y > 0 && m[p - N] && !seen[p - N]) { seen[p - N] = 1; stack.push(p - N); } if (y < N - 1 && m[p + N] && !seen[p + N]) { seen[p + N] = 1; stack.push(p + N); } } if (comp.length < min) for (var k = 0; k < comp.length; k++) m[comp[k]] = 0; } return m; }

  /* set = { mode: 'draw' | 'photo', sens: 1..100, smooth: 0..4, weight: 1..6, specks: 0..300 }; N is the side of the image in pixels */
  function core(gray, N, set) {
    var n = N * N, orig = new Uint8Array(n), ink = new Uint8Array(n), i;
    for (i = 0; i < n; i++) orig[i] = gray[i] < 128 ? 1 : 0;
    if (set.mode === 'draw') {
      var bl = blur3(new Float32Array(gray), 1, N), sharp = new Float32Array(n);
      for (i = 0; i < n; i++) { var v = gray[i] + 1.6 * (gray[i] - bl[i]); sharp[i] = v < 0 ? 0 : v > 255 ? 255 : v; }
      var lm = boxMean(sharp, N, Math.round(N / 56)), abs = 40 + set.sens * 1.2, delta = 4 + (100 - set.sens) * .55;
      for (i = 0; i < n; i++) ink[i] = (sharp[i] < abs || sharp[i] < lm[i] - delta) ? 1 : 0;
    } else {
      var b = blur3(new Float32Array(gray), 2, N), TT = 230 - set.sens * 2.1;
      for (var y = 1; y < N - 1; y++) for (var x = 1; x < N - 1; x++) { var k = y * N + x, gx = -b[k - N - 1] - 2 * b[k - 1] - b[k + N - 1] + b[k - N + 1] + 2 * b[k + 1] + b[k + N + 1], gy = -b[k - N - 1] - 2 * b[k - N] - b[k - N + 1] + b[k + N - 1] + 2 * b[k + N] + b[k + N + 1]; ink[k] = Math.sqrt(gx * gx + gy * gy) > TT ? 1 : 0; }
      ink = dil(ink, true, N);
    }
    for (i = 0; i < set.smooth; i++) ink = majority(ink, N);
    if (set.weight < 2) ink = dil(ink, false, N); else for (i = 2; i < set.weight; i++) ink = dil(ink, true, N);
    ink = despeck(ink, Math.round(set.specks * (N / 600) * (N / 600) / 4), N);   // specks are counted in pixels, scaled with the working size
    var kept = 0, oc = 0, ic = 0, add = 0;
    for (i = 0; i < n; i++) { if (ink[i]) { ic++; if (orig[i]) kept++; else add++; } if (orig[i]) oc++; }
    return { ink: ink, orig: orig, kp: oc ? Math.round(100 * kept / oc) : 0, ad: ic ? Math.round(100 * add / ic) : 0 };
  }
  var api = { core: core, blur3: blur3, boxMean: boxMean };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else g.SkinStencilCore = api;
})(typeof window !== 'undefined' ? window : this);
