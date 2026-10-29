window.Views = window.Views || {};
Views.dashboard = {
  title: 'Today',
  roles: ['coordinator', 'client', 'supplier'],
  lead: function (u) {
    if (u.role === 'client') return 'Deliveries for ' + u.division + ' at a glance.';
    if (u.role === 'supplier') return 'Your fleet’s loads and alerts for today.';
    return 'Where every load stands right now, and what needs your attention.';
  },
  render: async function (ctx) {
    var h = UI.h, fmt = UI.fmt;
    var d = await API.get('/dashboard');
    var k = d.kpis;
    var tiles = [
      ['Loads planned today', fmt.num(k.loads_today)],
      ['Being loaded', fmt.num(k.loading)],
      ['On the road', fmt.num(k.in_transit)],
      ['Delivered today', fmt.num(k.delivered_today)],
      ['Tonnes delivered today', fmt.num(k.tonnes_today, 1)],
      ['Open issues', fmt.num(k.open_issues), k.open_issues > 0]
    ];
    if (k.compliance != null) tiles.push(['Licences and permits due', fmt.num(k.compliance), k.compliance > 0]);

    // what needs attention, most urgent first
    var items = [];
    d.late.forEach(function (l) {
      items.push(h('li', null, UI.badge('late', 'Late'), h('span', null, h('strong', null, l.registration), ' on ' + l.load_no + ' to ' + l.dest_name +
        ', expected ' + fmt.dateTime(l.position.eta))));
    });
    d.issues.forEach(function (i) {
      items.push(h('li', null, UI.badge(i.priority, i.priority), h('span', null, h('a', { href: '#issues' }, i.ref), ' ' + i.title,
        h('span', { class: 'muted small' }, ' · ' + fmt.ago(i.created_at)))));
    });
    if (k.compliance) items.push(h('li', null, UI.badge('soon', 'Compliance'), h('span', null, k.compliance + ' driver licences, permits or licence discs expire within 30 days. ', h('a', { href: '#fleet' }, 'Review fleet'))));

    var canvas = h('canvas', { height: 260, 'aria-label': 'Tonnes delivered per day for the last 14 days, by destination type', role: 'img' });
    ctx.view.replaceChildren(
      h('div', { class: 'kpis' }, tiles.map(function (t) { return h('div', { class: 'kpi' + (t[2] ? ' warn' : '') }, h('b', null, t[1]), h('span', null, t[0])); })),
      h('div', { class: 'grid-2' },
        UI.panel('Tonnes delivered, last 14 days', 'By weigh-in at destination', h('div', { class: 'panel-body' }, canvas)),
        UI.panel('Needs attention', items.length ? items.length + ' items' : null,
          items.length ? h('div', { class: 'attention' }, h('ul', null, items)) : h('div', { class: 'empty' }, 'Nothing needs attention. All loads are on schedule.'))));

    if (!window.Chart) return;
    var days = [];
    for (var i = 13; i >= 0; i--) days.push(UI.addDays(UI.today(), -i));
    var types = [['power_station', 'Power stations', '#14213D'], ['rail_siding', 'Rail sidings', '#E0A100'], ['harbour', 'Harbour', '#7C8BA1']];
    var chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: days.map(function (x) { return fmt.shortDate(x); }),
        datasets: types.map(function (t) {
          return { label: t[1], backgroundColor: t[2], borderRadius: 3, data: days.map(function (day) {
            var r = d.tonnage.find(function (x) { return String(x.day).slice(0, 10) === day && x.site_type === t[0]; });
            return r ? r.tonnes : 0;
          }) };
        })
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + fmt.tonnes(c.parsed.y); } } } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: function (v) { return fmt.num(v); } } } }
      }
    });
    canvas.parentElement.style.height = '280px';
    ctx.onLeave(function () { chart.destroy(); });
  }
};
