/* True-size PDF writer for the stencil. Runs in the browser; nothing is uploaded.
   The picture is placed at its real size in millimetres. If it is larger than one sheet it is cut into tiles with a 10 mm overlap
   (so the sheets can be taped together) and each sheet carries a small label. Written by hand: no library, no network.
   Exposes window.SkinPdf.build(canvas, mmWidth, paper) -> Promise<Blob>, paper = 'a4' | 'letter'. */
(function (g) {
  'use strict';
  var PAPER = { a4: [210, 297], letter: [215.9, 279.4] };
  var MARGIN = 8, LABEL = 7, OVERLAP = 10, PT = 72 / 25.4;
  var enc = new TextEncoder();

  function plan(mmW, mmH, W, H) {
    var pw = W - 2 * MARGIN, ph = H - 2 * MARGIN - LABEL;
    function axis(total, room) { if (total <= room) return [[0, total]]; var step = room - OVERLAP, n = Math.ceil((total - OVERLAP) / step), out = [], i; for (i = 0; i < n; i++) { var a = i * step; out.push([a, Math.min(total, a + room)]); } return out; }
    return { W: W, H: H, cols: axis(mmW, pw), rows: axis(mmH, ph) };
  }
  function layout(mmW, mmH, paper) {
    var p = PAPER[paper] || PAPER.a4, a = plan(mmW, mmH, p[0], p[1]), b = plan(mmW, mmH, p[1], p[0]);
    return a.cols.length * a.rows.length <= b.cols.length * b.rows.length ? a : b;
  }
  function deflate(u8) {
    if (!g.CompressionStream) return Promise.resolve({ data: u8, filter: '' });
    var cs = new CompressionStream('deflate'), w = cs.writable.getWriter(); w.write(u8); w.close();
    return new Response(cs.readable).arrayBuffer().then(function (b) { return { data: new Uint8Array(b), filter: '/FlateDecode' }; });
  }
  function grayOf(canvas, x0, y0, x1, y1) {
    var w = x1 - x0, h = y1 - y0, d = canvas.getContext('2d').getImageData(x0, y0, w, h).data, out = new Uint8Array(w * h), i, j;
    for (i = 0, j = 0; j < out.length; j++, i += 4) out[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    return { w: w, h: h, bytes: out };
  }
  function num(n) { return (Math.round(n * 100) / 100).toString(); }
  function ascii(s) { return String(s).replace(/[^\x20-\x7e]/g, '?').replace(/([()\\])/g, '\\$1'); }

  function build(canvas, mmW, paper) {
    var mmH = mmW * canvas.height / canvas.width, L = layout(mmW, mmH, paper), spx = canvas.width / mmW, total = L.cols.length * L.rows.length, tiles = [], r, c;
    for (r = 0; r < L.rows.length; r++) for (c = 0; c < L.cols.length; c++) tiles.push({ r: r, c: c, x: L.cols[c], y: L.rows[r] });
    return Promise.all(tiles.map(function (t) {
      var px0 = Math.round(t.x[0] * spx), px1 = Math.max(px0 + 1, Math.round(t.x[1] * spx)), py0 = Math.round(t.y[0] * spx), py1 = Math.max(py0 + 1, Math.round(t.y[1] * spx));
      px1 = Math.min(px1, canvas.width); py1 = Math.min(py1, canvas.height);
      var gr = grayOf(canvas, px0, py0, px1, py1);
      return deflate(gr.bytes).then(function (z) { return { img: z, w: gr.w, h: gr.h }; });
    })).then(function (imgs) {
      var parts = [], len = 0, offsets = [];
      function put(x) { var u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u); len += u.length; }
      function obj(n, body, stream) {
        offsets[n] = len; put(n + ' 0 obj\n' + body);
        if (stream) { put('\nstream\n'); put(stream); put('\nendstream'); }
        put('\nendobj\n');
      }
      put('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
      // object numbers: 1 catalog, 2 pages, 3 font, then per tile: page, content, image
      var kids = tiles.map(function (_, i) { return (4 + i * 3) + ' 0 R'; }).join(' ');
      obj(1, '<</Type/Catalog/Pages 2 0 R>>');
      obj(2, '<</Type/Pages/Kids[' + kids + ']/Count ' + total + '>>');
      obj(3, '<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>');
      tiles.forEach(function (t, i) {
        var n = 4 + i * 3, im = imgs[i], Wp = L.W * PT, Hp = L.H * PT;
        var wpt = im.w / spx * PT, hpt = im.h / spx * PT, x = MARGIN * PT, y = Hp - MARGIN * PT - hpt;
        var cs = 'q ' + num(wpt) + ' 0 0 ' + num(hpt) + ' ' + num(x) + ' ' + num(y) + ' cm /Im0 Do Q\n';
        if (total > 1) cs += '0.6 G 0.4 w ' + num(x) + ' ' + num(y) + ' ' + num(wpt) + ' ' + num(hpt) + ' re S\n';
        var label = 'skinstencil.com  |  ' + num(mmW) + ' x ' + num(mmH) + ' mm  |  print at 100%, no scaling' + (total > 1 ? '  |  sheet ' + (i + 1) + ' of ' + total + ' (row ' + (t.r + 1) + ', column ' + (t.c + 1) + '), 10 mm overlap' : '');
        cs += 'BT /F1 7 Tf 0.35 g ' + num(MARGIN * PT) + ' ' + num(MARGIN * PT * 0.6) + ' Td (' + ascii(label) + ') Tj ET\n';
        var cb = enc.encode(cs);
        obj(n, '<</Type/Page/Parent 2 0 R/MediaBox[0 0 ' + num(Wp) + ' ' + num(Hp) + ']/Resources<</XObject<</Im0 ' + (n + 2) + ' 0 R>>/Font<</F1 3 0 R>>>>/Contents ' + (n + 1) + ' 0 R>>');
        obj(n + 1, '<</Length ' + cb.length + '>>', cb);
        obj(n + 2, '<</Type/XObject/Subtype/Image/Width ' + im.w + '/Height ' + im.h + '/ColorSpace/DeviceGray/BitsPerComponent 8' + (im.img.filter ? '/Filter' + im.img.filter : '') + '/Length ' + im.img.data.length + '>>', im.img.data);
      });
      var count = 4 + tiles.length * 3, xref = len, x = 'xref\n0 ' + count + '\n0000000000 65535 f \n', k;
      for (k = 1; k < count; k++) x += ('0000000000' + offsets[k]).slice(-10) + ' 00000 n \n';
      put(x + 'trailer\n<</Size ' + count + '/Root 1 0 R>>\nstartxref\n' + xref + '\n%%EOF\n');
      return { blob: new Blob(parts, { type: 'application/pdf' }), sheets: total };
    });
  }
  g.SkinPdf = { build: build, layout: layout };
})(window);
