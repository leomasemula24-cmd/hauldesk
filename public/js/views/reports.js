window.Views = window.Views || {};
Views.reports = {
  title: 'Route report',
  roles: ['coordinator', 'client'],
  lead: function () { return 'Tonnes moved, losses and on-time performance for each route. On time means within 15% of the expected trip time.'; },
  render: async function (ctx) {
    var h = UI.h, fmt = UI.fmt, V = Views.reports;
    V._from = V._from || UI.addDays(UI.today(), -13); V._to = V._to || UI.today();
    var from = h('input', { type: 'date', value: V._from, 'aria-label': 'From date', onchange: function () { V._from = from.value; ctx.refresh(); } });
    var to = h('input', { type: 'date', value: V._to, 'aria-label': 'To date', onchange: function () { V._to = to.value; ctx.refresh(); } });
    var d = await API.get('/reports/routes?from=' + V._from + '&to=' + V._to);
    var cols = [
      { label: 'From', value: function (r) { return r.origin; } },
      { label: 'To', value: function (r) { return r.destination; } },
      { label: 'Loads', num: true, value: function (r) { return fmt.num(r.loads); }, csv: function (r) { return r.loads; } },
      { label: 'Tonnes delivered', num: true, value: function (r) { return fmt.num(r.tonnes_in, 1); }, csv: function (r) { return r.tonnes_in; } },
      { label: 'Loss', num: true, value: function (r) { return r.variance_pct > 1 ? UI.badge('high', r.variance_pct.toFixed(2) + '%') : r.variance_pct.toFixed(2) + '%'; }, csv: function (r) { return r.variance_pct; } },
      { label: 'Average trip', num: true, value: function (r) { return fmt.minutes(r.avg_trip_min); }, csv: function (r) { return r.avg_trip_min; } },
      { label: 'Expected', num: true, value: function (r) { return fmt.minutes(r.expected_min); }, csv: function (r) { return r.expected_min; } },
      { label: 'On time', num: true, value: function (r) { return r.on_time_pct < 70 ? UI.badge('soon', r.on_time_pct + '%') : r.on_time_pct + '%'; }, csv: function (r) { return r.on_time_pct; } }
    ];
    ctx.setActions(h('div', { class: 'toolbar' }, from, h('span', { class: 'muted' }, 'to'), to,
      h('button', { class: 'btn', type: 'button', onclick: function () { UI.downloadCsv('route-report-' + V._from + '-to-' + V._to + '.csv', cols, d.routes); } }, 'Download CSV')));
    var tot = d.routes.reduce(function (s, r) { s.loads += r.loads; s.out += r.tonnes_out; s.in += r.tonnes_in; s.ot += r.on_time_pct * r.loads; return s; }, { loads: 0, out: 0, in: 0, ot: 0 });
    ctx.view.replaceChildren(
      h('div', { class: 'kpis' },
        h('div', { class: 'kpi' }, h('b', null, fmt.num(tot.loads)), h('span', null, 'Loads delivered')),
        h('div', { class: 'kpi' }, h('b', null, fmt.num(tot.in, 0)), h('span', null, 'Tonnes delivered')),
        h('div', { class: 'kpi' }, h('b', null, tot.out ? ((tot.out - tot.in) / tot.out * 100).toFixed(2) + '%' : '–'), h('span', null, 'Loss in transit')),
        h('div', { class: 'kpi' }, h('b', null, tot.loads ? Math.round(tot.ot / tot.loads) + '%' : '–'), h('span', null, 'On time'))),
      UI.panel('Performance by route', d.routes.length + ' routes', UI.table(cols, d.routes, 'No deliveries in this period.')));
  }
};
