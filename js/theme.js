/* Theme: dark is the default look (studios and flash sheets are dark); the visitor can switch, and the choice is remembered on this device.
   Runs in <head> so the page never flashes the wrong theme. Comments say why; the toggle is injected so both templates share it. */
(function () {
  var KEY = 'skinstencil.theme', root = document.documentElement;
  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  var cur = get() === 'light' ? 'light' : 'dark';
  root.setAttribute('data-theme', cur);
  document.addEventListener('DOMContentLoaded', function () {
    var host = document.querySelector('.topnav') || document.querySelector('header .wrap'); if (!host) return;
    var T = (window.I18N || {}), b = document.createElement('button');
    b.type = 'button'; b.className = 'themebtn'; b.setAttribute('aria-label', T['theme.label'] || 'Light or dark');
    function paint() { b.textContent = cur === 'dark' ? '☾' : '☀'; b.setAttribute('aria-pressed', String(cur === 'dark')); }
    b.addEventListener('click', function () { cur = cur === 'dark' ? 'light' : 'dark'; root.setAttribute('data-theme', cur); set(cur); paint(); });
    paint(); var sel = host.querySelector('.langsel'); host.insertBefore(b, sel ? sel.nextSibling : null);
  });
})();
