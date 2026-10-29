/*
 * Fictitious sample data for HaulDesk, generated the same way every time.
 *
 * Used in two places:
 *   - scripts/generate-data.js turns it into SQL for MySQL (npm run db:setup)
 *   - demo mode builds it in the browser, so no data files need to be stored
 *
 * Times are relative markers resolved later: D:<days from today> for dates,
 * d:<minutes from today's midnight> and n:<minutes from now> for date-times.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./geo.js'));
  else root.HaulSampleData = factory(root.HaulGeo);
})(typeof self !== 'undefined' ? self : this, function (geo) {
  function generate() {
    // ---------- deterministic random numbers, so every run gives the same data ----------
    let seed = 20240715;
    function rand() {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    const between = (a, b) => a + rand() * (b - a);
    const int = (a, b) => Math.floor(between(a, b + 1));
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const chance = (p) => rand() < p;
    const round = (n, d = 2) => +n.toFixed(d);
    const pad = (n, w) => String(n).padStart(w, '0');

    // Relative time markers: D:<days> for dates, d:<minutes from midnight today>, n:<minutes from now>
    const day = (days) => `D:${days}`;
    const atDay = (days, minutes) => `d:${days * 1440 + Math.round(minutes)}`;
    const fromNow = (minutes) => `n:${Math.round(minutes)}`;

    // ---------- reference data: one client, Tsela Group, with three divisions ----------
    const sites = [
      { code: 'MAB', name: 'Mabaleng Colliery',        site_type: 'mine',          division: 'Tsela Mining',      lat: -26.120, lng: 29.380, product: 'RoM coal' },
      { code: 'RDG', name: 'Ridgeback Colliery',       site_type: 'mine',          division: 'Tsela Mining',      lat: -25.950, lng: 29.150, product: 'Washed coal' },
      { code: 'KWN', name: 'Kwena Colliery',           site_type: 'mine',          division: 'Tsela Mining',      lat: -26.350, lng: 29.600, product: 'RoM coal' },
      { code: 'LKG', name: 'Lekgotla Colliery',        site_type: 'mine',          division: 'Tsela Mining',      lat: -26.050, lng: 29.800, product: 'Duff coal' },
      { code: 'PHK', name: 'Phokeng Power Station',    site_type: 'power_station', division: 'Tsela Power',       lat: -26.280, lng: 29.100 },
      { code: 'SBK', name: 'Seboka Power Station',     site_type: 'power_station', division: 'Tsela Power',       lat: -25.800, lng: 29.450 },
      { code: 'MRW', name: 'Morwa Power Station',      site_type: 'power_station', division: 'Tsela Power',       lat: -26.550, lng: 29.250 },
      { code: 'NTS', name: 'Ntsu Rail Siding',         site_type: 'rail_siding',   division: 'Tsela Rail & Port', lat: -26.200, lng: 29.950 },
      { code: 'KGT', name: 'Kgotso Rail Siding',       site_type: 'rail_siding',   division: 'Tsela Rail & Port', lat: -25.880, lng: 29.700 },
      { code: 'TBT', name: 'Tsela Bay Coal Terminal',  site_type: 'harbour',       division: 'Tsela Rail & Port', lat: -28.780, lng: 32.030 }
    ].map((s, i) => ({ id: i + 1, ...s }));
    const mines = sites.filter((s) => s.site_type === 'mine');
    const powerStations = sites.filter((s) => s.site_type === 'power_station');
    const sidings = sites.filter((s) => s.site_type === 'rail_siding');
    const harbour = sites.find((s) => s.site_type === 'harbour');

    const hauliers = [
      { name: 'Mokoena Haulage',      contact_name: 'Sipho Mokoena',   phone: '013 555 0141', email: 'ops@mokoena-haulage.example' },
      { name: 'Ntsako Logistics',     contact_name: 'Ntsako Baloyi',   phone: '013 555 0172', email: 'dispatch@ntsako-logistics.example' },
      { name: 'Red Earth Transport',  contact_name: 'Johan Pretorius', phone: '017 555 0118', email: 'control@redearth.example' },
      { name: 'Thaba Freight',        contact_name: 'Lerato Thaba',    phone: '013 555 0190', email: 'lerato@thabafreight.example' },
      { name: 'Swift Bulk Carriers',  contact_name: 'Ayesha Patel',    phone: '011 555 0155', email: 'fleet@swiftbulk.example' }
    ].map((h, i) => ({ id: i + 1, ...h }));

    // Fictitious tracking providers: each haulier uses a different system
    const trackers = ['TrackLine', 'FleetEye', 'RouteSat', 'CamGuard'];

    const firstNames = ['Themba', 'Bongani', 'Lucky', 'Sello', 'Mandla', 'Kabelo', 'Tshepo', 'Vusi', 'Jabu', 'Neo', 'Sizwe', 'Thabo',
      'Mpho', 'Karabo', 'Lwazi', 'Andile', 'Musa', 'Pule', 'Tumelo', 'Kgosi', 'Zanele', 'Nomsa', 'Palesa', 'Busisiwe', 'Willem',
      'Pieter', 'Daniel', 'Ruan', 'Godfrey', 'Elias', 'Isaac', 'Simon'];
    const lastNames = ['Dlamini', 'Nkosi', 'Mahlangu', 'Sithole', 'Mokoena', 'Mabuza', 'Khumalo', 'Ngwenya', 'Mthembu', 'Masilela',
      'Shabangu', 'Zulu', 'Maseko', 'Radebe', 'Botha', 'Venter', 'Mathebula', 'Chauke', 'Molefe', 'Tau'];

    const drivers = [];
    for (let i = 0; i < 32; i++) {
      const h = hauliers[i % hauliers.length];
      const nearLicence = i === 3 || i === 17;          // a couple of renewals due soon
      const expiredPrdp = i === 9;                       // one permit already expired
      drivers.push({
        id: i + 1,
        full_name: `${firstNames[i]} ${pick(lastNames)}`,
        haulier_id: h.id,
        phone: `07${int(1, 9)} 555 ${pad(int(0, 9999), 4)}`,
        licence_no: `${pad(int(1000, 9999), 4)}${pad(int(10000, 99999), 5)}XY`,
        licence_expiry: day(nearLicence ? int(5, 25) : int(60, 1400)),
        prdp_expiry: day(expiredPrdp ? -4 : (i === 22 ? int(8, 20) : int(45, 700))),
        active: 1
      });
    }

    const letters = 'BCDFGHJKLMNPRSTVWXYZ';
    const vehicles = [];
    for (let i = 0; i < 30; i++) {
      const h = hauliers[i % hauliers.length];
      vehicles.push({
        id: i + 1,
        registration: `${letters[int(0, 19)]}${letters[int(0, 19)]}${letters[int(0, 19)]} ${pad(int(100, 999), 3)} MP`,
        haulier_id: h.id,
        tracker_provider: trackers[(h.id - 1) % trackers.length],
        capacity_t: i % 6 === 0 ? 30.0 : 34.0,
        licence_disc_expiry: day(i === 5 || i === 21 ? int(3, 20) : (i === 12 ? -2 : int(40, 330))),
        home_site_id: pick(mines).id,
        active: 1
      });
    }

    // ---------- users (all passwords: demo1234) ----------
    const users = [
      { username: 'coordinator', full_name: 'Thandi Nkosi',   role: 'coordinator' },
      { username: 'tselapower',  full_name: 'Kagiso Molefe',  role: 'client', division: 'Tsela Power' },
      { username: 'tselarail',   full_name: 'Naledi Dube',    role: 'client', division: 'Tsela Rail & Port' },
      { username: 'tselamining', full_name: 'Pieter van Wyk', role: 'client', division: 'Tsela Mining' },
      { username: 'mokoena',     full_name: 'Sipho Mokoena',  role: 'supplier', haulier_id: 1 },
      { username: 'driver',      full_name: drivers[0].full_name, role: 'driver', haulier_id: 1, driver_id: 1 }
    ].map((u, i) => ({ id: i + 1, division: null, haulier_id: null, driver_id: null, ...u }));

    // ---------- loads ----------
    function chooseDestination() {
      const r = rand();
      if (r < 0.62) return pick(powerStations);
      if (r < 0.92) return pick(sidings);
      return harbour;
    }
    const vehiclesOf = (hid) => vehicles.filter((v) => v.haulier_id === hid);
    const driversOf = (hid) => drivers.filter((d) => d.haulier_id === hid);

    const loads = [];
    const tickets = [];
    let loadSeq = 24100, ticketSeq = 51000;

    function addTickets(load, origin, dest, departedMarker, deliveredMarker, vehicle, variance) {
      const tare = round(between(15.4, 17.6));
      const netOut = round(Math.min(vehicle.capacity_t, load.planned_tonnes) - between(0, 1.1));
      tickets.push({ ticket_no: `WO-${++ticketSeq}`, load_no: load.load_no, site_id: origin.id, direction: 'out',
        gross_t: round(tare + netOut), tare_t: tare, weighed_at: shift(departedMarker, -12) });
      if (deliveredMarker) {
        const loss = variance ? between(0.016, 0.042) : between(0, 0.0035);
        const netIn = round(netOut * (1 - loss));
        tickets.push({ ticket_no: `WI-${++ticketSeq}`, load_no: load.load_no, site_id: dest.id, direction: 'in',
          gross_t: round(tare + netIn), tare_t: tare, weighed_at: shift(deliveredMarker, 8) });
      }
    }
    function shift(marker, minutes) {
      const [b, v] = marker.split(':');
      return `${b}:${+v + minutes}`;
    }

    const varianceLoads = [];
    for (let d = -14; d <= 2; d++) {
      const count = d === 0 ? 24 : int(18, 26);
      // keep trucks busy on one job at a time today
      const busyToday = new Set();
      for (let i = 0; i < count; i++) {
        const origin = pick(mines);
        const dest = chooseDestination();
        const forDemoDriver = d === 0 && i === 18;          // the demo driver always has a load waiting today
        const h = forDemoDriver ? hauliers[0] : pick(hauliers);
        let vehicle = pick(vehiclesOf(h.id));
        if (d === 0) {
          const free = vehiclesOf(h.id).filter((v) => !busyToday.has(v.id));
          vehicle = free.length ? pick(free) : vehicle;
        }
        const driver = forDemoDriver ? drivers[0] : pick(driversOf(h.id));
        const trip = geo.tripMinutes(origin, dest);
        const load = {
          load_no: `LD-${++loadSeq}`,
          origin_site_id: origin.id, destination_site_id: dest.id, haulier_id: h.id,
          vehicle_id: vehicle.id, driver_id: driver.id,
          product: origin.product, planned_tonnes: round(vehicle.capacity_t - between(0, 1.5)),
          planned_date: day(d), status: 'planned',
          loaded_at: null, departed_at: null, delivered_at: null, notes: null
        };

        if (d < 0) {
          if (chance(0.03)) {
            load.status = 'cancelled';
            load.notes = pick(['Mine loader breakdown', 'Destination stockyard full', 'Truck reassigned to urgent load']);
            load.vehicle_id = null; load.driver_id = null;
          } else {
            const start = between(300, Math.max(360, 1440 - trip * 1.3 - 120));
            load.status = 'delivered';
            const depart = start + int(30, 70);
            load.loaded_at = atDay(d, start);
            load.departed_at = atDay(d, depart);
            load.delivered_at = atDay(d, depart + trip * between(0.88, 1.2));
            const variance = chance(0.035);
            if (variance) varianceLoads.push(load.load_no);
            addTickets(load, origin, dest, load.departed_at, load.delivered_at, vehicle, variance);
          }
        } else if (d === 0) {
          if (i < 8) {                                   // delivered earlier today
            const ago = between(20, 420);
            load.status = 'delivered';
            load.delivered_at = fromNow(-ago);
            load.departed_at = fromNow(-ago - trip * between(0.95, 1.15));
            load.loaded_at = fromNow(-ago - trip - int(35, 70));
            addTickets(load, origin, dest, load.departed_at, load.delivered_at, vehicle, i === 2);
            if (i === 2) varianceLoads.push(load.load_no);
          } else if (i < 15) {                           // on the road now
            load.status = 'in_transit';
            const into = between(0.1, 0.85) * trip;
            load.departed_at = fromNow(-into);
            load.loaded_at = fromNow(-into - int(30, 60));
            if (i === 14) { load.departed_at = fromNow(-trip * 1.5); load.loaded_at = fromNow(-trip * 1.5 - 40); load.notes = 'Running late'; }
            addTickets(load, origin, dest, load.departed_at, null, vehicle, false);
            busyToday.add(vehicle.id);
          } else if (i < 18) {                           // at the mine being loaded
            load.status = 'loading';
            load.loaded_at = fromNow(-int(5, 35));
            busyToday.add(vehicle.id);
          }                                              // the rest stay planned
        } else if (chance(0.3)) {
          load.vehicle_id = null; load.driver_id = null; // not yet allocated
        }
        loads.push(load);
      }
    }

    // ---------- stockpiles: daily readings for the last 15 days ----------
    const stockpiles = [];
    for (const s of sites) {
      const product = s.product || 'RoM coal';
      let level = s.site_type === 'mine' ? between(45000, 120000)
        : s.site_type === 'power_station' ? between(180000, 420000)
        : s.site_type === 'harbour' ? between(450000, 800000) : between(6000, 22000);
      const drift = s.site_type === 'power_station' && s.code === 'MRW' ? -0.025 : 0;   // one station running low
      for (let d = -14; d <= 0; d++) {
        level *= 1 + drift + between(-0.03, 0.03);
        stockpiles.push({ site_id: s.id, product, reading_date: day(d), tonnes: round(level, 1) });
      }
    }

    // ---------- document register ----------
    const documents = [];
    let docSeq = 3100;
    const delivered = loads.filter((l) => l.status === 'delivered');
    for (let i = 0; i < 26; i++) {
      const l = delivered[int(0, delivered.length - 1)];
      const d = +l.planned_date.split(':')[1];
      documents.push({ doc_no: `DOC-${++docSeq}`, title: `Delivery note ${l.load_no}`, category: 'Delivery note',
        load_no: l.load_no, site_id: l.destination_site_id, haulier_id: l.haulier_id,
        storage_ref: `DMS/Deliveries/${pad(int(1, 12), 2)}`, created_on: day(d), retain_until: day(d + 1825) });
    }
    for (let i = 0; i < 14; i++) {
      const l = delivered[int(0, delivered.length - 1)];
      const d = +l.planned_date.split(':')[1];
      documents.push({ doc_no: `DOC-${++docSeq}`, title: `Weighbridge printout ${l.load_no}`, category: 'Weighbridge ticket',
        load_no: l.load_no, site_id: l.origin_site_id, haulier_id: l.haulier_id,
        storage_ref: `Archive Box ${int(10, 40)}`, created_on: day(d), retain_until: day(d + 1825) });
    }
    hauliers.forEach((h) => {
      const signed = -int(200, 1500);
      documents.push({ doc_no: `DOC-${++docSeq}`, title: `Haulage contract: ${h.name}`, category: 'Contract',
        load_no: null, site_id: null, haulier_id: h.id, storage_ref: `Legal/Contracts/${h.id}`,
        created_on: day(signed), retain_until: day(signed + 2555) });
      const permit = -int(30, 330);
      documents.push({ doc_no: `DOC-${++docSeq}`, title: `Operating permit: ${h.name}`, category: 'Permit',
        load_no: null, site_id: null, haulier_id: h.id, storage_ref: `Compliance/Permits/${h.id}`,
        created_on: day(permit), retain_until: day(permit + 365) });
      for (let m = 1; m <= 2; m++) {
        documents.push({ doc_no: `DOC-${++docSeq}`, title: `Invoice ${h.name.split(' ')[0].toUpperCase()}-${pad(int(1000, 9999), 4)}`,
          category: 'Invoice', load_no: null, site_id: null, haulier_id: h.id, storage_ref: `Finance/Invoices/${pad(m, 2)}`,
          created_on: day(-m * 30), retain_until: day(-m * 30 + 1825) });
      }
    });
    vehicles.filter((_, i) => i % 3 === 0).forEach((v) => {
      const on = -int(5, 300);
      documents.push({ doc_no: `DOC-${++docSeq}`, title: `Roadworthiness inspection ${v.registration}`, category: 'Inspection report',
        load_no: null, site_id: v.home_site_id, haulier_id: v.haulier_id, storage_ref: `Fleet/Inspections/${v.id}`,
        created_on: day(on), retain_until: day(on + 730) });
    });
    // a few old records now due for disposal review
    for (let i = 0; i < 3; i++) {
      documents.push({ doc_no: `DOC-${++docSeq}`, title: `Delivery notes bundle Q${i + 1} (archived)`, category: 'Delivery note',
        load_no: null, site_id: pick(powerStations).id, haulier_id: null, storage_ref: `Archive Box ${int(1, 9)}`,
        created_on: day(-1825 - int(0, 20)), retain_until: day(int(-10, 25)) });
    }

    // ---------- issues ----------
    const issues = [];
    let issueSeq = 0;
    const byNo = Object.fromEntries(loads.map((l) => [l.load_no, l]));
    const vehicleOf = (l) => vehicles.find((v) => v.id === l.vehicle_id);
    const siteName = (id) => sites.find((s) => s.id === id).name;
    function addIssue(o) {
      issues.push({ ref: `IS-${pad(++issueSeq, 4)}`, priority: 'medium', status: 'open', load_no: null, vehicle_id: null,
        reported_by: 1, description: null, resolution: null, resolved_at: null, ...o });
    }
    varianceLoads.forEach((no) => {
      const l = byNo[no];
      const d = +l.planned_date.split(':')[1];
      const recent = d === 0;
      addIssue({ title: `Net mass variance on ${no}`, category: 'Weighbridge', priority: 'high', load_no: no, vehicle_id: l.vehicle_id,
        description: `Weigh-in at ${siteName(l.destination_site_id)} is more than 1.5% below the weigh-out at ${siteName(l.origin_site_id)}.`,
        status: recent ? 'open' : 'resolved', created_at: recent ? fromNow(-60) : atDay(d, 1200),
        resolution: recent ? null : pick(['Weighbridge recalibrated at destination; mass confirmed within tolerance.',
          'Spillage confirmed on route; haulier charged for the shortfall.', 'Tarpaulin not secured; driver retrained.']),
        resolved_at: recent ? null : atDay(d + 1, 600) });
    });
    const transit = loads.filter((l) => l.status === 'in_transit');
    const late = transit.find((l) => l.notes === 'Running late');
    addIssue({ title: `${vehicleOf(late).registration} running well behind schedule`, category: 'Delay', priority: 'high',
      load_no: late.load_no, vehicle_id: late.vehicle_id, status: 'in_progress', created_at: fromNow(-50),
      description: 'Truck has not reached the destination and is past its expected arrival time. Haulier contacted.' });
    addIssue({ title: `No signal from ${vehicleOf(transit[0]).tracker_provider} unit on ${vehicleOf(transit[0]).registration}`, category: 'Tracking offline',
      priority: 'medium', load_no: transit[0].load_no, vehicle_id: transit[0].vehicle_id, reported_by: 5, created_at: fromNow(-35),
      description: 'Tracking unit stopped reporting for over 40 minutes. Position shown is estimated from the route.' });
    addIssue({ title: 'Long queue at Ntsu Rail Siding tippler', category: 'Delay', priority: 'medium', created_at: fromNow(-95),
      reported_by: 3, description: 'Trucks waiting more than 2 hours to offload. Siding team reports one tippler down.' });
    addIssue({ title: 'Driver permit not on gate list at Seboka', category: 'Site access', priority: 'low', reported_by: 6,
      created_at: fromNow(-180), status: 'in_progress', description: 'Security could not find the driver on the approved list.' });
    const pastTemplates = [
      ['Tyre burst on route to Phokeng', 'Breakdown', 'Replacement truck sent; load transferred and delivered.'],
      ['Loader breakdown at Kwena Colliery', 'Delay', 'Loader repaired after 3 hours; loads rescheduled to the afternoon.'],
      ['Coal spillage at Lekgotla loading bay', 'Safety', 'Area cleaned and barricaded; loading procedure reissued.'],
      ['Weighbridge printer offline at Ridgeback', 'Weighbridge', 'Printer replaced; tickets captured manually and reconciled.'],
      ['CamGuard dashboard not loading', 'Tracking offline', 'Provider restored service; positions back-filled.'],
      ['Gate access cards expired for Thaba Freight drivers', 'Site access', 'Cards renewed with site security.'],
      ['Overweight load stopped at weighbridge', 'Weighbridge', 'Excess offloaded at mine; driver reminded of limits.'],
      ['Engine overheating near Morwa', 'Breakdown', 'Truck towed; load recovered by second truck.'],
      ['Harbour slot missed due to rain delays', 'Delay', 'New slot booked for next morning with terminal planner.'],
      ['Speeding alert on RouteSat for Swift Bulk truck', 'Safety', 'Haulier issued written warning to driver.'],
      ['Stockyard full at Seboka, trucks turned away', 'Delay', 'Loads diverted to Phokeng for two days.'],
      ['Wrong product loaded at Mabaleng', 'Other', 'Load returned and replaced; checklist updated.']
    ];
    pastTemplates.forEach(([title, category, resolution], i) => {
      const d = -int(1, 13);
      addIssue({ title, category, priority: pick(['low', 'medium', 'high']), status: 'resolved', resolution,
        reported_by: pick([1, 1, 2, 3, 4, 5, 6]), created_at: atDay(d, int(360, 1080)), resolved_at: atDay(d, int(1100, 1400)),
        vehicle_id: chance(0.5) ? pick(vehicles).id : null });
    });
    issues.sort((a, b) => markerValue(a.created_at) - markerValue(b.created_at));
    issues.forEach((it, i) => { it.ref = `IS-${pad(i + 1, 4)}`; });
    function markerValue(m) { const [b, v] = m.split(':'); return b === 'n' ? +v + 1e6 : +v; }


    const loadIdByNo = Object.fromEntries(loads.map((l, i) => [l.load_no, i + 1]));
    loads.forEach((l, i) => { l.id = i + 1; });
    tickets.forEach((t, i) => { t.id = i + 1; t.load_id = loadIdByNo[t.load_no]; });
    documents.forEach((d, i) => { d.id = i + 1; d.load_id = d.load_no ? loadIdByNo[d.load_no] : null; });
    issues.forEach((it, i) => { it.id = i + 1; it.load_id = it.load_no ? loadIdByNo[it.load_no] : null; });
    stockpiles.forEach((s, i) => { s.id = i + 1; });

    return { sites, hauliers, drivers, vehicles, users, loads, tickets, stockpiles, documents, issues };
  }
  return { generate: generate };
});
