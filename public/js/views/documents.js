window.Views = window.Views || {};
Views.documents = {
  title: 'Document register',
  roles: ['coordinator', 'client', 'supplier'],
  lead: function () { return 'Find any delivery note, ticket, permit, contract or invoice, see where it is filed, and know when it can be disposed of.'; },
  render: async function (ctx) {
    var h = UI.h, fmt = UI.fmt, V = Views.documents;
    var cats = ['Delivery note', 'Weighbridge ticket', 'Permit', 'Contract', 'Inspection report', 'Invoice'];
    var search = h('input', { type: 'search', placeholder: 'Title, number or location', value: V._q || '', 'aria-label': 'Search documents' });
    var cat = h('select', { 'aria-label': 'Category', onchange: function () { V._cat = cat.value; ctx.refresh(); } },
      h('option', { value: '' }, 'All categories'), cats.map(function (c) { return h('option', { value: c, selected: V._cat === c }, c); }));
    var due = h('input', { type: 'checkbox', checked: !!V._due, onchange: function () { V._due = due.checked; ctx.refresh(); } });
    var form = h('form', { class: 'toolbar', onsubmit: function (e) { e.preventDefault(); V._q = search.value; ctx.refresh(); } }, search, cat,
      h('label', { class: 'btn' }, due, 'Due for disposal review'), h('button', { class: 'btn', type: 'submit' }, 'Search'));
    ctx.setActions(form);
    var qs = new URLSearchParams();
    if (V._q) qs.set('q', V._q); if (V._cat) qs.set('category', V._cat); if (V._due) qs.set('due', '1');
    var d = await API.get('/documents' + (qs.toString() ? '?' + qs : ''));
    ctx.view.replaceChildren(UI.panel('Documents', d.documents.length + ' found', UI.table([
      { label: 'Number', value: function (x) { return h('strong', null, x.doc_no); } },
      { label: 'Title', value: function (x) { return x.title; } },
      { label: 'Category', value: function (x) { return x.category; } },
      { label: 'Related to', value: function (x) { return [x.load_no, x.site_name, x.haulier_name].filter(Boolean).join(' · ') || '–'; } },
      { label: 'Filed at', value: function (x) { return h('span', { class: 'strong' }, x.storage_ref); } },
      { label: 'Created', value: function (x) { return fmt.date(x.created_on); } },
      { label: 'Keep until', value: function (x) {
          return x.retain_days <= 30 ? h('span', null, UI.badge('soon', x.retain_days < 0 ? 'Review now' : 'Review in ' + x.retain_days + ' d'), ' ', h('span', { class: 'muted small' }, fmt.date(x.retain_until))) : fmt.date(x.retain_until);
        } }
    ], d.documents, 'No documents match your search.')));
  }
};
