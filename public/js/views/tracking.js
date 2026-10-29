window.Views = window.Views || {};
Views.tracking = {
  title: 'Live map',
  roles: ['coordinator', 'client', 'supplier'],
  lead: function () { return 'Every truck on one map, whichever tracking provider it reports through. Positions refresh every 30 seconds.'; },
  render: async function (ctx) {
    var h = UI.h, fmt = UI.fmt;
    var data = await API.get('/tracking');
    if (!window.L) { ctx.view.replaceChildren(h('div', { class: 'panel empty' }, 'The map library could not load. Check the internet connection.')); return; }

    var providers = Array.from(new Set(data.trucks.map(function (t) { return t.tracker_provider; }))).sort();
    var hidden = {};
    var mapEl = h('div', { id: 'map', role: 'region', 'aria-label': 'Map of sites and trucks' });
    var list = h('ul');
    var counts = h('span', { class: 'hint' });
    var filters = h('div', { class: 'providers', role: 'group', 'aria-label': 'Tracking providers' }, providers.map(function (p) {
      var cb = h('input', { type: 'checkbox', checked: true, onchange: function () { hidden[p] = !cb.checked; draw(); } });
      return h('label', null, cb, p);
    }));
    ctx.setActions(h('button', { class: 'btn', type: 'button', onclick: function () { fit(true); } }, 'Show harbour route'),
      h('button', { class: 'btn', type: 'button', onclick: function () { fit(false); } }, 'Inland sites'));
    ctx.view.replaceChildren(
      h('div', { class: 'toolbar' }, h('span', { class: 'muted small' }, 'Providers:'), filters,
        h('span', { class: 'legend', style: 'margin-left:auto' }, UI.badge('in_transit'), UI.badge('loading'), UI.badge('late', 'Late'), UI.badge('cancelled', 'Idle'))),
      h('div', { class: 'map-layout' }, mapEl, UI.panel('Trucks', null, h('div', { class: 'truck-list' }, list))));
    list.parentElement.parentElement.querySelector('header').appendChild(counts);

    var map = L.map(mapEl, { scrollWheelZoom: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    data.sites.forEach(function (s) {
      L.marker([s.lat, s.lng], { icon: L.divIcon({ className: '', html: '<div class="site-pin ' + s.site_type + '"></div>', iconSize: [14, 14] }), title: s.name })
        .addTo(map).bindTooltip(s.name + ' · ' + UI.SITE_TYPE[s.site_type], { direction: 'top' });
    });
    function fit(all) {
      var pts = data.sites.filter(function (s) { return all || s.site_type !== 'harbour'; }).map(function (s) { return [s.lat, s.lng]; });
      map.fitBounds(pts, { padding: [40, 40] });
    }
    fit(false);

    var layer = L.layerGroup().addTo(map), markers = {};
    function draw() {
      layer.clearLayers(); markers = {};
      var shown = data.trucks.filter(function (t) { return !hidden[t.tracker_provider]; });
      var order = { in_transit: 0, loading: 1, idle: 2 };
      shown.sort(function (a, b) { return (b.overdue - a.overdue) || order[a.status] - order[b.status] || a.registration.localeCompare(b.registration); });
      shown.forEach(function (t) {
        var cls = t.overdue ? 'late' : t.status;
        if (t.status === 'in_transit') {
          var site = function (name) { return data.sites.find(function (s) { return s.name === name; }); };
          var o = site(t.origin_name), d = site(t.dest_name);
          if (o && d) L.polyline([[o.lat, o.lng], [t.lat, t.lng], [d.lat, d.lng]], { color: t.overdue ? '#C23B3B' : '#E0A100', weight: 2, dashArray: '4 6', opacity: .8 }).addTo(layer);
        }
        var m = L.marker([t.lat, t.lng], { icon: L.divIcon({ className: '', html: '<div class="truck-pin ' + cls + '"></div>', iconSize: [16, 16] }), title: t.registration, zIndexOffset: t.status === 'idle' ? 0 : 500 })
          .addTo(layer).bindPopup(popup(t));
        markers[t.vehicle_id] = m;
      });
      var moving = shown.filter(function (t) { return t.status === 'in_transit'; }).length;
      counts.textContent = moving + ' moving · ' + shown.length + ' shown';
      list.replaceChildren.apply(list, shown.map(function (t) {
        return h('li', { tabindex: 0, onclick: function () { focus(t); }, onkeydown: function (e) { if (e.key === 'Enter') focus(t); } },
          h('span', null, h('strong', null, t.registration), ' ', t.overdue ? UI.badge('late', 'Late') : t.status === 'idle' ? UI.badge('cancelled', 'Idle') : UI.badge(t.status)),
          h('span', { class: 'small muted' }, t.status === 'idle' ? 'At ' + t.origin_name : t.load_no + ' · ' + t.origin_name.replace(' Colliery', '') + ' → ' + t.dest_name),
          h('span', { class: 'small muted' }, t.tracker_provider + ' · ' + t.haulier_name));
      }));
    }
    function popup(t) {
      var s = '<strong>' + t.registration + '</strong><br>' + t.haulier_name + ' · tracked by ' + t.tracker_provider;
      if (t.status === 'idle') return s + '<br>Idle at ' + t.origin_name;
      s += '<br>' + t.load_no + ': ' + t.origin_name + ' → ' + t.dest_name + '<br>Driver: ' + (t.driver_name || '–');
      if (t.status === 'in_transit') s += '<br>' + Math.round(t.progress * 100) + '% of the way · ETA ' + fmt.time(t.eta) + (t.overdue ? ' <b style="color:#C23B3B">(late)</b>' : '');
      else s += '<br>Loading at the mine';
      return s;
    }
    function focus(t) { map.setView([t.lat, t.lng], 11); if (markers[t.vehicle_id]) markers[t.vehicle_id].openPopup(); }
    draw();
    setTimeout(function () { map.invalidateSize(); }, 50);

    var timer = setInterval(async function () {
      try { data = await API.get('/tracking'); draw(); } catch (e) { /* keep last positions */ }
    }, 30000);
    ctx.onLeave(function () { clearInterval(timer); map.remove(); });
  }
};
