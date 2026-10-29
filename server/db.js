// MySQL connection pool (works with MySQL 8 and MariaDB, including XAMPP)
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hauldesk',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,         // return 'YYYY-MM-DD HH:MM:SS' strings in local time
  decimalNumbers: true       // return DECIMAL columns as numbers
});

// Small helper: run a query and return the rows
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

module.exports = { pool, query };
