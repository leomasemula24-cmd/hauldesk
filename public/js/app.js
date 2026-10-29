// HaulDesk app: sign-in, navigation by role, and page routing
(function () {
  var h = UI.h;
  var root = document.getElementById('app');
  var state = { user: null, lookups: null, cleanup: null };

  var ICONS = {
    dashboard: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
    dispatch: '<path d="M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z"/>',
    tracking: '<path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/>',
    weighbridge: '<path d="M3 17h18v3H3zM6 8h12l2 7H4zM9 4h6v3H9z"/>',
    stockpiles: '<path d="M2 20 9 8l4 6 3-4 6 10z"/>',
    fleet: '<path d="M3 6h11v9H3zM14 9h4l3 3v3h-7zM6.5 19a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM17.5 19a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>',
    documents: '<path d="M6 2h9l5 5v15H6zM14 3v5h5"/>',
    issues: '<path d="M12 2 1 21h22zM11 9h2v6h-2zM11 17h2v2h-2z"/>',
    reports: '<path d="M4 20V10h3v10zM10.5 20V4h3v16zM17 20v-7h3v7z"/>'
  };
  var NAV = ['dashboard', 'dispatch', 'tracking', 'weighbridge', 'stockpiles', 'fleet', 'documents', 'issues', 'reports'];
  var ROLE_LABEL = { coordinator: 'Transport coordinator', client: 'Client', supplier: 'Haulier', driver: 'Driver' };
  var DEMO_USERS = [
    { u: 'coordinator', who: 'Thandi Nkosi', what: 'Coordinator: sees and runs everything' },
    { u: 'tselapower', who: 'Kagiso Molefe', what: 'Client: Tsela Power deliveries' },
    { u: 'tselarail', who: 'Naledi Dube', what: 'Client: Tsela Rail & Port' },
    { u: 'tselamining', who: 'Pieter van Wyk', what: 'Client: Tsela Mining dispatches' },
    { u: 'mokoena', who: 'Sipho Mokoena', what: 'Haulier: Mokoena Haulage fleet' },
    { u: 'driver', who: 'Themba (driver)', what: 'Driver: own loads only' }
  ];

  function icon(name) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'currentColor'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name]; return s;
  }
  function wordmark() {
    var m = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    m.setAttribute('viewBox', '0 0 32 32'); m.setAttribute('width', '28'); m.setAttribute('height', '28'); m.setAttribute('aria-hidden', 'true');
    m.innerHTML = '<rect width="32" height="32" rx="7" fill="#1D2D4F"/><path d="M7 20h18" stroke="#E0A100" stroke-width="4" stroke-linecap="round"/><circle cx="10" cy="12" r="3" fill="#fff"/><circle cx="22" cy="12" r="3" fill="#E0A100"/>';
    return h('div', { class: 'wordmark' }, m, 'HaulDesk');
  }
  function describe(u) {
    if (u.role === 'client') return u.division + ' · client';
    if (u.role === 'supplier' && state.lookups) {
      var hl = state.lookups.hauliers.find(function (x) { return x.id === u.haulier_id; });
      return (hl ? hl.name : 'Haulier') + ' · haulier';
    }
    return ROLE_LABEL[u.role];
  }

  // ---------- sign in ----------
  function renderLogin(message) {
    var error = h('p', { class: 'error-text', role: 'alert' }, message || '');
    var user = h('input', { id: 'username', type: 'text', autocomplete: 'username', required: true });
    var pass = h('input', { id: 'password', type: 'password', autocomplete: 'current-password', required: true });
    var btn = h('button', { class: 'btn primary', type: 'submit', style: 'width:100%;justify-content:center;padding:.65rem' }, 'Sign in');
    async function signIn(username, password) {
      btn.disabled = true; error.textContent = '';
      try { var r = await API.post('/login', { username: username, password: password }); await start(r.user); }
      catch (e) { error.textContent = e.message; btn.disabled = false; }
    }
    var form = h('form', { class: 'login-card', onsubmit: function (e) { e.preventDefault(); signIn(user.value, pass.value); } },
      h('h2', null, 'Sign in'),
      h('p', { class: 'sub' }, API.mode === 'demo' ? 'Demo mode: fictitious data, nothing is saved.' : 'Use your HaulDesk account.'),
      h('div', { style: 'display:grid;gap:.9rem' },
        h('div', { class: 'field' }, h('label', { for: 'username' }, 'Username'), user),
        h('div', { class: 'field' }, h('label', { for: 'password' }, 'Password'), pass),
        error, btn),
      h('div', { class: 'accounts' },
        h('h3', null, 'Try a role (password demo1234)'),
        h('ul', null, DEMO_USERS.map(function (d) {
          return h('li', null, h('button', { type: 'button', onclick: function () { user.value = d.u; pass.value = 'demo1234'; signIn(d.u, 'demo1234'); } },
            h('span', null, h('strong', null, d.u), h('br'), h('small', null, d.what)), h('small', null, 'Sign in')));
        }))));
    root.replaceChildren(h('div', { class: 'login' },
      h('div', { class: 'login-brand' },
        wordmark(),
        h('div', null,
          h('h1', null, 'Every load, truck and tonne in one place.'),
          h('p', null, 'HaulDesk helps transport coordinators move coal from mines to power stations, rail sidings and the harbour, and keeps clients, hauliers and drivers working from the same picture.')),
        h('p', { class: 'fine' }, 'Portfolio project by Leonard Masemula. Tsela Group and all data shown are fictitious.')),
      h('div', { class: 'login-form' }, form)));
    user.focus();
  }

  // ---------- after sign in ----------
  async function start(user) {
    state.user = user;
    try { state.lookups = await API.get('/lookups'); } catch (e) { state.lookups = { sites: [], hauliers: [], vehicles: [], drivers: [] }; }
    renderShell();
    route();
  }

  function allowedViews() {
    return NAV.filter(function (k) { var v = Views[k]; return v && v.roles.indexOf(state.user.role) >= 0; });
  }

  function renderShell() {
    var u = state.user;
    var nav = h('nav', { class: 'nav', 'aria-label': 'Main' }, allowedViews().map(function (k) {
      return h('a', { href: '#' + k, 'data-view': k }, icon(k), h('span', null, Views[k].navLabel ? Views[k].navLabel(u) : Views[k].title));
    }));
    var demoBar = null;
    if (API.mode === 'demo') {
      var sel = h('select', { 'aria-label': 'Switch demo user', onchange: async function () {
        try { await API.post('/logout'); var r = await API.post('/login', { username: sel.value, password: 'demo1234' }); location.hash = ''; await start(r.user); }
        catch (e) { UI.toast(e.message, 'error'); }
      } }, DEMO_USERS.map(function (d) { return h('option', { value: d.u, selected: d.u === u.username }, d.who + ': ' + d.what); }));
      demoBar = h('div', { class: 'demo-bar' }, h('span', null, 'Demo mode with fictitious data. Changes reset when you reload.'), h('label', null, 'View as ', sel));
    }
    var menuBtn = h('button', { class: 'btn menu-btn', type: 'button', 'aria-label': 'Open menu', onclick: function () { shell.classList.toggle('menu-open'); } }, '☰ Menu');
    var shell = h('div', { class: 'shell' },
      h('aside', { class: 'sidebar' }, wordmark(), nav,
        h('div', { class: 'me' }, h('strong', null, u.full_name), h('span', null, describe(u)), h('br'),
          h('button', { type: 'button', onclick: logout }, 'Sign out'))),
      h('div', { class: 'main' }, demoBar,
        h('div', { class: 'topbar' }, menuBtn, h('h1', { id: 'page-title' }), h('div', { class: 'actions', id: 'page-actions' }), h('p', { class: 'lead', id: 'page-lead' })),
        h('main', { class: 'view', id: 'view', tabindex: '-1' })));
    shell.addEventListener('click', function (e) { if (e.target.closest('.nav a')) shell.classList.remove('menu-open'); });
    root.replaceChildren(shell);
  }

  async function logout() {
    try { await API.post('/logout'); } catch (e) { /* ignore */ }
    state.user = null; location.hash = ''; renderLogin();
  }

  async function route() {
    if (!state.user) return;
    if (state.cleanup) { state.cleanup(); state.cleanup = null; }
    var allowed = allowedViews();
    var key = location.hash.replace('#', '');
    if (allowed.indexOf(key) < 0) key = state.user.role === 'driver' ? 'dispatch' : allowed[0];
    var view = Views[key];
    document.querySelectorAll('.nav a').forEach(function (a) { a.toggleAttribute('aria-current', a.dataset.view === key); if (a.dataset.view === key) a.setAttribute('aria-current', 'page'); });
    var title = view.navLabel ? view.navLabel(state.user) : view.title;
    document.getElementById('page-title').textContent = title;
    document.getElementById('page-lead').textContent = view.lead ? view.lead(state.user) : '';
    document.title = title + ' · HaulDesk';
    var container = document.getElementById('view');
    var actions = document.getElementById('page-actions');
    actions.replaceChildren();
    container.replaceChildren(h('div', { class: 'loading-view' }, 'Loading…'));
    var ctx = {
      user: state.user, lookups: state.lookups, view: container,
      setActions: function () { actions.replaceChildren.apply(actions, arguments); },
      onLeave: function (fn) { state.cleanup = fn; },
      refresh: function () { route(); }
    };
    try { await view.render(ctx); }
    catch (e) {
      if (e.status === 401) { state.user = null; renderLogin('Your session ended. Please sign in again.'); return; }
      container.replaceChildren(h('div', { class: 'panel empty' }, 'This page could not load: ' + e.message));
    }
  }

  window.addEventListener('hashchange', route);

  (async function boot() {
    try { await API.init(); }
    catch (e) { root.replaceChildren(h('div', { class: 'loading-view' }, 'HaulDesk could not start: ' + e.message)); return; }
    try { var r = await API.get('/me'); if (r.user) { await start(r.user); return; } }
    catch (e) { /* not signed in */ }
    renderLogin();
  })();
})();
