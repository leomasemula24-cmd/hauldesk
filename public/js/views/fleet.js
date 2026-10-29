window.Views = window.Views || {};
Views.fleet = {
  title: 'Drivers and trucks',
  roles: ['coordinator', 'supplier'],
  lead: function () { return 'Licences, professional driving permits and licence discs, with anything expiring in the next 30 days at the top.'; },
  render: async function (ctx) {
    var h = UI.h, fmt = UI.fmt, V = Views.fleet;
    var only = h('input', { type: 'checkbox', checked: !!V._only, onchange: function () { V._only = only.checked; ctx.refresh(); } });
    ctx.setActions(h('label', { class: 'btn' }, only, 'Only items needing action'));
    var d = await API.get('/fleet');
    var drivers = d.drivers.filter(function (x) { return !V._only || Math.min(x.licence_days, x.prdp_days) <= 30; });
    var vehicles = d.vehicles.filter(function (x) { return !V._only || x.disc_days <= 30; });
    var showHaulier = ctx.user.role === 'coordinator';
    ctx.view.replaceChildren(
      UI.panel('Drivers', drivers.length + ' shown', UI.table([
        { label: 'Driver', value: function (x) { return h('strong', null, x.full_name); } },
        showHaulier ? { label: 'Haulier', value: function (x) { return x.haulier_name; } } : null,
        { label: 'Phone', value: function (x) { return x.phone; } },
        { label: 'Driving licence', value: function (x) { return h('span', null, UI.expiryBadge(x.licence_days), ' ', h('span', { class: 'muted small' }, fmt.date(x.licence_expiry))); } },
        { label: 'Professional driving permit', value: function (x) { return h('span', null, UI.expiryBadge(x.prdp_days), ' ', h('span', { class: 'muted small' }, fmt.date(x.prdp_expiry))); } }
      ].filter(Boolean), drivers, 'No drivers need attention.')),
      UI.panel('Trucks', vehicles.length + ' shown', UI.table([
        { label: 'Registration', value: function (x) { return h('strong', null, x.registration); } },
        showHaulier ? { label: 'Haulier', value: function (x) { return x.haulier_name; } } : null,
        { label: 'Tracking provider', value: function (x) { return x.tracker_provider; } },
        { label: 'Capacity', num: true, value: function (x) { return fmt.tonnes(x.capacity_t, 0); } },
        { label: 'Based at', value: function (x) { return x.home_site; } },
        { label: 'Licence disc', value: function (x) { return h('span', null, UI.expiryBadge(x.disc_days), ' ', h('span', { class: 'muted small' }, fmt.date(x.licence_disc_expiry))); } }
      ].filter(Boolean), vehicles, 'No trucks need attention.')));
  }
};
