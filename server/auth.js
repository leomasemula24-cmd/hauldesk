// Login, sessions and the rules for who may see and change what
const bcrypt = require('bcryptjs');
const { query } = require('./db');

async function login(username, password) {
  const rows = await query('SELECT * FROM users WHERE username = ?', [username]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return null;
  delete user.password_hash;
  return user;
}

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Please sign in.' });
  next();
}

function allow(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).json({ error: 'Your role does not have access to this.' });
    }
    next();
  };
}

/*
 * Each role sees only its own part of the operation:
 *  - coordinator: everything
 *  - client:      loads leaving or arriving at their division's sites
 *  - supplier:    loads carried by their haulage company
 *  - driver:      loads assigned to them
 * Returns a SQL condition for queries that join loads l, sites o (origin) and sites d (destination).
 */
function loadScope(user) {
  switch (user.role) {
    case 'coordinator': return { sql: '1=1', params: [] };
    case 'client':      return { sql: '(o.division = ? OR d.division = ?)', params: [user.division, user.division] };
    case 'supplier':    return { sql: 'l.haulier_id = ?', params: [user.haulier_id] };
    case 'driver':      return { sql: 'l.driver_id = ?', params: [user.driver_id] };
    default:            return { sql: '1=0', params: [] };
  }
}

module.exports = { login, requireLogin, allow, loadScope };
