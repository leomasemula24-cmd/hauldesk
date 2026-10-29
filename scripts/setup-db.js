// Creates the hauldesk database and loads the sample data:  npm run db:setup
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { buildSql } = require('./generate-data');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });
  process.stdout.write('Creating tables from database/schema.sql ... ');
  await conn.query(fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8'));
  console.log('done');
  process.stdout.write('Loading fictitious sample data ... ');
  const { sql, counts } = buildSql();
  await conn.query(sql);
  console.log(`done (${counts.loads} loads, ${counts.issues} issues)`);
  await conn.end();
  console.log('Database ready. Start the app with: npm start');
})().catch((e) => {
  console.error('\nCould not set up the database:', e.message);
  console.error('Check that MySQL is running (in XAMPP, start the MySQL module) and that .env has the right details.');
  process.exit(1);
});
