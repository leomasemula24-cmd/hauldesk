// HaulDesk REST API
const express = require('express');
const { pool, query } = require('./db');
const { login, requireLogin, allow, loadScope } = require('./auth');
const geo = require('../public/js/lib/geo.js');

const router = express.Router();
const VARIANCE_LIMIT = 0.015;   // weigh-in more than 1.5% below weigh-out raises an issue
const toDate = (s) => new Date(String(s).replace(' ', 'T'));
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

const LOAD_SELECT = `
  SELECT l.*, o.name AS origin_name, o.code AS origin_code, o.lat AS origin_lat, o.lng AS origin_lng,
         d.name AS dest_name, d.code AS dest_code, d.site_type AS dest_type, d.division AS dest_division,
         d.lat AS dest_lat, d.lng AS dest_lng,
         h.name AS haulier_name, v.registration, v.tracker_provider, dr.full_name AS driver_name,
         ROUND(wo.gross_t - wo.tare_t, 2) AS net_out, ROUND(wi.gross_t - wi.tare_t, 2) AS net_in
    FROM loads l
    JOIN sites o    ON o.id = l.origin_site_id
    JOIN sites d    ON d.id = l.destination_site_id
    JOIN hauliers h ON h.id = l.haulier_id
    LEFT JOIN vehicles v ON v.id = l.vehicle_id
    LEFT JOIN drivers dr ON dr.id = l.driver_id
    LEFT JOIN weighbridge_tickets wo ON wo.load_id = l.id AND wo.direction = 'out'
    LEFT JOIN weighbridge_tickets wi ON wi.load_id = l.id AND wi.direction = 'in'`;

function withPosition(load, now = new Date()) {
  if (load.status !== 'in_transit') return load;
  const pos = geo.estimatePosition({ lat: load.origin_lat, lng: load.origin_lng },
    { lat: load.dest_lat, lng: load.dest_lng }, toDate(load.departed_at), now);
  return { ...load, position: pos };
}

async function findLoad(user, id) {
  const scope = loadScope(user);
  const rows = await query(`${LOAD_SELECT} WHERE l.id = ? AND ${scope.sql}`, [id, ...scope.params]);
  return rows[0];
}

async function nextNumber(conn, table, column, prefix) {
  const [rows] = await conn.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(${column}, ${prefix.length + 1}) AS UNSIGNED)), 0) + 1 AS n
       FROM ${table} WHERE ${column} LIKE ?`, [`${prefix}%`]);
  return `${prefix}${String(rows[0].n).padStart(4, '0')}`;
}

// ---------- session ----------
router.get('/health', (req, res) => res.json({ ok: true, mode: 'server' }));

router.post('/login', wrap(async (req, res) => {
  const user = await login(String(req.body.username || '').trim(), String(req.body.password || ''));
  if (!user) return res.status(401).json({ error: 'Username or password is incorrect.' });
  req.session.user = user;
  res.json({ user });
}));

router.post('/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

router.use(requireLogin);
router.get('/me', (req, res) => res.json({ user: req.session.user }));

// ---------- reference lists for forms ----------
router.get('/lookups', wrap(async (req, res) => {
  const u = req.session.user;
  const sites = await query('SELECT * FROM sites ORDER BY site_type, name');
  const hauliers = await query('SELECT id, name FROM hauliers ORDER BY name');
  let vFilter = '1=0', dFilter = '1=0', p = [];
  if (u.role === 'coordinator') { vFilter = '1=1'; dFilter = '1=1'; }
  if (u.role === 'supplier' || u.role === 'driver') { vFilter = 'haulier_id = ?'; dFilter = 'haulier_id = ?'; p = [u.haulier_id]; }
  const vehicles = await query(`SELECT id, registration, haulier_id, capacity_t FROM vehicles WHERE active = 1 AND ${vFilter} ORDER BY registration`, p);
  const drivers = await query(`SELECT id, full_name, haulier_id FROM drivers WHERE active = 1 AND ${dFilter} ORDER BY full_name`, p);
  res.json({ sites, hauliers, vehicles, drivers });
}));

// ---------- dashboard ----------
router.get('/dashboard', wrap(async (req, res) => {
  const u = req.session.user;
  const s = loadScope(u);
  const base = `FROM loads l JOIN sites o ON o.id = l.origin_site_id JOIN sites d ON d.id = l.destination_site_id
                LEFT JOIN weighbridge_tickets wi ON wi.load_id = l.id AND wi.direction = 'in' WHERE ${s.sql}`;
  const [k] = await query(`
    SELECT SUM(l.planned_date = CURDATE() AND l.status <> 'cancelled')          AS loads_today,
           SUM(l.status = 'delivered' AND DATE(l.delivered_at) = CURDATE())      AS delivered_today,
           SUM(l.status = 'in_transit')                                          AS in_transit,
           SUM(l.status = 'loading')                                             AS loading,
           ROUND(COALESCE(SUM(CASE WHEN DATE(wi.weighed_at) = CURDATE() THEN wi.gross_t - wi.tare_t END), 0), 1) AS tonnes_today
      ${base}`, s.params);

  const tonnage = await query(`
    SELECT DATE(wi.weighed_at) AS day, d.site_type, ROUND(SUM(wi.gross_t - wi.tare_t), 1) AS tonnes
      ${base} AND wi.weighed_at >= CURDATE() - INTERVAL 13 DAY
     GROUP BY DATE(wi.weighed_at), d.site_type ORDER BY day`, s.params);

  const transit = (await query(`${LOAD_SELECT} WHERE l.status = 'in_transit' AND ${s.sql}`, s.params)).map((l) => withPosition(l));
  const late = transit.filter((l) => l.position.overdue);

  const iss = issueScope(u);
  const issues = await query(`
    SELECT i.id, i.ref, i.title, i.category, i.priority, i.status, i.created_at
      FROM issues i LEFT JOIN loads l ON l.id = i.load_id
      LEFT JOIN sites o ON o.id = l.origin_site_id LEFT JOIN sites d ON d.id = l.destination_site_id
     WHERE i.status <> 'resolved' AND ${iss.sql} ORDER BY FIELD(i.priority,'high','medium','low'), i.created_at DESC`, iss.params);

  let compliance = null;
  if (u.role === 'coordinator' || u.role === 'supplier') {
    const hf = u.role === 'supplier' ? 'AND haulier_id = ?' : '';
    const hp = u.role === 'supplier' ? [u.haulier_id] : [];
    const [c1] = await query(`SELECT COUNT(*) AS n FROM drivers WHERE active = 1 ${hf}
      AND (licence_expiry <= CURDATE() + INTERVAL 30 DAY OR prdp_expiry <= CURDATE() + INTERVAL 30 DAY)`, hp);
    const [c2] = await query(`SELECT COUNT(*) AS n FROM vehicles WHERE active = 1 ${hf}
      AND licence_disc_expiry <= CURDATE() + INTERVAL 30 DAY`, hp);
    compliance = c1.n + c2.n;
  }

  res.json({
    kpis: {
      loads_today: +k.loads_today || 0, delivered_today: +k.delivered_today || 0, in_transit: +k.in_transit || 0,
      loading: +k.loading || 0, tonnes_today: +k.tonnes_today || 0, open_issues: issues.length, late: late.length, compliance
    },
    tonnage, late, issues: issues.slice(0, 6)
  });
}));

// ---------- loads / dispatch ----------
router.get('/loads', wrap(async (req, res) => {
  const s = loadScope(req.session.user);
  const where = [s.sql]; const params = [...s.params];
  if (req.query.date) { where.push('l.planned_date = ?'); params.push(req.query.date); }
  else where.push('(l.planned_date = CURDATE() OR l.status IN (\'loading\', \'in_transit\'))');
  if (req.query.status) { where.push('l.status = ?'); params.push(req.query.status); }
  if (req.query.q) { where.push('(l.load_no LIKE ? OR v.registration LIKE ? OR dr.full_name LIKE ?)'); params.push(...Array(3).fill(`%${req.query.q}%`)); }
  const rows = await query(`${LOAD_SELECT} WHERE ${where.join(' AND ')} ORDER BY l.load_no`, params);
  const now = new Date();
  res.json({ loads: rows.map((l) => withPosition(l, now)) });
}));

router.post('/loads', allow('coordinator'), wrap(async (req, res) => {
  const b = req.body;
  const [origin] = await query('SELECT * FROM sites WHERE id = ?', [b.origin_site_id]);
  const [dest] = await query('SELECT * FROM sites WHERE id = ?', [b.destination_site_id]);
  if (!origin || origin.site_type !== 'mine') return res.status(400).json({ error: 'Choose a mine to load from.' });
  if (!dest || dest.site_type === 'mine') return res.status(400).json({ error: 'Choose a power station, siding or harbour to deliver to.' });
  const tonnes = Number(b.planned_tonnes);
  if (!(tonnes > 0 && tonnes <= 40)) return res.status(400).json({ error: 'Planned tonnes must be between 1 and 40.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.planned_date))) return res.status(400).json({ error: 'Choose a planned date.' });
  const err = await checkAllocation(b.haulier_id, b.vehicle_id, b.driver_id);
  if (err) return res.status(400).json({ error: err });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[last]] = await conn.query("SELECT MAX(CAST(SUBSTRING(load_no, 4) AS UNSIGNED)) AS n FROM loads FOR UPDATE");
    const loadNo = `LD-${(last.n || 24000) + 1}`;
    const [r] = await conn.query(
      `INSERT INTO loads (load_no, origin_site_id, destination_site_id, haulier_id, vehicle_id, driver_id, product, planned_tonnes, planned_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [loadNo, origin.id, dest.id, b.haulier_id, b.vehicle_id || null, b.driver_id || null, b.product || 'RoM coal', tonnes, b.planned_date, b.notes || null]);
    await conn.commit();
    res.status(201).json({ load: await findLoad(req.session.user, r.insertId) });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

async function checkAllocation(haulierId, vehicleId, driverId) {
  const [h] = await query('SELECT id FROM hauliers WHERE id = ?', [haulierId]);
  if (!h) return 'Choose a haulier.';
  if (vehicleId) {
    const [v] = await query('SELECT haulier_id FROM vehicles WHERE id = ?', [vehicleId]);
    if (!v || v.haulier_id !== Number(haulierId)) return 'That truck does not belong to the selected haulier.';
  }
  if (driverId) {
    const [d] = await query('SELECT haulier_id FROM drivers WHERE id = ?', [driverId]);
    if (!d || d.haulier_id !== Number(haulierId)) return 'That driver does not work for the selected haulier.';
  }
  return null;
}

// Allowed status changes. Drivers may move their own load forward; coordinators may also cancel or reset.
const FLOW = {
  planned:    ['loading', 'cancelled'],
  loading:    ['in_transit', 'planned', 'cancelled'],
  in_transit: ['delivered'],
  delivered:  [],
  cancelled:  ['planned']
};
const DRIVER_FLOW = { planned: ['loading'], loading: ['in_transit'], in_transit: ['delivered'] };

router.patch('/loads/:id', wrap(async (req, res) => {
  const u = req.session.user;
  const load = await findLoad(u, req.params.id);
  if (!load) return res.status(404).json({ error: 'Load not found.' });
  const b = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let autoIssue = null;

    // truck and driver allocation
    if (b.vehicle_id !== undefined || b.driver_id !== undefined) {
      if (!(u.role === 'coordinator' || (u.role === 'supplier' && u.haulier_id === load.haulier_id))) throw httpError(403, 'Only the coordinator or the haulier can allocate trucks.');
      if (!['planned', 'loading'].includes(load.status)) throw httpError(400, 'Trucks can only be changed before the load departs.');
      const vehicleId = b.vehicle_id !== undefined ? (b.vehicle_id || null) : load.vehicle_id;
      const driverId = b.driver_id !== undefined ? (b.driver_id || null) : load.driver_id;
      const err = await checkAllocation(load.haulier_id, vehicleId, driverId);
      if (err) throw httpError(400, err);
      await conn.query('UPDATE loads SET vehicle_id = ?, driver_id = ? WHERE id = ?', [vehicleId, driverId, load.id]);
      load.vehicle_id = vehicleId; load.driver_id = driverId;
    }

    if (b.notes !== undefined && u.role === 'coordinator') {
      await conn.query('UPDATE loads SET notes = ? WHERE id = ?', [String(b.notes).slice(0, 255) || null, load.id]);
    }

    // status change, with weighbridge capture when leaving the mine and arriving at the destination
    if (b.status && b.status !== load.status) {
      const allowed = u.role === 'coordinator' ? FLOW[load.status] : u.role === 'driver' ? (DRIVER_FLOW[load.status] || []) : [];
      if (!allowed.includes(b.status)) throw httpError(403, `A load cannot move from ${load.status} to ${b.status} by your role.`);
      if (['loading', 'in_transit'].includes(b.status) && (!load.vehicle_id || !load.driver_id)) throw httpError(400, 'Allocate a truck and driver first.');

      if (b.status === 'in_transit' || b.status === 'delivered') {
        const gross = Number(b.gross_t), tare = Number(b.tare_t);
        if (!(gross > tare && tare > 0 && gross - tare <= 45)) throw httpError(400, 'Enter valid weighbridge gross and tare masses.');
        const dir = b.status === 'in_transit' ? 'out' : 'in';
        const ticketNo = await nextNumber(conn, 'weighbridge_tickets', 'ticket_no', dir === 'out' ? 'WO-' : 'WI-');
        await conn.query(`INSERT INTO weighbridge_tickets (ticket_no, load_id, site_id, direction, gross_t, tare_t, weighed_at)
                          VALUES (?, ?, ?, ?, ?, ?, NOW())`,
          [ticketNo, load.id, dir === 'out' ? load.origin_site_id : load.destination_site_id, dir, gross, tare]);
        if (dir === 'in' && load.net_out) {
          const variance = (load.net_out - (gross - tare)) / load.net_out;
          if (variance > VARIANCE_LIMIT) {
            const ref = await nextNumber(conn, 'issues', 'ref', 'IS-');
            await conn.query(`INSERT INTO issues (ref, title, category, priority, status, load_id, vehicle_id, reported_by, description, created_at)
                              VALUES (?, ?, 'Weighbridge', 'high', 'open', ?, ?, ?, ?, NOW())`,
              [ref, `Net mass variance on ${load.load_no}`, load.id, load.vehicle_id, u.id,
               `Weigh-in is ${(variance * 100).toFixed(1)}% below the weigh-out of ${load.net_out} t. Raised automatically.`]);
            autoIssue = ref;
          }
        }
      }
      const stamp = { loading: 'loaded_at = NOW(),', in_transit: 'departed_at = NOW(),', delivered: 'delivered_at = NOW(),' }[b.status] || '';
      const reset = b.status === 'planned' ? 'loaded_at = NULL, departed_at = NULL,' : '';
      await conn.query(`UPDATE loads SET ${stamp} ${reset} status = ? WHERE id = ?`, [b.status, load.id]);
    }

    await conn.commit();
    res.json({ load: withPosition(await findLoad(u, load.id)), autoIssue });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

// ---------- one map for every tracking provider ----------
router.get('/tracking', wrap(async (req, res) => {
  const u = req.session.user;
  const s = loadScope(u);
  const sites = await query('SELECT * FROM sites');
  const active = await query(`${LOAD_SELECT} WHERE l.status IN ('loading','in_transit') AND ${s.sql}`, s.params);
  const now = new Date();
  const byVehicle = new Map(active.map((l) => [l.vehicle_id, withPosition(l, now)]));

  let vf = '1=0', vp = [];
  if (u.role === 'coordinator') vf = '1=1';
  if (u.role === 'supplier') { vf = 'v.haulier_id = ?'; vp = [u.haulier_id]; }
  const idle = await query(`SELECT v.*, h.name AS haulier_name FROM vehicles v JOIN hauliers h ON h.id = v.haulier_id
                             WHERE v.active = 1 AND ${vf}`, vp);
  const siteById = new Map(sites.map((x) => [x.id, x]));
  const trucks = [];
  for (const l of byVehicle.values()) {
    const at = l.status === 'in_transit' ? l.position : { lat: l.origin_lat, lng: l.origin_lng };
    trucks.push({ vehicle_id: l.vehicle_id, registration: l.registration, tracker_provider: l.tracker_provider,
      haulier_name: l.haulier_name, driver_name: l.driver_name, status: l.status, load_no: l.load_no,
      origin_name: l.origin_name, dest_name: l.dest_name, lat: at.lat, lng: at.lng,
      progress: l.position ? l.position.progress : 0, eta: l.position ? l.position.eta : null, overdue: !!(l.position && l.position.overdue) });
  }
  for (const v of idle) {
    if (byVehicle.has(v.id)) continue;
    const home = siteById.get(v.home_site_id);
    const jitter = ((v.id * 37) % 11 - 5) / 900;
    trucks.push({ vehicle_id: v.id, registration: v.registration, tracker_provider: v.tracker_provider,
      haulier_name: v.haulier_name, status: 'idle', lat: +home.lat + jitter, lng: +home.lng - jitter, origin_name: home.name });
  }
  res.json({ sites, trucks, updated_at: now.toISOString() });
}));

// ---------- weighbridge reconciliation ----------
router.get('/tickets', allow('coordinator', 'client', 'supplier'), wrap(async (req, res) => {
  const s = loadScope(req.session.user);
  const from = req.query.from || null, to = req.query.to || null;
  const rows = await query(`${LOAD_SELECT}
     WHERE ${s.sql} AND wo.id IS NOT NULL
       AND DATE(wo.weighed_at) BETWEEN COALESCE(?, CURDATE() - INTERVAL 6 DAY) AND COALESCE(?, CURDATE())
     ORDER BY wo.weighed_at DESC`, [...s.params, from, to]);
  const list = rows.map((l) => ({
    ...l, variance_pct: l.net_in != null ? +(((l.net_out - l.net_in) / l.net_out) * 100).toFixed(2) : null
  })).filter((l) => !req.query.flagged || (l.variance_pct != null && l.variance_pct > VARIANCE_LIMIT * 100));
  res.json({ tickets: list, limit_pct: VARIANCE_LIMIT * 100 });
}));

// ---------- stockpiles ----------
router.get('/stockpiles', allow('coordinator', 'client'), wrap(async (req, res) => {
  const u = req.session.user;
  const f = u.role === 'client' ? 'WHERE s.division = ?' : '';
  const rows = await query(`SELECT r.site_id, s.name, s.code, s.site_type, s.division, r.product, r.reading_date, r.tonnes
                              FROM stockpile_readings r JOIN sites s ON s.id = r.site_id ${f}
                             ORDER BY s.site_type, s.name, r.reading_date`, u.role === 'client' ? [u.division] : []);
  res.json({ readings: rows });
}));

// ---------- drivers and trucks: compliance ----------
router.get('/fleet', allow('coordinator', 'supplier'), wrap(async (req, res) => {
  const u = req.session.user;
  const f = u.role === 'supplier' ? 'WHERE x.haulier_id = ?' : '';
  const p = u.role === 'supplier' ? [u.haulier_id] : [];
  const drivers = await query(`SELECT x.*, h.name AS haulier_name,
      DATEDIFF(x.licence_expiry, CURDATE()) AS licence_days, DATEDIFF(x.prdp_expiry, CURDATE()) AS prdp_days
      FROM drivers x JOIN hauliers h ON h.id = x.haulier_id ${f} ORDER BY LEAST(licence_days, prdp_days), x.full_name`, p);
  const vehicles = await query(`SELECT x.*, h.name AS haulier_name, s.name AS home_site,
      DATEDIFF(x.licence_disc_expiry, CURDATE()) AS disc_days
      FROM vehicles x JOIN hauliers h ON h.id = x.haulier_id JOIN sites s ON s.id = x.home_site_id ${f}
      ORDER BY disc_days, x.registration`, p);
  res.json({ drivers, vehicles });
}));

// ---------- document register ----------
router.get('/documents', allow('coordinator', 'client', 'supplier'), wrap(async (req, res) => {
  const u = req.session.user;
  const where = ['1=1']; const params = [];
  if (u.role === 'client') { where.push('(s.division = ? OR d.division = ? OR o.division = ?)'); params.push(u.division, u.division, u.division); }
  if (u.role === 'supplier') { where.push('doc.haulier_id = ?'); params.push(u.haulier_id); }
  if (req.query.q) { where.push('(doc.title LIKE ? OR doc.doc_no LIKE ? OR doc.storage_ref LIKE ?)'); params.push(...Array(3).fill(`%${req.query.q}%`)); }
  if (req.query.category) { where.push('doc.category = ?'); params.push(req.query.category); }
  if (req.query.due) where.push('doc.retain_until <= CURDATE() + INTERVAL 30 DAY');
  const rows = await query(`SELECT doc.*, s.name AS site_name, h.name AS haulier_name, l.load_no,
      DATEDIFF(doc.retain_until, CURDATE()) AS retain_days
      FROM documents doc
      LEFT JOIN sites s    ON s.id = doc.site_id
      LEFT JOIN hauliers h ON h.id = doc.haulier_id
      LEFT JOIN loads l    ON l.id = doc.load_id
      LEFT JOIN sites o    ON o.id = l.origin_site_id
      LEFT JOIN sites d    ON d.id = l.destination_site_id
     WHERE ${where.join(' AND ')} ORDER BY doc.created_on DESC`, params);
  res.json({ documents: rows });
}));

// ---------- issue log ----------
function issueScope(u) {
  if (u.role === 'coordinator') return { sql: '1=1', params: [] };
  const s = loadScope(u);
  return { sql: `(i.reported_by = ? OR (i.load_id IS NOT NULL AND ${s.sql}))`, params: [u.id, ...s.params] };
}

router.get('/issues', wrap(async (req, res) => {
  const s = issueScope(req.session.user);
  const where = [s.sql]; const params = [...s.params];
  if (req.query.status) { where.push('i.status = ?'); params.push(req.query.status); }
  const rows = await query(`SELECT i.*, l.load_no, v.registration, u.full_name AS reported_by_name
      FROM issues i
      LEFT JOIN loads l    ON l.id = i.load_id
      LEFT JOIN sites o    ON o.id = l.origin_site_id
      LEFT JOIN sites d    ON d.id = l.destination_site_id
      LEFT JOIN vehicles v ON v.id = i.vehicle_id
      JOIN users u ON u.id = i.reported_by
     WHERE ${where.join(' AND ')}
     ORDER BY i.status = 'resolved', FIELD(i.priority,'high','medium','low'), i.created_at DESC`, params);
  res.json({ issues: rows });
}));

router.post('/issues', wrap(async (req, res) => {
  const u = req.session.user; const b = req.body;
  const title = String(b.title || '').trim();
  if (title.length < 5) return res.status(400).json({ error: 'Describe the issue in a short title.' });
  const categories = ['Breakdown', 'Delay', 'Weighbridge', 'Tracking offline', 'Site access', 'Safety', 'Other'];
  if (!categories.includes(b.category)) return res.status(400).json({ error: 'Choose a category.' });
  let loadId = null, vehicleId = null;
  if (b.load_no) {
    const s = loadScope(u);
    const [l] = await query(`SELECT l.id, l.vehicle_id FROM loads l JOIN sites o ON o.id = l.origin_site_id
       JOIN sites d ON d.id = l.destination_site_id WHERE l.load_no = ? AND ${s.sql}`, [String(b.load_no).trim(), ...s.params]);
    if (!l) return res.status(400).json({ error: 'That load number was not found.' });
    loadId = l.id; vehicleId = l.vehicle_id;
  }
  const conn = await pool.getConnection();
  try {
    const ref = await nextNumber(conn, 'issues', 'ref', 'IS-');
    await conn.query(`INSERT INTO issues (ref, title, category, priority, status, load_id, vehicle_id, reported_by, description, created_at)
                      VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, NOW())`,
      [ref, title.slice(0, 140), b.category, ['low', 'medium', 'high'].includes(b.priority) ? b.priority : 'medium',
       loadId, vehicleId, u.id, String(b.description || '').slice(0, 2000) || null]);
    res.status(201).json({ ref });
  } finally { conn.release(); }
}));

router.patch('/issues/:id', allow('coordinator'), wrap(async (req, res) => {
  const b = req.body;
  if (!['open', 'in_progress', 'resolved'].includes(b.status)) return res.status(400).json({ error: 'Choose a valid status.' });
  if (b.status === 'resolved' && !String(b.resolution || '').trim()) return res.status(400).json({ error: 'Say how the issue was resolved.' });
  const r = await query(`UPDATE issues SET status = ?, resolution = COALESCE(?, resolution),
                           resolved_at = IF(? = 'resolved', NOW(), NULL) WHERE id = ?`,
    [b.status, String(b.resolution || '').trim() || null, b.status, req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Issue not found.' });
  res.json({ ok: true });
}));

// ---------- route performance report ----------
router.get('/reports/routes', allow('coordinator', 'client'), wrap(async (req, res) => {
  const s = loadScope(req.session.user);
  const rows = await query(`${LOAD_SELECT}
     WHERE ${s.sql} AND l.status = 'delivered'
       AND DATE(l.delivered_at) BETWEEN COALESCE(?, CURDATE() - INTERVAL 13 DAY) AND COALESCE(?, CURDATE())`,
    [...s.params, req.query.from || null, req.query.to || null]);
  const routes = new Map();
  for (const l of rows) {
    const key = `${l.origin_code}>${l.dest_code}`;
    if (!routes.has(key)) routes.set(key, { origin: l.origin_name, destination: l.dest_name, dest_type: l.dest_type,
      loads: 0, tonnes_out: 0, tonnes_in: 0, trip_total: 0, on_time: 0,
      expected_min: geo.tripMinutes({ lat: l.origin_lat, lng: l.origin_lng }, { lat: l.dest_lat, lng: l.dest_lng }) });
    const r = routes.get(key);
    const trip = (toDate(l.delivered_at) - toDate(l.departed_at)) / 60000;
    r.loads += 1; r.tonnes_out += l.net_out || 0; r.tonnes_in += l.net_in || 0; r.trip_total += trip;
    if (trip <= r.expected_min * 1.15) r.on_time += 1;
  }
  const out = [...routes.values()].map((r) => ({
    origin: r.origin, destination: r.destination, dest_type: r.dest_type, loads: r.loads,
    tonnes_out: +r.tonnes_out.toFixed(1), tonnes_in: +r.tonnes_in.toFixed(1),
    variance_pct: r.tonnes_out ? +(((r.tonnes_out - r.tonnes_in) / r.tonnes_out) * 100).toFixed(2) : 0,
    avg_trip_min: Math.round(r.trip_total / r.loads), expected_min: r.expected_min,
    on_time_pct: Math.round((r.on_time / r.loads) * 100)
  })).sort((a, b) => b.tonnes_in - a.tonnes_in);
  res.json({ routes: out });
}));

// ---------- errors ----------
router.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. Check the server log.' });
});

module.exports = router;
