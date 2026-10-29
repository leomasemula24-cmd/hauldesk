window.Views = window.Views || {};
Views.stockpiles = {
  title: 'Stockpiles',
  roles: ['coordinator', 'client'],
  lead: function () { return 'Daily stock at each site over the last two weeks, so shortages show up before they become a problem.'; },
  render: async function (ctx) {
    var h = UI.h, fmt = UI.fmt;
    var d = await API.get('/stockpiles');
    var bySite = {};
    d.readings.forEach(function (r) { (bySite[r.site_id] = bySite[r.site_id] || { info: r, rows: [] }).rows.push(r); });
    var groups = {};
    Object.values(bySite).forEach(function (s) { (groups[s.info.site_type] = groups[s.info.site_type] || []).push(s); });
    var charts = [];
    var order = ['mine', 'power_station', 'rail_siding', 'harbour'];
    ctx.view.replaceChildren.apply(ctx.view, order.filter(function (t) { return groups[t]; }).map(function (type) {
      return h('section', null,
        h('h2', { style: 'font-size:1.05rem;margin:.25rem 0 .6rem' }, { mine: 'Mines', power_station: 'Power stations', rail_siding: 'Rail sidings', harbour: 'Harbour' }[type]),
        h('div', { class: 'stock-cards' }, groups[type].map(function (s) {
          var rows = s.rows, last = rows[rows.length - 1], weekAgo = rows[Math.max(0, rows.length - 8)];
          var change = (last.tonnes - weekAgo.tonnes) / weekAgo.tonnes * 100;
          var canvas = h('canvas', { class: 'spark', height: 46, 'aria-label': 'Stock trend for ' + s.info.name, role: 'img' });
          charts.push([canvas, rows]);
          return h('div', { class: 'panel stock' },
            h('span', { class: 'strong' }, s.info.name),
            h('span', { class: 'muted small' }, last.product + ' · ' + s.info.division),
            h('b', null, fmt.tonnes(last.tonnes, 0)),
            h('span', { class: 'small trend ' + (change < -5 ? 'down' : change > 5 ? 'up' : '') },
              (change >= 0 ? '▲ ' : '▼ ') + Math.abs(change).toFixed(1) + '% in 7 days' + (change < -10 ? ' · running down' : '')),
            h('div', { style: 'height:46px' }, canvas));
        })));
    }));
    if (!window.Chart) return;
    var made = charts.map(function (c) {
      var rows = c[1], falling = rows[rows.length - 1].tonnes < rows[Math.max(0, rows.length - 8)].tonnes * 0.9;
      return new Chart(c[0], {
        type: 'line',
        data: { labels: rows.map(function (r) { return fmt.shortDate(r.reading_date); }),
          datasets: [{ data: rows.map(function (r) { return r.tonnes; }), borderColor: falling ? '#C23B3B' : '#14213D', borderWidth: 2, pointRadius: 0, fill: false, tension: .3 }] },
        options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false },
          tooltip: { callbacks: { label: function (x) { return fmt.tonnes(x.parsed.y, 0); } } } }, scales: { x: { display: false }, y: { display: false } } }
      });
    });
    ctx.onLeave(function () { made.forEach(function (c) { c.destroy(); }); });
  }
};
