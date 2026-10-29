window.Views = window.Views || {};
Views.dispatch = {
  title: 'Dispatch board',
  navLabel: function (u) { return u.role === 'driver' ? 'My loads' : 'Dispatch board'; },
  roles: ['coordinator', 'client', 'supplier', 'driver'],
  lead: function (u) {
    if (u.role === 'driver') return 'Your loads for the day. Update each one as you load, leave the mine and arrive.';
    if (u.role === 'supplier') return 'Loads given to your company. Allocate a truck and driver to each planned load.';
    if (u.role === 'client') return 'Loads for your sites. This view is read-only.';
    return 'Plan loads, allocate trucks and follow each one from mine to delivery.';
  },
  render: async function (ctx) {
    var h = UI.h, fmt = UI.fmt, u = ctx.user;
    var date = Views.dispatch._date || UI.today();
    var search = Views.dispatch._q || '';

    var dateInput = h('input', { type: 'date', value: date, 'aria-label': 'Date', onchange: function () { Views.dispatch._date = dateInput.value || UI.today(); ctx.refresh(); } });
    var searchInput = h('input', { type: 'search', placeholder: 'Load, truck or driver', value: search, 'aria-label': 'Search loads',
      oninput: function () { Views.dispatch._q = searchInput.value; draw(); } });
    var actions = [h('div', { class: 'toolbar' }, dateInput, searchInput)];
    if (u.role === 'coordinator') actions.push(h('button', { class: 'btn accent', type: 'button', onclick: newLoad }, '+ New load'));
    ctx.setActions.apply(null, actions);

    var data = await API.get('/loads' + (date === UI.today() ? '' : '?date=' + date));
    var loads = data.loads;

    function draw() {
      var q = (Views.dispatch._q || '').toLowerCase();
      var shown = loads.filter(function (l) { return !q || [l.load_no, l.registration, l.driver_name, l.origin_name, l.dest_name].join(' ').toLowerCase().indexOf(q) >= 0; });
      var lanes = [['planned', 'Planned'], ['loading', 'Loading at mine'], ['in_transit', 'On the road'], ['delivered', 'Delivered']];
      var cancelled = shown.filter(function (l) { return l.status === 'cancelled'; });
      ctx.view.replaceChildren(h('div', null,
        h('div', { class: 'board' }, lanes.map(function (lane) {
          var list = shown.filter(function (l) { return l.status === lane[0]; });
          return h('section', { class: 'lane', 'data-status': lane[0], 'aria-label': lane[1] },
            h('h2', null, lane[1], h('span', { class: 'n' }, list.length)),
            h('div', { class: 'cards' }, list.length ? list.map(card) : h('p', { class: 'muted small', style: 'margin:.25rem' }, 'None')));
        })),
        cancelled.length ? h('p', { class: 'muted small' }, cancelled.length + ' cancelled: ' + cancelled.map(function (l) { return l.load_no + (l.notes ? ' (' + l.notes + ')' : ''); }).join(', ')) : null
      ));
    }

    function card(l) {
      var late = l.position && l.position.overdue;
      var meta = [];
      if (l.status === 'planned') meta.push(fmt.tonnes(l.planned_tonnes) + ' · ' + l.product);
      if (l.status === 'loading') meta.push('Loading since ' + fmt.time(l.loaded_at));
      if (l.status === 'in_transit') meta.push('Left ' + fmt.time(l.departed_at) + ' · ' + fmt.tonnes(l.net_out) + ' · ETA ' + fmt.time(l.position.eta));
      if (l.status === 'delivered') meta.push('Arrived ' + fmt.time(l.delivered_at) + ' · ' + fmt.tonnes(l.net_in));
      var buttons = cardActions(l);
      return h('article', { class: 'card' + (late ? ' late' : ''), 'data-status': l.status },
        h('div', { class: 'top' }, h('span', { class: 'no' }, l.load_no), late ? UI.badge('late', 'Late') : UI.badge(l.status)),
        h('div', { class: 'route' }, l.origin_name.replace(' Colliery', ''), ' → ', l.dest_name),
        h('div', { class: 'meta' }, l.registration ? l.registration + ' · ' + l.driver_name : h('em', null, 'No truck allocated'), h('br'), l.haulier_name),
        h('div', { class: 'meta' }, meta.join(' ')),
        l.status === 'in_transit' ? h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': Math.round(l.position.progress * 100), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Trip progress' },
          h('i', { style: 'width:' + Math.round(l.position.progress * 100) + '%' })) : null,
        buttons.length ? h('div', { class: 'row' }, buttons) : null);
    }

    function cardActions(l) {
      var b = [], mine = u.role === 'supplier' && u.haulier_id === l.haulier_id;
      var btn = function (label, fn, cls) { return h('button', { class: 'btn small ' + (cls || ''), type: 'button', onclick: fn }, label); };
      if (u.role === 'coordinator' || mine) {
        if (l.status === 'planned' || l.status === 'loading') b.push(btn(l.vehicle_id ? 'Change truck' : 'Allocate truck', function () { allocate(l); }, l.vehicle_id ? '' : 'accent'));
      }
      if (u.role === 'coordinator' || u.role === 'driver') {
        if (l.status === 'planned') b.push(btn('Start loading', function () { move(l, 'loading'); }));
        if (l.status === 'loading') b.push(btn('Weigh out and depart', function () { weigh(l, 'in_transit'); }, 'primary'));
        if (l.status === 'in_transit') b.push(btn(u.role === 'driver' ? 'Arrived: weigh in' : 'Weigh in and deliver', function () { weigh(l, 'delivered'); }, 'primary'));
      }
      if (u.role === 'coordinator') {
        if (l.status === 'planned' || l.status === 'loading') b.push(btn('Cancel', function () { move(l, 'cancelled'); }, 'danger'));
      }
      return b;
    }

    async function move(l, status) {
      try { await API.patch('/loads/' + l.id, { status: status }); UI.toast(l.load_no + ': ' + UI.STATUS[status].toLowerCase() + '.'); ctx.refresh(); }
      catch (e) { UI.toast(e.message, 'error'); }
    }

    async function weigh(l, status) {
      var out = status === 'in_transit';
      var tare = 16.5;
      var r = await UI.formDialog({
        title: (out ? 'Weigh out at ' + l.origin_name : 'Weigh in at ' + l.dest_name) + ' · ' + l.load_no,
        intro: out ? 'Capture the weighbridge reading as the truck leaves the mine.' : 'Capture the weighbridge reading on arrival. A weigh-in more than 1.5% below the weigh-out of ' + fmt.tonnes(l.net_out, 2) + ' raises an issue automatically.',
        submitLabel: out ? 'Depart' : 'Mark delivered',
        fields: [
          { name: 'gross_t', label: 'Gross mass (t)', type: 'number', step: '0.01', min: 1, required: true, value: (tare + (out ? l.planned_tonnes - 0.4 : (l.net_out || l.planned_tonnes))).toFixed(2) },
          { name: 'tare_t', label: 'Tare mass (t)', type: 'number', step: '0.01', min: 1, required: true, value: tare.toFixed(2), help: 'Empty truck mass' }
        ],
        onSubmit: function (v) { return API.patch('/loads/' + l.id, { status: status, gross_t: Number(v.gross_t), tare_t: Number(v.tare_t) }); }
      });
      if (!r) return;
      if (r.autoIssue) UI.toast('Delivered short. Issue ' + r.autoIssue + ' was raised for the coordinator.', 'error');
      else UI.toast(l.load_no + (out ? ' has departed.' : ' delivered.'));
      ctx.refresh();
    }

    async function allocate(l) {
      var vehicles = ctx.lookups.vehicles.filter(function (v) { return v.haulier_id === l.haulier_id; });
      var drivers = ctx.lookups.drivers.filter(function (d) { return d.haulier_id === l.haulier_id; });
      var r = await UI.formDialog({
        title: 'Allocate truck to ' + l.load_no, intro: l.origin_name + ' → ' + l.dest_name + ' · ' + l.haulier_name,
        submitLabel: 'Allocate',
        fields: [
          { name: 'vehicle_id', label: 'Truck', type: 'select', required: true, value: l.vehicle_id, options: UI.options(vehicles, 'id', function (v) { return v.registration + ' (' + v.capacity_t + ' t)'; }, 'Choose a truck') },
          { name: 'driver_id', label: 'Driver', type: 'select', required: true, value: l.driver_id, options: UI.options(drivers, 'id', 'full_name', 'Choose a driver') }
        ],
        onSubmit: function (v) { return API.patch('/loads/' + l.id, { vehicle_id: Number(v.vehicle_id), driver_id: Number(v.driver_id) }); }
      });
      if (r) { UI.toast(l.load_no + ' allocated to ' + r.load.registration + '.'); ctx.refresh(); }
    }

    async function newLoad() {
      var L = ctx.lookups;
      var mines = L.sites.filter(function (s) { return s.site_type === 'mine'; });
      var dests = L.sites.filter(function (s) { return s.site_type !== 'mine'; });
      var r = await UI.formDialog({
        title: 'New load', submitLabel: 'Create load',
        fields: [
          { name: 'origin_site_id', label: 'Load at', type: 'select', required: true, options: UI.options(mines, 'id', 'name') },
          { name: 'destination_site_id', label: 'Deliver to', type: 'select', required: true, options: UI.options(dests, 'id', function (s) { return s.name + ' (' + UI.SITE_TYPE[s.site_type].toLowerCase() + ')'; }) },
          { name: 'haulier_id', label: 'Haulier', type: 'select', required: true, options: UI.options(L.hauliers, 'id', 'name') },
          { name: 'planned_date', label: 'Date', type: 'date', required: true, value: date },
          { name: 'vehicle_id', label: 'Truck', type: 'select', options: [], help: 'Optional: the haulier can allocate later' },
          { name: 'driver_id', label: 'Driver', type: 'select', options: [] },
          { name: 'product', label: 'Product', type: 'select', options: ['RoM coal', 'Washed coal', 'Duff coal'].map(function (p) { return { value: p, label: p }; }) },
          { name: 'planned_tonnes', label: 'Planned tonnes', type: 'number', step: '0.1', min: 1, max: 40, required: true, value: 33 }
        ],
        onChange: function (name, inputs) {
          if (name !== 'haulier_id') return;
          var hid = Number(inputs.haulier_id.value);
          var fill = function (sel, list, label) {
            sel.replaceChildren.apply(sel, UI.options(list.filter(function (x) { return x.haulier_id === hid; }), 'id', label, 'Not yet')
              .map(function (o) { return h('option', { value: o.value }, o.label); }));
          };
          fill(inputs.vehicle_id, L.vehicles, function (v) { return v.registration + ' (' + v.capacity_t + ' t)'; });
          fill(inputs.driver_id, L.drivers, 'full_name');
        },
        onSubmit: function (v) {
          v.vehicle_id = v.vehicle_id ? Number(v.vehicle_id) : null; v.driver_id = v.driver_id ? Number(v.driver_id) : null;
          return API.post('/loads', v);
        }
      });
      if (r) { UI.toast(r.load.load_no + ' created.'); Views.dispatch._date = r.load.planned_date; ctx.refresh(); }
    }

    draw();
  }
};
