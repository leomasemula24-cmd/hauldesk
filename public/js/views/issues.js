window.Views = window.Views || {};
Views.issues = {
  title: 'Issues',
  roles: ['coordinator', 'client', 'supplier', 'driver'],
  lead: function (u) {
    return u.role === 'coordinator' ? 'Breakdowns, delays, weighbridge variances and other problems, with how each one was resolved.'
      : 'Report a problem to the transport coordinator and follow its progress.';
  },
  render: async function (ctx) {
    var h = UI.h, fmt = UI.fmt, V = Views.issues, u = ctx.user;
    V._tab = V._tab || 'active';
    var tabs = [['active', 'Open'], ['resolved', 'Resolved'], ['all', 'All']];
    ctx.setActions(
      h('div', { class: 'tabs', role: 'group', 'aria-label': 'Filter issues' }, tabs.map(function (t) {
        return h('button', { type: 'button', 'aria-pressed': String(V._tab === t[0]), onclick: function () { V._tab = t[0]; ctx.refresh(); } }, t[1]);
      })),
      h('button', { class: 'btn accent', type: 'button', onclick: report }, '+ Report an issue'));

    var d = await API.get('/issues');
    var list = d.issues.filter(function (i) { return V._tab === 'all' || (V._tab === 'resolved' ? i.status === 'resolved' : i.status !== 'resolved'); });

    ctx.view.replaceChildren(UI.panel(V._tab === 'resolved' ? 'Resolved issues' : V._tab === 'all' ? 'All issues' : 'Open issues', list.length + ' shown',
      list.length ? h('div', null, list.map(row)) : h('div', { class: 'empty' }, V._tab === 'active' ? 'No open issues.' : 'Nothing to show.')));

    function row(i) {
      var buttons = [];
      if (u.role === 'coordinator' && i.status !== 'resolved') {
        if (i.status === 'open') buttons.push(h('button', { class: 'btn small', type: 'button', onclick: function () { setStatus(i, 'in_progress'); } }, 'Start working on it'));
        buttons.push(h('button', { class: 'btn small primary', type: 'button', onclick: function () { resolve(i); } }, 'Resolve'));
      }
      return h('article', { class: 'issue' },
        h('div', { class: 'top' }, h('strong', null, i.ref), UI.badge(i.status), UI.badge(i.priority, i.priority + ' priority'), h('span', { class: 'badge plain' }, i.category),
          h('span', { class: 'muted small' }, 'Reported by ' + i.reported_by_name + ' · ' + fmt.dateTime(i.created_at))),
        h('div', { class: 'title' }, i.title),
        i.description ? h('div', { class: 'muted' }, i.description) : null,
        (i.load_no || i.registration) ? h('div', { class: 'small muted' }, [i.load_no ? 'Load ' + i.load_no : null, i.registration ? 'Truck ' + i.registration : null].filter(Boolean).join(' · ')) : null,
        i.resolution ? h('div', { class: 'resolution' }, h('strong', null, 'Resolved ' + fmt.dateTime(i.resolved_at) + ': '), i.resolution) : null,
        buttons.length ? h('div', { class: 'toolbar' }, buttons) : null);
    }
    async function setStatus(i, status) {
      try { await API.patch('/issues/' + i.id, { status: status }); UI.toast(i.ref + ' is in progress.'); ctx.refresh(); }
      catch (e) { UI.toast(e.message, 'error'); }
    }
    async function resolve(i) {
      var r = await UI.formDialog({ title: 'Resolve ' + i.ref, intro: i.title, submitLabel: 'Mark resolved',
        fields: [{ name: 'resolution', label: 'What was done', type: 'textarea', required: true, wide: true }],
        onSubmit: function (v) { return API.patch('/issues/' + i.id, { status: 'resolved', resolution: v.resolution }); } });
      if (r) { UI.toast(i.ref + ' resolved.'); ctx.refresh(); }
    }
    async function report() {
      var r = await UI.formDialog({ title: 'Report an issue', submitLabel: 'Send to coordinator',
        fields: [
          { name: 'title', label: 'What happened', required: true, wide: true, help: 'For example: Truck broke down near Morwa' },
          { name: 'category', label: 'Category', type: 'select', options: ['Breakdown', 'Delay', 'Weighbridge', 'Tracking offline', 'Site access', 'Safety', 'Other'].map(function (c) { return { value: c, label: c }; }) },
          { name: 'priority', label: 'Priority', type: 'select', value: 'medium', options: [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High: stops work' }] },
          { name: 'load_no', label: 'Load number (optional)', help: 'For example: LD-24410' },
          { name: 'description', label: 'Details (optional)', type: 'textarea', wide: true }
        ],
        onSubmit: function (v) { return API.post('/issues', v); } });
      if (r) { UI.toast('Issue ' + r.ref + ' sent to the coordinator.'); V._tab = 'active'; ctx.refresh(); }
    }
  }
};
