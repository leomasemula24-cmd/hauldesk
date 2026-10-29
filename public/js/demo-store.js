/*
 * Demo mode: the same API, answered inside the browser from fictitious data.
 * Used when HaulDesk is opened without its Node.js server (for example on GitHub Pages).
 * It follows the same access rules as server/api.js. Changes last until the page is reloaded.
 */
window.DemoStore = (function () {
  var raw = window.HaulSampleData.generate();   // same fictitious data as the MySQL sample, built in the browser
  var geo = window.HaulGeo;
  var VARIANCE_LIMIT = 0.015;
  var PASSWORD = 'demo1234';

  // ---------- dates ----------
  function p2(n) { return String(n).padStart(2, '0'); }
  function fmtDate(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function fmtDateTime(d) { return fmtDate(d) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()); }
  function midnight() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  var LOADED_AT = new Date();
  function resolve(v) {
    if (typeof v !== 'string') return v;
    var m = /^([dnD]):(-?\d+)$/.exec(v);
    if (!m) return v;
    var n = +m[2];
    if (m[1] === 'D') { var d = midnight(); d.setDate(d.getDate() + n); return fmtDate(d); }
    if (m[1] === 'd') return fmtDateTime(new Date(midnight().getTime() + n * 60000));
    return fmtDateTime(new Date(LOADED_AT.getTime() + n * 60000));
  }
  function resolveAll(rows) { return rows.map(function (r) { var o = {}; for (var k in r) o[k] = resolve(r[k]); return o; }); }
  function today() { return fmtDate(new Date()); }
  function now() { return fmtDateTime(new Date()); }
  function addDays(dateStr, n) { var d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n); return fmtDate(d); }
  function daysUntil(dateStr) { return Math.round((new Date(dateStr + 'T00:00:00') - midnight()) / 86400000); }
  function toDate(s) { return new Date(String(s).replace(' ', 'T')); }

  var db = {};
  ['sites', 'hauliers', 'drivers', 'vehicles', 'users', 'loads', 'tickets', 'stockpiles', 'documents', 'issues']
    .forEach(function (t) { db[t] = resolveAll(raw[t]); });
  var session = null;

  function byId(table, id) { return db[table].find(function (r) { return r.id === Number(id); }); }
  function fail(status, error) { var e = new Error(error); e.status = status; throw e; }
  function need(roles) { if (roles.indexOf(session.role) < 0) fail(403, 'Your role does not have access to this.'); }
  function round(n, d) { return +(+n).toFixed(d == null ? 2 : d); }

  // ---------- the same joined view of a load as the server returns ----------
  function ticket(loadId, dir) { return db.tickets.find(function (t) { return t.load_id === loadId && t.direction === dir; }); }
  function view(l) {
    var o = byId('sites', l.origin_site_id), d = byId('sites', l.destination_site_id);
    var v = l.vehicle_id ? byId('vehicles', l.vehicle_id) : null, dr = l.driver_id ? byId('drivers', l.driver_id) : null;
    var wo = ticket(l.id, 'out'), wi = ticket(l.id, 'in');
    var out = Object.assign({}, l, {
      origin_name: o.name, origin_code: o.code, origin_lat: o.lat, origin_lng: o.lng, origin_division: o.division,
      dest_name: d.name, dest_code: d.code, dest_type: d.site_type, dest_division: d.division, dest_lat: d.lat, dest_lng: d.lng,
      haulier_name: byId('hauliers', l.haulier_id).name,
      registration: v ? v.registration : null, tracker_provider: v ? v.tracker_provider : null,
      driver_name: dr ? dr.full_name : null,
      net_out: wo ? round(wo.gross_t - wo.tare_t) : null, net_in: wi ? round(wi.gross_t - wi.tare_t) : null,
      _out_at: wo ? wo.weighed_at : null, _in_at: wi ? wi.weighed_at : null
    });
    if (l.status === 'in_transit') {
      out.position = geo.estimatePosition({ lat: o.lat, lng: o.lng }, { lat: d.lat, lng: d.lng }, toDate(l.departed_at), new Date());
    }
    return out;
  }
  function inScope(lv) {
    switch (session.role) {
      case 'coordinator': return true;
      case 'client': return lv.origin_division === session.division || lv.dest_division === session.division;
      case 'supplier': return lv.haulier_id === session.haulier_id;
      case 'driver': return lv.driver_id === session.driver_id;
    }
    return false;
  }
  function scopedLoads() { return db.loads.map(view).filter(inScope); }
  function issueInScope(i) {
    if (session.role === 'coordinator' || i.reported_by === session.id) return true;
    var l = i.load_id ? byId('loads', i.load_id) : null;
    return !!(l && inScope(view(l)));
  }
  function nextNo(list, field, prefix) {
    var max = 0;
    list.forEach(function (r) { if (String(r[field]).indexOf(prefix) === 0) max = Math.max(max, +String(r[field]).slice(prefix.length) || 0); });
    return prefix + String(max + 1).padStart(4, '0');
  }

  // ---------- endpoints ----------
  var routes = {
    'GET /health': function () { return { ok: true, mode: 'demo' }; },

    'POST /login': function (q, b) {
      var u = db.users.find(function (x) { return x.username === String(b.username || '').trim(); });
      if (!u || b.password !== PASSWORD) fail(401, 'Username or password is incorrect.');
      session = u; return { user: u };
    },
    'POST /logout': function () { session = null; return { ok: true }; },
    'GET /me': function () { return { user: session }; },

    'GET /lookups': function () {
      var mine = function (r) { return session.role === 'coordinator' || ((session.role === 'supplier' || session.role === 'driver') && r.haulier_id === session.haulier_id); };
      return {
        sites: db.sites.slice().sort(function (a, b) { return a.site_type.localeCompare(b.site_type) || a.name.localeCompare(b.name); }),
        hauliers: db.hauliers.map(function (h) { return { id: h.id, name: h.name }; }),
        vehicles: db.vehicles.filter(mine).map(function (v) { return { id: v.id, registration: v.registration, haulier_id: v.haulier_id, capacity_t: v.capacity_t }; })
          .sort(function (a, b) { return a.registration.localeCompare(b.registration); }),
        drivers: db.drivers.filter(mine).map(function (d) { return { id: d.id, full_name: d.full_name, haulier_id: d.haulier_id }; })
          .sort(function (a, b) { return a.full_name.localeCompare(b.full_name); })
      };
    },

    'GET /dashboard': function () {
      var t = today(), loads = scopedLoads();
      var k = { loads_today: 0, delivered_today: 0, in_transit: 0, loading: 0, tonnes_today: 0 };
      var since = addDays(t, -13), tonnage = {};
      loads.forEach(function (l) {
        if (l.planned_date === t && l.status !== 'cancelled') k.loads_today++;
        if (l.status === 'delivered' && String(l.delivered_at).slice(0, 10) === t) k.delivered_today++;
        if (l.status === 'in_transit') k.in_transit++;
        if (l.status === 'loading') k.loading++;
        if (l._in_at) {
          var day = String(l._in_at).slice(0, 10);
          if (day === t) k.tonnes_today += l.net_in;
          if (day >= since) { var key = day + '|' + l.dest_type; tonnage[key] = (tonnage[key] || 0) + l.net_in; }
        }
      });
      k.tonnes_today = round(k.tonnes_today, 1);
      var late = loads.filter(function (l) { return l.status === 'in_transit' && l.position.overdue; });
      var issues = db.issues.filter(function (i) { return i.status !== 'resolved' && issueInScope(i); }).sort(issueOrder);
      var compliance = null;
      if (session.role === 'coordinator' || session.role === 'supplier') {
        var own = function (r) { return session.role === 'coordinator' || r.haulier_id === session.haulier_id; };
        compliance = db.drivers.filter(own).filter(function (d) { return daysUntil(d.licence_expiry) <= 30 || daysUntil(d.prdp_expiry) <= 30; }).length +
          db.vehicles.filter(own).filter(function (v) { return daysUntil(v.licence_disc_expiry) <= 30; }).length;
      }
      k.open_issues = issues.length; k.late = late.length; k.compliance = compliance;
      return {
        kpis: k, late: late, issues: issues.slice(0, 6),
        tonnage: Object.keys(tonnage).sort().map(function (key) { var p = key.split('|'); return { day: p[0], site_type: p[1], tonnes: round(tonnage[key], 1) }; })
      };
    },

    'GET /loads': function (q) {
      var t = today(), s = (q.q || '').toLowerCase();
      return { loads: scopedLoads().filter(function (l) {
        if (q.date ? l.planned_date !== q.date : !(l.planned_date === t || l.status === 'loading' || l.status === 'in_transit')) return false;
        if (q.status && l.status !== q.status) return false;
        if (s && [l.load_no, l.registration, l.driver_name].join(' ').toLowerCase().indexOf(s) < 0) return false;
        return true;
      }).sort(function (a, b) { return a.load_no.localeCompare(b.load_no); }) };
    },

    'POST /loads': function (q, b) {
      need(['coordinator']);
      var o = byId('sites', b.origin_site_id), d = byId('sites', b.destination_site_id);
      if (!o || o.site_type !== 'mine') fail(400, 'Choose a mine to load from.');
      if (!d || d.site_type === 'mine') fail(400, 'Choose a power station, siding or harbour to deliver to.');
      var tonnes = Number(b.planned_tonnes);
      if (!(tonnes > 0 && tonnes <= 40)) fail(400, 'Planned tonnes must be between 1 and 40.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.planned_date))) fail(400, 'Choose a planned date.');
      checkAllocation(b.haulier_id, b.vehicle_id, b.driver_id);
      var max = Math.max.apply(null, db.loads.map(function (l) { return +l.load_no.slice(3); }));
      var load = { id: db.loads.length + 1, load_no: 'LD-' + (max + 1), origin_site_id: o.id, destination_site_id: d.id,
        haulier_id: Number(b.haulier_id), vehicle_id: b.vehicle_id ? Number(b.vehicle_id) : null, driver_id: b.driver_id ? Number(b.driver_id) : null,
        product: b.product || 'RoM coal', planned_tonnes: tonnes, planned_date: b.planned_date, status: 'planned',
        loaded_at: null, departed_at: null, delivered_at: null, notes: b.notes || null };
      db.loads.push(load);
      return { load: view(load) };
    },

    'PATCH /loads/:id': function (q, b, id) {
      var load = byId('loads', id);
      if (!load || !inScope(view(load))) fail(404, 'Load not found.');
      var lv = view(load), autoIssue = null;
      if (b.vehicle_id !== undefined || b.driver_id !== undefined) {
        if (!(session.role === 'coordinator' || (session.role === 'supplier' && session.haulier_id === load.haulier_id))) fail(403, 'Only the coordinator or the haulier can allocate trucks.');
        if (['planned', 'loading'].indexOf(load.status) < 0) fail(400, 'Trucks can only be changed before the load departs.');
        var vId = b.vehicle_id !== undefined ? (Number(b.vehicle_id) || null) : load.vehicle_id;
        var dId = b.driver_id !== undefined ? (Number(b.driver_id) || null) : load.driver_id;
        checkAllocation(load.haulier_id, vId, dId);
        load.vehicle_id = vId; load.driver_id = dId;
      }
      if (b.notes !== undefined && session.role === 'coordinator') load.notes = String(b.notes).slice(0, 255) || null;
      if (b.status && b.status !== load.status) {
        var flow = { planned: ['loading', 'cancelled'], loading: ['in_transit', 'planned', 'cancelled'], in_transit: ['delivered'], delivered: [], cancelled: ['planned'] };
        var driverFlow = { planned: ['loading'], loading: ['in_transit'], in_transit: ['delivered'] };
        var allowed = session.role === 'coordinator' ? flow[load.status] : session.role === 'driver' ? (driverFlow[load.status] || []) : [];
        if (allowed.indexOf(b.status) < 0) fail(403, 'A load cannot move from ' + load.status + ' to ' + b.status + ' by your role.');
        if ((b.status === 'loading' || b.status === 'in_transit') && (!load.vehicle_id || !load.driver_id)) fail(400, 'Allocate a truck and driver first.');
        if (b.status === 'in_transit' || b.status === 'delivered') {
          var gross = Number(b.gross_t), tare = Number(b.tare_t);
          if (!(gross > tare && tare > 0 && gross - tare <= 45)) fail(400, 'Enter valid weighbridge gross and tare masses.');
          var dir = b.status === 'in_transit' ? 'out' : 'in';
          db.tickets.push({ id: db.tickets.length + 1, ticket_no: nextNo(db.tickets, 'ticket_no', dir === 'out' ? 'WO-' : 'WI-'), load_id: load.id,
            site_id: dir === 'out' ? load.origin_site_id : load.destination_site_id, direction: dir, gross_t: gross, tare_t: tare, weighed_at: now() });
          if (dir === 'in' && lv.net_out) {
            var variance = (lv.net_out - (gross - tare)) / lv.net_out;
            if (variance > VARIANCE_LIMIT) {
              autoIssue = nextNo(db.issues, 'ref', 'IS-');
              db.issues.push({ id: db.issues.length + 1, ref: autoIssue, title: 'Net mass variance on ' + load.load_no, category: 'Weighbridge',
                priority: 'high', status: 'open', load_id: load.id, vehicle_id: load.vehicle_id, reported_by: session.id,
                description: 'Weigh-in is ' + (variance * 100).toFixed(1) + '% below the weigh-out of ' + lv.net_out + ' t. Raised automatically.',
                resolution: null, created_at: now(), resolved_at: null });
            }
          }
        }
        if (b.status === 'loading') load.loaded_at = now();
        if (b.status === 'in_transit') load.departed_at = now();
        if (b.status === 'delivered') load.delivered_at = now();
        if (b.status === 'planned') { load.loaded_at = null; load.departed_at = null; }
        load.status = b.status;
      }
      return { load: view(load), autoIssue: autoIssue };
    },

    'GET /tracking': function () {
      var trucks = [], busy = {};
      scopedLoads().filter(function (l) { return l.status === 'loading' || l.status === 'in_transit'; }).forEach(function (l) {
        busy[l.vehicle_id] = true;
        var at = l.status === 'in_transit' ? l.position : { lat: l.origin_lat, lng: l.origin_lng };
        trucks.push({ vehicle_id: l.vehicle_id, registration: l.registration, tracker_provider: l.tracker_provider, haulier_name: l.haulier_name,
          driver_name: l.driver_name, status: l.status, load_no: l.load_no, origin_name: l.origin_name, dest_name: l.dest_name,
          lat: at.lat, lng: at.lng, progress: l.position ? l.position.progress : 0, eta: l.position ? l.position.eta : null,
          overdue: !!(l.position && l.position.overdue) });
      });
      if (session.role === 'coordinator' || session.role === 'supplier') {
        db.vehicles.filter(function (v) { return !busy[v.id] && (session.role === 'coordinator' || v.haulier_id === session.haulier_id); })
          .forEach(function (v) {
            var home = byId('sites', v.home_site_id), j = ((v.id * 37) % 11 - 5) / 900;
            trucks.push({ vehicle_id: v.id, registration: v.registration, tracker_provider: v.tracker_provider,
              haulier_name: byId('hauliers', v.haulier_id).name, status: 'idle', lat: home.lat + j, lng: home.lng - j, origin_name: home.name });
          });
      }
      return { sites: db.sites, trucks: trucks, updated_at: new Date().toISOString() };
    },

    'GET /tickets': function (q) {
      need(['coordinator', 'client', 'supplier']);
      var from = q.from || addDays(today(), -6), to = q.to || today();
      var list = scopedLoads().filter(function (l) { var d = l._out_at && String(l._out_at).slice(0, 10); return d && d >= from && d <= to; })
        .map(function (l) { return Object.assign({}, l, { variance_pct: l.net_in != null ? round((l.net_out - l.net_in) / l.net_out * 100) : null }); })
        .filter(function (l) { return !q.flagged || (l.variance_pct != null && l.variance_pct > VARIANCE_LIMIT * 100); })
        .sort(function (a, b) { return String(b._out_at).localeCompare(String(a._out_at)); });
      return { tickets: list, limit_pct: VARIANCE_LIMIT * 100 };
    },

    'GET /stockpiles': function () {
      need(['coordinator', 'client']);
      var rows = db.stockpiles.map(function (r) {
        var s = byId('sites', r.site_id);
        return { site_id: s.id, name: s.name, code: s.code, site_type: s.site_type, division: s.division, product: r.product, reading_date: r.reading_date, tonnes: r.tonnes };
      }).filter(function (r) { return session.role === 'coordinator' || r.division === session.division; });
      rows.sort(function (a, b) { return a.site_type.localeCompare(b.site_type) || a.name.localeCompare(b.name) || a.reading_date.localeCompare(b.reading_date); });
      return { readings: rows };
    },

    'GET /fleet': function () {
      need(['coordinator', 'supplier']);
      var own = function (r) { return session.role === 'coordinator' || r.haulier_id === session.haulier_id; };
      var drivers = db.drivers.filter(own).map(function (d) {
        return Object.assign({}, d, { haulier_name: byId('hauliers', d.haulier_id).name, licence_days: daysUntil(d.licence_expiry), prdp_days: daysUntil(d.prdp_expiry) });
      }).sort(function (a, b) { return Math.min(a.licence_days, a.prdp_days) - Math.min(b.licence_days, b.prdp_days) || a.full_name.localeCompare(b.full_name); });
      var vehicles = db.vehicles.filter(own).map(function (v) {
        return Object.assign({}, v, { haulier_name: byId('hauliers', v.haulier_id).name, home_site: byId('sites', v.home_site_id).name, disc_days: daysUntil(v.licence_disc_expiry) });
      }).sort(function (a, b) { return a.disc_days - b.disc_days || a.registration.localeCompare(b.registration); });
      return { drivers: drivers, vehicles: vehicles };
    },

    'GET /documents': function (q) {
      need(['coordinator', 'client', 'supplier']);
      var s = (q.q || '').toLowerCase();
      var docs = db.documents.map(function (d) {
        var site = d.site_id ? byId('sites', d.site_id) : null, l = d.load_id ? byId('loads', d.load_id) : null, lv = l ? view(l) : null;
        return Object.assign({}, d, { site_name: site ? site.name : null, haulier_name: d.haulier_id ? byId('hauliers', d.haulier_id).name : null,
          load_no: l ? l.load_no : null, retain_days: daysUntil(d.retain_until),
          _divs: [site && site.division, lv && lv.origin_division, lv && lv.dest_division] });
      }).filter(function (d) {
        if (session.role === 'client' && d._divs.indexOf(session.division) < 0) return false;
        if (session.role === 'supplier' && d.haulier_id !== session.haulier_id) return false;
        if (s && [d.title, d.doc_no, d.storage_ref].join(' ').toLowerCase().indexOf(s) < 0) return false;
        if (q.category && d.category !== q.category) return false;
        if (q.due && d.retain_days > 30) return false;
        return true;
      }).sort(function (a, b) { return b.created_on.localeCompare(a.created_on); });
      return { documents: docs };
    },

    'GET /issues': function (q) {
      return { issues: db.issues.filter(issueInScope).filter(function (i) { return !q.status || i.status === q.status; })
        .map(function (i) {
          var l = i.load_id ? byId('loads', i.load_id) : null, v = i.vehicle_id ? byId('vehicles', i.vehicle_id) : null;
          return Object.assign({}, i, { load_no: l ? l.load_no : null, registration: v ? v.registration : null, reported_by_name: byId('users', i.reported_by).full_name });
        }).sort(function (a, b) { return (a.status === 'resolved') - (b.status === 'resolved') || issueOrder(a, b); }) };
    },

    'POST /issues': function (q, b) {
      var title = String(b.title || '').trim();
      if (title.length < 5) fail(400, 'Describe the issue in a short title.');
      if (['Breakdown', 'Delay', 'Weighbridge', 'Tracking offline', 'Site access', 'Safety', 'Other'].indexOf(b.category) < 0) fail(400, 'Choose a category.');
      var loadId = null, vehicleId = null;
      if (b.load_no) {
        var l = db.loads.find(function (x) { return x.load_no === String(b.load_no).trim(); });
        if (!l || !inScope(view(l))) fail(400, 'That load number was not found.');
        loadId = l.id; vehicleId = l.vehicle_id;
      }
      var ref = nextNo(db.issues, 'ref', 'IS-');
      db.issues.push({ id: db.issues.length + 1, ref: ref, title: title.slice(0, 140), category: b.category,
        priority: ['low', 'medium', 'high'].indexOf(b.priority) >= 0 ? b.priority : 'medium', status: 'open',
        load_id: loadId, vehicle_id: vehicleId, reported_by: session.id, description: String(b.description || '').slice(0, 2000) || null,
        resolution: null, created_at: now(), resolved_at: null });
      return { ref: ref };
    },

    'PATCH /issues/:id': function (q, b, id) {
      need(['coordinator']);
      if (['open', 'in_progress', 'resolved'].indexOf(b.status) < 0) fail(400, 'Choose a valid status.');
      if (b.status === 'resolved' && !String(b.resolution || '').trim()) fail(400, 'Say how the issue was resolved.');
      var i = byId('issues', id);
      if (!i) fail(404, 'Issue not found.');
      i.status = b.status;
      if (String(b.resolution || '').trim()) i.resolution = String(b.resolution).trim();
      i.resolved_at = b.status === 'resolved' ? now() : null;
      return { ok: true };
    },

    'GET /reports/routes': function (q) {
      need(['coordinator', 'client']);
      var from = q.from || addDays(today(), -13), to = q.to || today(), routes = {};
      scopedLoads().filter(function (l) { var d = l.status === 'delivered' && String(l.delivered_at).slice(0, 10); return d && d >= from && d <= to; })
        .forEach(function (l) {
          var key = l.origin_code + '>' + l.dest_code;
          if (!routes[key]) routes[key] = { origin: l.origin_name, destination: l.dest_name, dest_type: l.dest_type, loads: 0, tonnes_out: 0, tonnes_in: 0,
            trip_total: 0, on_time: 0, expected_min: geo.tripMinutes({ lat: l.origin_lat, lng: l.origin_lng }, { lat: l.dest_lat, lng: l.dest_lng }) };
          var r = routes[key], trip = (toDate(l.delivered_at) - toDate(l.departed_at)) / 60000;
          r.loads++; r.tonnes_out += l.net_out || 0; r.tonnes_in += l.net_in || 0; r.trip_total += trip;
          if (trip <= r.expected_min * 1.15) r.on_time++;
        });
      return { routes: Object.keys(routes).map(function (k) {
        var r = routes[k];
        return { origin: r.origin, destination: r.destination, dest_type: r.dest_type, loads: r.loads,
          tonnes_out: round(r.tonnes_out, 1), tonnes_in: round(r.tonnes_in, 1),
          variance_pct: r.tonnes_out ? round((r.tonnes_out - r.tonnes_in) / r.tonnes_out * 100) : 0,
          avg_trip_min: Math.round(r.trip_total / r.loads), expected_min: r.expected_min, on_time_pct: Math.round(r.on_time / r.loads * 100) };
      }).sort(function (a, b) { return b.tonnes_in - a.tonnes_in; }) };
    }
  };

  function issueOrder(a, b) {
    var p = { high: 0, medium: 1, low: 2 };
    return p[a.priority] - p[b.priority] || String(b.created_at).localeCompare(String(a.created_at));
  }
  function checkAllocation(hId, vId, dId) {
    if (!byId('hauliers', hId)) fail(400, 'Choose a haulier.');
    if (vId) { var v = byId('vehicles', vId); if (!v || v.haulier_id !== Number(hId)) fail(400, 'That truck does not belong to the selected haulier.'); }
    if (dId) { var d = byId('drivers', dId); if (!d || d.haulier_id !== Number(hId)) fail(400, 'That driver does not work for the selected haulier.'); }
  }

  function handle(method, path, body) {
    var parts = path.split('?'), q = {};
    new URLSearchParams(parts[1] || '').forEach(function (v, k) { q[k] = v; });
    var segs = parts[0].split('/').filter(Boolean), id = null;
    if (segs.length === 2 && /^\d+$/.test(segs[1])) { id = segs[1]; segs[1] = ':id'; }
    var key = method + ' /' + segs.join('/');
    var fn = routes[key];
    return new Promise(function (resolveP, rejectP) {
      setTimeout(function () {                // feel like a network call
        try {
          if (!fn) fail(404, 'Not found.');
          var open = ['GET /health', 'POST /login', 'POST /logout'];
          if (open.indexOf(key) < 0 && !session) fail(401, 'Please sign in.');
          resolveP(JSON.parse(JSON.stringify(fn(q, body || {}, id))));
        } catch (e) { rejectP(e); }
      }, 120);
    });
  }

  return { handle: handle };
})();
