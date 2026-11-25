/* Draws the brow mapping guides onto any 2D canvas context: the live stage and the exported PNGs use this one function.
   model = { pts, mk, pxPerMm } where pts comes from SkinBrowGeo (fromLandmarks or template) and mk = { R: {S, A, E}, L: {...} } are the three markers per brow.
   T maps image pixels to the canvas: x' = (x - T.x0) * T.k, y' = (y - T.y0) * T.k.
   o = { lw (line width px), mr (marker radius px), font (px), outline, level, letters, halo } */
(function (g) {
  'use strict';
  var G = g.SkinBrowGeo, V = G.vec;
  var COL = { l1: '#1B6FE0', l2: '#D2362B', l3: '#1F7A4C', brow: '#C25E00', level: '#4F35C8', ink: '#17161C' };

  /* The three guide lines of one side, as image-pixel segments from the nostril point up to a common height above the highest marker. */
  function linesOf(F, sd, mk, extraPx) {
    var top = Math.min.apply(null, ['S', 'A', 'E'].map(function (n) { return F.toFace(mk[n]).y; })) - extraPx, fa = F.toFace(sd.ala);
    return {
      l1: [sd.ala, F.toImage(V.P(fa.x, top))],
      l2: [sd.ala, G.atLevel(F, sd.ala, sd.iris, top) || sd.iris],
      l3: [sd.ala, G.atLevel(F, sd.ala, sd.outer, top) || sd.outer]
    };
  }
  /* Everything that is drawn, as an image-pixel box; used to crop the exports. */
  function extent(model, extraPx) {
    var F = G.frame(model.pts.R.pupil, model.pts.L.pupil), xs = [], ys = [], add = function (p) { xs.push(p.x); ys.push(p.y); };
    ['R', 'L'].forEach(function (s) {
      var sd = model.pts[s], mk = model.mk[s], ln = linesOf(F, sd, mk, extraPx);
      [sd.pupil, sd.inner, sd.outer, sd.ala, sd.iris, mk.S, mk.A, mk.E].forEach(add);
      sd.brow.upper.concat(sd.brow.lower).forEach(add);
      ['l1', 'l2', 'l3'].forEach(function (k) { add(ln[k][0]); add(ln[k][1]); });
    });
    return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys) };
  }

  function draw(ctx, model, T, o) {
    var pts = model.pts, F = G.frame(pts.R.pupil, pts.L.pupil), lw = o.lw, mr = o.mr;
    var X = function (p) { return (p.x - T.x0) * T.k; }, Y = function (p) { return (p.y - T.y0) * T.k; };
    function path(arr, close) { ctx.beginPath(); arr.forEach(function (p, i) { if (i) ctx.lineTo(X(p), Y(p)); else ctx.moveTo(X(p), Y(p)); }); if (close) ctx.closePath(); }
    function stroke(arr, col, w, dash, close) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (o.halo) { ctx.setLineDash([]); path(arr, close); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = w + lw * 1.6; ctx.stroke(); }
      ctx.setLineDash(dash || []); path(arr, close); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); ctx.setLineDash([]);
    }
    function dot(p, r, col, fill) {
      ctx.beginPath(); ctx.arc(X(p), Y(p), r, 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (o.halo) { ctx.lineWidth = lw * 2.6; ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.stroke(); }
      ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.stroke();
    }
    function cross(p, r, col) {
      var d = r / T.k;
      stroke([V.P(p.x - d, p.y), V.P(p.x + d, p.y)], col, lw); stroke([V.P(p.x, p.y - d), V.P(p.x, p.y + d)], col, lw);
    }
    function tag(p, txt, dx, dy, col) {
      ctx.font = '600 ' + o.font + 'px "IBM Plex Mono", ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (o.halo) { ctx.lineWidth = o.font * 0.28; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.strokeText(txt, X(p) + dx, Y(p) + dy); }
      ctx.fillStyle = col; ctx.fillText(txt, X(p) + dx, Y(p) + dy);
    }
    var ext = 14 * (model.pxPerMm || 8);   /* the guide lines run about 14 mm above the highest marker */
    ['R', 'L'].forEach(function (s) {
      var sd = pts[s], mk = model.mk[s], ln = linesOf(F, sd, mk, ext);
      if (o.outline) stroke(sd.brow.upper.concat(sd.brow.lower.slice().reverse()), COL.brow, lw * 0.8, null, true);
      stroke(ln.l1, COL.l1, lw);
      stroke(ln.l2, COL.l2, lw, [lw * 6, lw * 3]);
      stroke(ln.l3, COL.l3, lw, [lw * 1.2, lw * 3]);
      if (o.letters) { tag(ln.l1[1], '1', 0, -mr * 1.3, COL.l1); tag(ln.l2[1], '2', 0, -mr * 1.3, COL.l2); tag(ln.l3[1], '3', 0, -mr * 1.3, COL.l3); }
      if (o.level) {
        var a = V.sub(mk.E, mk.S), p0 = V.add(mk.S, V.mul(a, -0.18)), p1 = V.add(mk.E, V.mul(a, 0.18));
        stroke([p0, p1], COL.level, lw * 0.9, [lw * 1.2, lw * 2.6]);
      }
      stroke([mk.S, mk.A, mk.E], COL.ink, lw * 0.8, [lw * 3, lw * 2.4]);
      cross(sd.pupil, mr * 0.9, COL.ink);
      dot(sd.ala, mr * 0.42, COL.ink, '#fff'); dot(sd.inner, mr * 0.34, COL.ink); dot(sd.iris, mr * 0.34, COL.l2); dot(sd.outer, mr * 0.34, COL.l3);
      [['S', COL.l1], ['A', COL.l2], ['E', COL.l3]].forEach(function (z) {
        var p = mk[z[0]];
        ctx.beginPath(); ctx.arc(X(p), Y(p), mr, 0, Math.PI * 2); ctx.fillStyle = z[1]; ctx.fill(); ctx.lineWidth = lw * 1.2; ctx.strokeStyle = '#fff'; ctx.stroke();
        if (o.letters) { ctx.font = '700 ' + (mr * 1.25) + 'px "IBM Plex Mono", ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(z[0], X(p), Y(p) + mr * 0.06); }
      });
    });
    /* the eye line between the pupils, faintly, as the face's horizontal reference */
    stroke([pts.R.pupil, pts.L.pupil], 'rgba(23,22,28,.45)', lw * 0.6, [lw * 1.5, lw * 3]);
  }
  g.SkinBrowRender = { draw: draw, extent: extent, linesOf: linesOf, COL: COL };
})(window);
