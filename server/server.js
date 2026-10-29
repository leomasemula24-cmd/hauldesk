// HaulDesk server: serves the web app and the API
require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const api = require('./api');

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'hauldesk-dev-only-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 }   // one working shift
}));

app.use('/api', api);
app.use(express.static(path.join(__dirname, '..', 'public')));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`HaulDesk is running at http://localhost:${port}`);
  console.log('Sign in as "coordinator" with password "demo1234".');
});
