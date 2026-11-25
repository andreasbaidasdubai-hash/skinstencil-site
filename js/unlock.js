/* License check for the watermark. No server of ours is involved: the key is checked with the payment provider's public endpoints
   and the result is kept in this browser only (localStorage). This is a light lock for a low-priced tool, not copy protection.
   Each key allows two devices (set on the Polar benefit): the first activation on a browser registers it, later checks send that activation id. */
(function (g) {
  'use strict';
  var C = g.SkinConfig || {}, KEY = 'skinstencil.license', RECHECK_MS = 6 * 3600 * 1000, API = 'https://api.polar.sh/v1/customer-portal/license-keys/';
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }
  function live(s) { return !!(s && (!s.expires || new Date(s.expires) > new Date())); }
  function post(path, body) {
    return fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  function label() { var u = (g.navigator && navigator.userAgent) || 'browser'; return 'browser ' + u.slice(0, 60); }

  /* Register this browser against the key (needed when the key has an activation limit). Returns the activation id, or a refusal. */
  function register(key) {
    return post('activate', { key: key, organization_id: C.polarOrgId, label: label() }).then(function (r) {
      if (r.status === 403) return { ok: false, reason: 'limit' };
      if (r.status === 404 || r.status === 422) return { ok: false, reason: 'invalid' };
      if (!r.ok) return { ok: false, reason: 'network' };
      return r.json().then(function (j) { return { ok: true, id: j.id }; });
    }).catch(function () { return { ok: false, reason: 'network' }; });
  }
  function validate(key, activationId) {
    if (!C.polarOrgId) return Promise.resolve({ ok: false, reason: 'notConfigured' });
    var body = { key: key, organization_id: C.polarOrgId };
    if (activationId) body.activation_id = activationId;
    return post('validate', body).then(function (r) {
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
    if (!C.polarOrgId) return Promise.resolve({ ok: false, reason: 'notConfigured' });
    return register(key).then(function (a) {
      if (!a.ok) return a;
      return validate(key, a.id).then(function (v) {
        if (v.ok) save({ key: key, activation: a.id, expires: v.expires, checkedAt: Date.now() });
        return v;
      });
    });
  }
  /* On load: re-check an old key now and then. A network problem keeps the unlock; a refused key removes it. */
  function refresh() {
    var s = load();
    if (!s) return Promise.resolve(false);
    if (!live(s)) { clear(); return Promise.resolve(false); }
    if (Date.now() - s.checkedAt < RECHECK_MS) return Promise.resolve(true);
    return validate(s.key, s.activation).then(function (v) {
      if (v.ok) { s.checkedAt = Date.now(); s.expires = v.expires; save(s); return true; }
      if (v.reason === 'network' || v.reason === 'notConfigured') return true;
      clear(); return false;
    });
  }
  g.SkinUnlock = { isUnlocked: function () { return live(load()); }, activate: activate, refresh: refresh, clear: clear, configured: function () { return !!C.polarOrgId; } };
})(window);
