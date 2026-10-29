window.Views = window.Views || {};
Views.weighbridge = {
  title: 'Weighbridge',
  roles: ['coordinator', 'client', 'supplier'],
  lead: function () { return 'Every load is weighed leaving the mine and again on arrival. Loads that arrive more than 1.5% short are flagged.'; },
  render: async function (ctx) {
    var h = UI.h, fmt = UI.fmt, V = Views.weighbridge;
    V._from = V._from || UI.addDays(UI.today(), -6); V._to = V._to || UI.today();
    var from = h('input', { type: 'date', value: V._from, 'aria-label': 'From date', onchange: function () { V._from = from.value; ctx.refresh(); } });
    var to = h('input', { type: 'date', value: V._to, 'aria-label': 'To date', onchange: function () { V._to = to.value; ctx.refresh(); } });
    var flagged = h('input', { type: 'checkbox', checked: !!V._flagged, onchange: function () { V._flagged = flagged.checked; ctx.refresh(); } });
    ctx.setActions(h('div', { class: 'toolbar' }, from, h('span', { class: 'muted' }, 'to'), to, h('label', { class: 'btn' }, flagged, 'Only flagged')));

    var d = await API.get('/tickets?from=' + V._from + '&to=' + V._to + (V._flagged ? '&flagged=1' : ''));
    var t = d.tickets, done = t.filter(function (x) { return x.net_in != null; });
    var out = done.reduce(function (s, x) { return s + x.net_out; }, 0), inn = done.reduce(function (s, x) { return s + x.net_in; }, 0);
    var flaggedCount = done.filter(function (x) { return x.variance_pct > d.limit_pct; }).length;

    var cols = [
      { label: 'Load', value: function (x) { return h('strong', null, x.load_no); }, csv: function (x) { return x.load_no; } },
      { label: 'Route', value: function (x) { return x.origin_name + ' → ' + x.dest_name; } },
      { label: 'Truck', value: function (x) { return x.registration || '–'; } },
      { label: 'Weighed out', value: function (x) { return fmt.dateTime(x._out_at || x.departed_at); } },
      { label: 'Net out', num: true, value: function (x) { return fmt.tonnes(x.net_out, 2); } },
      { label: 'Net in', num: true, value: function (x) { return x.net_in == null ? h('span', { class: 'muted' }, 'On the road') : fmt.tonnes(x.net_in, 2); } },
      { label: 'Variance', num: true, value: function (x) {
          if (x.variance_pct == null) return '–';
          return x.variance_pct > d.limit_pct ? UI.badge('high', x.variance_pct.toFixed(2) + '% short') : h('span', { class: 'muted' }, x.variance_pct.toFixed(2) + '%');
        }, csv: function (x) { return x.variance_pct; } }
    ];
    ctx.view.replaceChildren(
      h('div', { class: 'kpis' },
        h('div', { class: 'kpi' }, h('b', null, fmt.num(t.length)), h('span', null, 'Loads weighed out')),
        h('div', { class: 'kpi' }, h('b', null, fmt.num(out, 1)), h('span', null, 'Tonnes out (completed loads)')),
        h('div', { class: 'kpi' }, h('b', null, fmt.num(inn, 1)), h('span', null, 'Tonnes in')),
        h('div', { class: 'kpi' }, h('b', null, out ? ((out - inn) / out * 100).toFixed(2) + '%' : '–'), h('span', null, 'Overall variance')),
        h('div', { class: 'kpi' + (flaggedCount ? ' warn' : '') }, h('b', null, flaggedCount), h('span', null, 'Loads flagged'))),
      UI.panel('Weighbridge reconciliation', null, h('div', null,
        h('div', { class: 'panel-body toolbar', style: 'padding-bottom:0' },
          h('button', { class: 'btn small', type: 'button', onclick: function () { UI.downloadCsv('weighbridge-' + V._from + '-to-' + V._to + '.csv', cols, t); } }, 'Download CSV')),
        UI.table(cols, t, 'No loads were weighed in this period.'))));
  }
};
