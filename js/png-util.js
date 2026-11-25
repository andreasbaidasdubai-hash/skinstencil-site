/* PNG helpers shared by tools that print at true size: CRC32, the 300 dpi (pHYs) chunk, and the free-download watermark.
   The code is the same as the one inside studio/app.js (kept there untouched); new tools use this file so there is one copy to maintain.
   Exposes window.SkinPng. */
(function (g) {
  'use strict';
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
  /* Same look as the studio's free-download watermark: diagonal "skinstencil.com" in the stencil purple. */
  function watermark(x, w, h, a) {
    var fs = Math.max(18, Math.round(Math.max(w, h) / 13)), txt = 'skinstencil.com', step = fs * 2.1, ext = Math.hypot(w, h);
    x.save(); x.globalAlpha = a == null ? 0.5 : a; x.fillStyle = '#4F35C8'; x.font = '700 ' + fs + 'px Archivo, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.translate(w / 2, h / 2); x.rotate(-Math.PI / 6);
    var row = 0; for (var yy = -ext; yy < ext; yy += step, row++) { for (var xx = -ext; xx < ext; xx += fs * 9) x.fillText(txt, xx + (row % 2 ? fs * 4.5 : 0), yy); }
    x.restore();
  }
  g.SkinPng = { crc32: crc32, withDpi: withDpi, watermark: watermark };
})(window);
