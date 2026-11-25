/* Brow mapping geometry. Pure functions, no DOM, so the line maths can be unit-tested in node (see skinstencil-bench/brow).
   All points are {x, y} in image pixels (y grows downwards). Exposes window.SkinBrowGeo (and module.exports in node).

   Sides: 'R' is the CLIENT'S right (left half of a front-facing photo), 'L' is the client's left (right half of the photo).
   The face frame is built from the two pupils, so every line and measurement follows the eye line when the head is tilted:
     u = unit vector from the right pupil to the left pupil (the face's horizontal), v = u turned 90 degrees clockwise (the face's "down").
   Classic brow mapping, drawn from the nostril (alar) point of each side:
     line 1  straight up the face from the ala                -> brow START (S)
     line 2  ala through the outer edge of the iris          -> ARCH area (A)
     line 3  ala through the outer corner of the eye         -> brow END (E)
     level   S and E at the same height in the face frame.
   These are standard drawing guides. The artist decides. */
(function (g) {
  'use strict';

  /* MediaPipe Face Landmarker (478 points) indices. The eyebrow, eye and iris sets are checked against the library's own
     connection tables in skinstencil-bench/brow/check-indices.mjs; the alar points (129, 358) are the nose-wing points of the canonical mesh. */
  var IDX = {
    R: { pupil: 468, iris: [469, 470, 471, 472], inner: 133, outer: 33, ala: 129, browUpper: [70, 63, 105, 66, 107], browLower: [46, 53, 52, 65, 55] },
    L: { pupil: 473, iris: [474, 475, 476, 477], inner: 362, outer: 263, ala: 358, browUpper: [300, 293, 334, 296, 336], browLower: [276, 283, 282, 295, 285] },
    noseTip: 1
  };

  function P(x, y) { return { x: x, y: y }; }
  function sub(a, b) { return P(a.x - b.x, a.y - b.y); }
  function add(a, b) { return P(a.x + b.x, a.y + b.y); }
  function mul(a, k) { return P(a.x * k, a.y * k); }
  function dot(a, b) { return a.x * b.x + a.y * b.y; }
  function len(a) { return Math.sqrt(a.x * a.x + a.y * a.y); }
  function norm(a) { var l = len(a) || 1; return P(a.x / l, a.y / l); }
  function mid(a, b) { return P((a.x + b.x) / 2, (a.y + b.y) / 2); }
  function deg(r) { return r * 180 / Math.PI; }

  /* The face frame from the two pupil centres. roll is the tilt of the eye line in degrees (0 = level, positive = the client's left side is lower in the photo). */
  function frame(pupilR, pupilL) {
    var d = sub(pupilL, pupilR), l = len(d) || 1, u = P(d.x / l, d.y / l), v = P(-u.y, u.x);
    return { o: mid(pupilR, pupilL), u: u, v: v, ipd: l, roll: deg(Math.atan2(d.y, d.x)),
      toFace: function (p) { var q = sub(p, this.o); return P(dot(q, this.u), dot(q, this.v)); },
      toImage: function (f) { return P(this.o.x + this.u.x * f.x + this.v.x * f.y, this.o.y + this.v.y * f.y + this.u.y * f.x); } };
  }

  /* Point on the infinite line a->b where the face-frame y equals fy. Returns null when the line runs parallel to the level. */
  function atLevel(F, a, b, fy) {
    var d = sub(b, a), dv = dot(d, F.v);
    if (Math.abs(dv) < 1e-9) return null;
    var t = (fy - dot(sub(a, F.o), F.v)) / dv;
    return add(a, mul(d, t));
  }

  /* y of a polyline (face frame, sorted by x) at x; clamps to the end points outside its range. */
  function yAt(poly, x) {
    if (!poly.length) return 0;
    if (x <= poly[0].x) return poly[0].y;
    for (var i = 1; i < poly.length; i++) {
      if (x <= poly[i].x) { var a = poly[i - 1], b = poly[i], t = (x - a.x) / ((b.x - a.x) || 1); return a.y + (b.y - a.y) * t; }
    }
    return poly[poly.length - 1].y;
  }

  /* Centre line of an existing brow in the face frame, sorted by x. */
  function browCentre(F, brow) {
    var c = [], n = Math.min(brow.upper.length, brow.lower.length), i;
    for (i = 0; i < n; i++) c.push(F.toFace(mid(brow.upper[i], brow.lower[i])));
    c.sort(function (a, b) { return a.x - b.x; });
    return c;
  }

  /* Starting positions for the three markers of one side, from the guide lines and the client's existing brow (landmarks).
     S: line 1 at the existing brow's height. E: line 3 at the same height as S (the level rule). A: line 2 where it meets the existing brow centre line. */
  function suggest(F, side) {
    var ala = side.ala, c = browCentre(F, side.brow), fa = F.toFace(ala);
    var upTarget = F.toImage(P(fa.x, fa.y - 100));
    var yS = yAt(c, fa.x);
    var S = atLevel(F, ala, upTarget, yS);
    var E = atLevel(F, ala, side.outer, yS);
    /* arch: bisection on f(t) = line2.y - brow.y along the line from the ala through the outer iris edge */
    var d = norm(sub(side.iris, ala)), fd = P(dot(d, F.u), dot(d, F.v)), A = null, lo = 0, hi = 4 * len(sub(side.iris, ala)), steps = 60;
    function f(t) { var fp = P(fa.x + fd.x * t, fa.y + fd.y * t); return fp.y - yAt(c, fp.x); }
    var t0 = 0, prev = f(0), cross = -1, i;
    for (i = 1; i <= steps; i++) { var ti = hi * i / steps, fi = f(ti); if (prev > 0 && fi <= 0) { cross = i; break; } prev = fi; t0 = ti; }
    if (cross > 0) { lo = t0; hi = hi * cross / steps; for (i = 0; i < 40; i++) { var m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; } var tm = (lo + hi) / 2; A = F.toImage(P(fa.x + fd.x * tm, fa.y + fd.y * tm)); }
    else A = atLevel(F, ala, side.iris, Math.min(yS, c.reduce(function (m, p) { return Math.min(m, p.y); }, yS)));
    return { S: S || upTarget, A: A, E: E || side.outer };
  }

  /* Millimetres per pixel from a known length: the client's pupil to pupil distance (mm), or a card edge (85.6 mm) placed between two points. */
  function mmPerPxFromIpd(ipdMm, pupilR, pupilL) { var l = len(sub(pupilL, pupilR)); return l > 0 ? ipdMm / l : 0; }
  function mmPerPxFromCard(cardMm, p1, p2) { var l = len(sub(p2, p1)); return l > 0 ? cardMm / l : 0; }

  /* Measurements of one brow in mm, in the face frame. Positive arch height = the arch is above the S-E line. Tail angle is measured from the face's horizontal, positive = the end points downward. */
  function measureSide(F, S, A, E, mm, browSide) {
    var s = F.toFace(S), a = F.toFace(A), e = F.toFace(E), res = {};
    res.width = Math.abs(e.x - s.x) * mm;
    res.length = (len(sub(a, s)) + len(sub(e, a))) * mm;
    res.arch = lineSide(s, e, a) * mm;
    res.level = Math.abs(e.y - s.y) * mm;
    var ae = sub(e, a);
    res.tail = deg(Math.atan2(ae.y, Math.abs(ae.x) || 1e-9));
    var sa = sub(a, s);
    res.head = deg(Math.atan2(-sa.y, Math.abs(sa.x) || 1e-9));   /* positive = S to A rises */
    if (browSide) {
      var c = browCentre(F, browSide), th = 0, n = Math.min(browSide.upper.length, browSide.lower.length), i, best = 0;
      for (i = 0; i < n; i++) { var d = len(sub(browSide.upper[i], browSide.lower[i])); if (d > best) best = d; th += d; }
      res.thickness = (th / n) * mm;
      res.thicknessMax = best * mm;
    }
    return res;
  }
  /* Height of A above the S-E line (perpendicular distance, face-frame pixels). Positive = above, whichever way the line runs. */
  function lineSide(s, e, a) {
    var se = sub(e, s), L = len(se) || 1, cr = se.x * (a.y - s.y) - se.y * (a.x - s.x);
    return -(cr / L) * (se.x < 0 ? -1 : 1);
  }

  /* Distance between the two brow starts, along the face's horizontal, in mm (and the level difference between them). */
  function startsDistance(F, SR, SL, mm) { var a = F.toFace(SR), b = F.toFace(SL); return { across: Math.abs(b.x - a.x) * mm, level: Math.abs(b.y - a.y) * mm }; }

  /* How far the face looks turned away from the camera: ratio of the nose tip's distances to the two outer eye corners. 1 = straight on. */
  function turnRatio(noseTip, outerR, outerL) { var a = len(sub(noseTip, outerR)), b = len(sub(noseTip, outerL)); return b > 0 ? a / b : 1; }

  /* Build the point set from a MediaPipe result: lm = array of {x, y} normalised to [0,1]; w, h = image size in pixels. */
  function fromLandmarks(lm, w, h) {
    var at = function (i) { return P(lm[i].x * w, lm[i].y * h); };
    var out = { noseTip: at(IDX.noseTip) };
    ['R', 'L'].forEach(function (k) {
      var I = IDX[k], pupil = at(I.pupil);
      out[k] = { pupil: pupil, inner: at(I.inner), outer: at(I.outer), ala: at(I.ala), iris: null,
        brow: { upper: I.browUpper.map(at), lower: I.browLower.map(at) } };
      out[k]._irisPts = I.iris.map(at);
    });
    var F = frame(out.R.pupil, out.L.pupil);
    ['R', 'L'].forEach(function (k) {
      var s = out[k], sign = k === 'R' ? -1 : 1, best = null, bv = -1e9;
      s._irisPts.forEach(function (p) { var v = dot(sub(p, s.pupil), F.u) * sign; if (v > bv) { bv = v; best = p; } });
      s.iris = best; delete s._irisPts;
    });
    return out;
  }

  /* A generic, centred starting set for placing the points by hand when no face is found. Proportions are typical, not measured: the artist moves every point. */
  function template(w, h) {
    var cx = w / 2, cy = h * 0.42, s = Math.min(w, h * 0.78) * 0.5;   /* s = half the face width, in px */
    function pt(fx, fy) { return P(cx + fx * s, cy + fy * s); }
    var o = { noseTip: pt(0, 0.62) };
    [['R', -1], ['L', 1]].forEach(function (z) {
      var k = z[0], q = z[1];
      o[k] = { pupil: pt(q * 0.34, 0), iris: pt(q * 0.405, 0), inner: pt(q * 0.17, 0.02), outer: pt(q * 0.52, 0.02), ala: pt(q * 0.17, 0.58),
        brow: { upper: [0.56, 0.44, 0.32, 0.22, 0.12].map(function (x, i) { return pt(q * x, -0.2 - [0.02, 0.07, 0.08, 0.06, 0.03][i]); }),
                lower: [0.54, 0.44, 0.32, 0.22, 0.12].map(function (x, i) { return pt(q * x, -0.12 - [0.0, 0.04, 0.06, 0.04, 0.03][i]); }) } };
    });
    return o;
  }

  var api = { IDX: IDX, frame: frame, atLevel: atLevel, suggest: suggest, browCentre: browCentre, measureSide: measureSide, startsDistance: startsDistance,
    mmPerPxFromIpd: mmPerPxFromIpd, mmPerPxFromCard: mmPerPxFromCard, turnRatio: turnRatio, fromLandmarks: fromLandmarks, template: template, vec: { P: P, sub: sub, add: add, mul: mul, dot: dot, len: len, norm: norm, mid: mid } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else g.SkinBrowGeo = api;
})(typeof window !== 'undefined' ? window : globalThis);
