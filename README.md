# HaulDesk

**An in-house transport management system for coordinating coal haulage**, from mines to power stations, rail sidings and a harbour terminal.

HaulDesk is a portfolio project. I built it around problems I dealt with every day as a Data and Fleet Administrator, where I supported an in-house transport management system and coordinated coal deliveries between mines, a power utility, a rail and port operator, hauliers and drivers. The client, people and data in this project are fictitious, but the problems are real.

> **Try the live demo:** **https://leomasemula24-cmd.github.io/hauldesk/**
> Sign in with any of the demo accounts below. The password for all of them is `demo1234`. The online demo runs in your browser with fictitious data, so nothing you change is saved.

---

## The problems it solves

| What made the job hard | What HaulDesk does |
| --- | --- |
| Trucks reported through **several different tracking platforms**, so finding a truck meant checking one system after another. | **One live map** shows every truck, whichever provider it uses, with each trip’s progress and expected arrival. Late trucks are flagged in red. |
| Coal sometimes **arrived lighter than it left**, and nobody noticed until month-end reconciliation. | Every load is **weighed out at the mine and weighed in at the destination**. If it arrives more than 1.5% short, HaulDesk **raises a high-priority issue automatically**. |
| Clients, hauliers and drivers each called the coordinator for updates. | **Role-based logins**: each person sees only their own part of the operation, live. |
| Driver licences, permits and truck licence discs expired without warning. | A **compliance list** puts anything expiring in the next 30 days at the top. |
| Paper records were hard to find and nobody knew when they could be destroyed. | A **document register** shows where every record is filed and when it is due for disposal review. |
| Stock at a power station could run low before anyone reacted. | **Stockpile trends** per site, with falling stock highlighted. |

## Who uses it

The system serves one fictitious client, **Tsela Group**, whose divisions each need something different:

| Role | Demo login | Sees and does |
| --- | --- | --- |
| Transport coordinator | `coordinator` | Everything: plans loads, allocates trucks, follows deliveries, resolves issues, runs reports |
| Client: Tsela Power | `tselapower` | Deliveries to its power stations, stockpiles, weighbridge results, reports (read-only) |
| Client: Tsela Rail & Port | `tselarail` | Deliveries to its rail sidings and the harbour terminal |
| Client: Tsela Mining | `tselamining` | Loads dispatched from its collieries |
| Haulier (transport supplier) | `mokoena` | Its own loads and trucks: allocates a truck and driver to each load, keeps licences current |
| Driver | `driver` | Their own loads only: start loading, weigh out and depart, weigh in on arrival, report a problem |

## Features

- **Today dashboard:** loads planned, being loaded, on the road and delivered; tonnes delivered; a 14-day tonnage chart; and a "needs attention" list of late trucks, open issues and expiring permits.
- **Dispatch board:** loads in four lanes (planned, loading, on the road, delivered). Each load moves forward with a button press, and weighbridge masses are captured on departure and arrival.
- **Live map:** every truck and site on an OpenStreetMap map, filterable by tracking provider, refreshing every 30 seconds.
- **Weighbridge reconciliation:** out versus in for every load, overall loss in transit, flagged loads, CSV export.
- **Stockpiles:** current stock and two-week trend for each mine, power station, siding and the harbour.
- **Drivers and trucks:** licence, professional driving permit and licence disc expiry, with anything due in the next 30 days first.
- **Document register:** search by title, number or archive location, filter by category, and find records due for disposal review.
- **Issues:** anyone can report a breakdown, delay or other problem; the coordinator tracks and resolves it, recording what was done.
- **Route report:** tonnes, loss in transit, average trip time and on-time percentage per route, with CSV export.

## Built with

All free and open source:

- **HTML, CSS and JavaScript** for the interface, with no framework and no build step
- **Node.js and Express** for the server and REST API
- **MySQL** (or MariaDB, as included in XAMPP) for the database
- **Chart.js** for charts, **Leaflet** with **OpenStreetMap** for the map (no API keys needed)
- **bcrypt** for password hashing and **express-session** for sign-in sessions

## Run it on your computer

You need **Node.js 18 or newer** and **MySQL**. The easiest way to get MySQL on Windows is **XAMPP**: open the XAMPP Control Panel and start the **MySQL** module.

```bash
# 1. Get the code and install the dependencies
git clone https://github.com/leomasemula24-cmd/hauldesk.git
cd hauldesk
npm install

# 2. Tell HaulDesk how to reach MySQL
cp .env.example .env        # on Windows: copy .env.example .env
#    XAMPP defaults (user root, no password) already work.

# 3. Create the database and load the sample data
npm run db:setup

# 4. Start the app
npm start
```

Then open **http://localhost:3000** and sign in as `coordinator` with password `demo1234`.

The sample data's dates are relative to the day you load it, so there are always trucks on the road "today". Run `npm run db:setup` again at any time to reset it.

### Online demo without a server

Open `public/index.html` from any static web host (such as GitHub Pages) and HaulDesk switches to **demo mode**. The live demo linked above is published this way by `.github/workflows/pages.yml`. It runs the same rules in the browser against the same fictitious data, so people can try it without installing anything. Changes made in demo mode reset when the page is reloaded.

## How it is organised

```
database/
  schema.sql            tables, keys and indexes
scripts/
  generate-data.js      turns the sample data into SQL (npm run data:generate writes database/seed.sql)
  setup-db.js           creates the database and loads the sample data (npm run db:setup)
server/
  server.js             Express app: serves the pages and the API
  api.js                REST API: loads, tracking, weighbridge, stockpiles, fleet, documents, issues, reports
  auth.js               sign-in and the rules for which role may see and change what
  db.js                 MySQL connection pool
public/
  index.html            the single page
  css/style.css         all styles
  js/app.js             sign-in, navigation by role, page routing
  js/api.js             talks to the server, or switches to demo mode if there is none
  js/views/*.js         one file per page
  js/lib/geo.js         route distance and position estimates, shared by server and browser
  js/lib/sample-data.js the fictitious sample data, shared by the database setup and demo mode
  js/demo-store.js      the API rules re-created in the browser for demo mode
```

## Design decisions

- **Access control lives on the server.** Every query is filtered by the signed-in user's role (`server/auth.js`), so a client or haulier cannot see another party's loads even by calling the API directly.
- **Changes that belong together happen together.** Departing or delivering a load records the status, the weighbridge ticket and any variance issue in one database transaction.
- **Status changes follow a fixed flow.** A load goes planned → loading → on the road → delivered. Drivers can only move their own loads forward, and a truck and driver must be allocated before loading starts.
- **One source of sample data.** The same generator fills MySQL and runs in the browser for the demo, so the two can never drift apart.
- **Positions are estimated when a tracker is silent.** A truck's position is worked out from its departure time, the route and an average speed, which is what you need when a tracking unit drops offline. A live provider feed would replace the estimate.

## What I would add next

- Connect real tracking providers through their APIs, replacing the estimated positions.
- Email or SMS alerts to the coordinator for late trucks and weighbridge variances.
- Scanned documents attached to the register, instead of only the archive location.
- Automated tests for the API.

---

Portfolio project by **Leonard Masemula**. Tsela Group, its divisions, the hauliers, people and all data are fictitious; any resemblance to real organisations is coincidental.
