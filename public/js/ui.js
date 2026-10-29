// Small helpers for building the interface without a framework
window.UI = (function () {
  // h('div', { class: 'x', onclick: fn }, 'text', child, ...)
  function h(tag, attrs) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'class') el.className = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }

  // ---------- formatting ----------
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function parse(s) {
    if (!s) return null;
    if (s instanceof Date) return s;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00');
    return new Date(String(s).replace(' ', 'T'));
  }
  function p2(n) { return String(n).padStart(2, '0'); }
  var fmt = {
    time: function (s) { var d = parse(s); return d ? p2(d.getHours()) + ':' + p2(d.getMinutes()) : '–'; },
    date: function (s) { var d = parse(s); return d ? d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() : '–'; },
    shortDate: function (s) { var d = parse(s); return d ? DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] : '–'; },
    dateTime: function (s) {
      var d = parse(s); if (!d) return '–';
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var day = new Date(d); day.setHours(0, 0, 0, 0);
      var diff = Math.round((day - today) / 86400000);
      var label = diff === 0 ? 'Today' : diff === -1 ? 'Yesterday' : diff === 1 ? 'Tomorrow' : fmt.shortDate(d);
      return label + ', ' + fmt.time(d);
    },
    num: function (n, d) { return n == null ? '–' : Number(n).toLocaleString('en-ZA', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); },
    tonnes: function (n, d) { return n == null ? '–' : fmt.num(n, d == null ? 1 : d) + ' t'; },
    minutes: function (m) { if (m == null) return '–'; var h = Math.floor(m / 60), r = Math.round(m % 60); return h ? h + ' h ' + p2(r) + ' min' : r + ' min'; },
    iso: function (d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); },
    ago: function (s) {
      var d = parse(s); if (!d) return '';
      var m = Math.round((Date.now() - d) / 60000);
      if (m < 1) return 'just now';
      if (m < 60) return m + ' min ago';
      if (m < 1440) return Math.round(m / 60) + ' h ago';
      return fmt.shortDate(d);
    }
  };
  function today() { return fmt.iso(new Date()); }
  function addDays(iso, n) { var d = parse(iso); d.setDate(d.getDate() + n); return fmt.iso(d); }

  var STATUS = { planned: 'Planned', loading: 'Loading', in_transit: 'On the road', delivered: 'Delivered', cancelled: 'Cancelled',
    open: 'Open', in_progress: 'In progress', resolved: 'Resolved' };
  var SITE_TYPE = { mine: 'Mine', power_station: 'Power station', rail_siding: 'Rail siding', harbour: 'Harbour' };
  function badge(kind, text) { return h('span', { class: 'badge ' + kind }, text || STATUS[kind] || kind); }
  function expiryBadge(days) {
    if (days < 0) return badge('expired', 'Expired ' + Math.abs(days) + ' d ago');
    if (days <= 30) return badge('soon', 'Due in ' + days + ' d');
    return badge('ok', 'Valid');
  }

  // ---------- tables ----------
  // columns: [{ label, value: row => text|node, num: true }]
  function table(columns, rows, emptyText) {
    if (!rows.length) return h('div', { class: 'empty' }, emptyText || 'Nothing to show.');
    return h('div', { class: 'table-wrap' },
      h('table', null,
        h('thead', null, h('tr', null, columns.map(function (c) { return h('th', { class: c.num ? 'num' : null, scope: 'col' }, c.label); }))),
        h('tbody', null, rows.map(function (r) {
          return h('tr', null, columns.map(function (c) { return h('td', { class: c.num ? 'num' : null }, c.value(r)); }));
        }))));
  }
  function panel(title, hint, body) {
    return h('section', { class: 'panel' }, h('header', null, h('h2', null, title), hint ? h('span', { class: 'hint' }, hint) : null), body);
  }

  // ---------- dialog with a form ----------
  // fields: [{ name, label, type, options:[{value,label}], value, help, wide, required, step, min, max }]
  function formDialog(opts) {
    return new Promise(function (resolve) {
      var error = h('p', { class: 'error-text', role: 'alert' });
      var inputs = {};
      var body = h('div', { class: 'form-grid' }, (opts.fields || []).map(function (f) {
        var id = 'f-' + f.name, input;
        if (f.type === 'select') {
          input = h('select', { id: id, name: f.name, required: f.required }, (f.options || []).map(function (o) {
            return h('option', { value: o.value, selected: String(o.value) === String(f.value) }, o.label);
          }));
        } else if (f.type === 'textarea') {
          input = h('textarea', { id: id, name: f.name, rows: 3, required: f.required }); input.value = f.value || '';
        } else {
          input = h('input', { id: id, name: f.name, type: f.type || 'text', required: f.required, step: f.step, min: f.min, max: f.max, value: f.value != null ? f.value : '' });
        }
        inputs[f.name] = input;
        return h('div', { class: 'field' + (f.wide ? ' wide' : '') }, h('label', { for: id }, f.label), input, f.help ? h('span', { class: 'help' }, f.help) : null);
      }));
      var submit = h('button', { class: 'btn primary', type: 'submit' }, opts.submitLabel || 'Save');
      var dlg = h('dialog', { 'aria-labelledby': 'dlg-title' },
        h('form', { method: 'dialog' },
          h('header', null, h('h2', { id: 'dlg-title' }, opts.title)),
          h('div', { class: 'dialog-body' }, opts.intro ? h('p', { class: 'muted', style: 'margin:0' }, opts.intro) : null, body, error),
          h('footer', null, h('button', { class: 'btn', type: 'button', onclick: function () { dlg.close(); } }, 'Cancel'), submit)));
      if (opts.onChange) Object.keys(inputs).forEach(function (k) { inputs[k].addEventListener('change', function () { opts.onChange(k, inputs); }); });
      dlg.querySelector('form').addEventListener('submit', async function (e) {
        e.preventDefault();
        var values = {};
        Object.keys(inputs).forEach(function (k) { values[k] = inputs[k].value; });
        submit.disabled = true; error.textContent = '';
        try {
          var result = opts.onSubmit ? await opts.onSubmit(values) : values;
          dlg.close(); resolve(result);
        } catch (err) { error.textContent = err.message; submit.disabled = false; }
      });
      dlg.addEventListener('close', function () { dlg.remove(); resolve(null); });
      document.body.appendChild(dlg);
      if (opts.onChange) Object.keys(inputs).forEach(function (k) { opts.onChange(k, inputs, true); });
      dlg.showModal();
      var first = dlg.querySelector('input, select, textarea'); if (first) first.focus();
    });
  }

  var toastTimer;
  function toast(msg, kind) {
    var old = document.querySelector('.toast'); if (old) old.remove();
    var t = h('div', { class: 'toast' + (kind === 'error' ? ' error' : ''), role: 'status' }, msg);
    document.body.appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.remove(); }, 4200);
  }

  function options(list, valueKey, labelKey, blank) {
    var out = blank ? [{ value: '', label: blank }] : [];
    return out.concat(list.map(function (x) { return { value: x[valueKey], label: typeof labelKey === 'function' ? labelKey(x) : x[labelKey] }; }));
  }

  function downloadCsv(filename, columns, rows) {
    var esc = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var csv = [columns.map(function (c) { return esc(c.label); }).join(',')]
      .concat(rows.map(function (r) { return columns.map(function (c) { return esc(c.csv ? c.csv(r) : c.value(r)); }).join(','); })).join('\n');
    var a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: filename });
    document.body.appendChild(a); a.click(); a.remove();
  }

  return { h: h, fmt: fmt, today: today, addDays: addDays, badge: badge, expiryBadge: expiryBadge, table: table, panel: panel,
    formDialog: formDialog, toast: toast, options: options, downloadCsv: downloadCsv, STATUS: STATUS, SITE_TYPE: SITE_TYPE };
})();
