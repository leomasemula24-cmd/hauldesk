/*
 * Talks to the HaulDesk server. If there is no server (for example when the
 * app is opened from GitHub Pages), it switches to demo mode and answers the
 * same requests in the browser from fictitious data.
 */
window.API = (function () {
  var mode = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }

  async function init() {
    try {
      var r = await fetch('api/health', { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
      if (r.ok) {
        var d = await r.json();
        if (d.mode === 'server') { mode = 'server'; return mode; }
      }
    } catch (e) { /* no server: fall through to demo mode */ }
    await loadScript('js/lib/sample-data.js');
    await loadScript('js/demo-store.js');
    mode = 'demo';
    return mode;
  }

  async function request(method, path, body) {
    if (mode === 'demo') return window.DemoStore.handle(method, path, body);
    var r = await fetch('api' + path, {
      method: method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    var data = {};
    try { data = await r.json(); } catch (e) { /* empty or non-JSON reply */ }
    if (!r.ok) {
      var err = new Error(data.error || 'The request failed (' + r.status + ').');
      err.status = r.status; throw err;
    }
    return data;
  }

  return {
    init: init,
    get mode() { return mode; },
    get: function (p) { return request('GET', p); },
    post: function (p, b) { return request('POST', p, b); },
    patch: function (p, b) { return request('PATCH', p, b); }
  };
})();
