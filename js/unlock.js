/* License check for the watermark. No server of ours is involved: the key is validated with the payment provider's public endpoint
   and the result is kept in this browser only (localStorage). This is a light lock for a low-priced tool, not copy protection. */
(function (g) {
  'use strict';
  var C = g.SkinConfig || {}, KEY = 'skinstencil.license', RECHECK_MS = 6 * 3600 * 1000;
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }
  function live(s) { return !!(s && (!s.expires || new Date(s.expires) > new Date())); }

  function validate(key) {
    if (!C.polarOrgId) return Promise.resolve({ ok: false, reason: 'notConfigured' });
    return fetch('https://api.polar.sh/v1/customer-portal/license-keys/validate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: key, organization_id: C.polarOrgId })
    }).then(function (r) {
      if (r.status === 404 || r.status === 422) return { ok: false, reason: 'invalid' };
      if (!r.ok) return { ok: false, reason: 'network' };
      return r.json().then(function (j) {
        var expired = j.expires_at && new Date(j.expires_at) <= new Date();
        var ok = j.status === 'granted' && !expired;
        return { ok: ok, reason: ok ? 'ok' : (expired ? 'expired' : 'invalid'), expires: j.expires_at || null };
      });
    }).catch(function () { return { ok: false, reason: 'network' }; });
  }
  function activate(key) {
    key = String(key || '').trim();
    if (!key) return Promise.resolve({ ok: false, reason: 'invalid' });
    return validate(key).then(function (v) { if (v.ok) save({ key: key, expires: v.expires, checkedAt: Date.now() }); return v; });
  }
  /* On load: re-check an old key now and then. A network problem keeps the unlock; a refused key removes it. */
  function refresh() {
    var s = load();
    if (!s) return Promise.resolve(false);
    if (!live(s)) { clear(); return Promise.resolve(false); }
    if (Date.now() - s.checkedAt < RECHECK_MS) return Promise.resolve(true);
    return validate(s.key).then(function (v) {
      if (v.ok) { s.checkedAt = Date.now(); s.expires = v.expires; save(s); return true; }
      if (v.reason === 'network' || v.reason === 'notConfigured') return true;
      clear(); return false;
    });
  }
  g.SkinUnlock = { isUnlocked: function () { return live(load()); }, activate: activate, refresh: refresh, clear: clear, configured: function () { return !!C.polarOrgId; } };
})(window);
