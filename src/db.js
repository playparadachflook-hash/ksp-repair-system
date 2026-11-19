const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '192.168.2.254',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'opd',
  password: process.env.DB_PASSWORD || 'opd',
  database: process.env.DB_NAME || 'comsystem',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
  charset: 'utf8mb4',
});

(async function ensureColumns() {
  try {
    const [cols] = await pool.query("SHOW COLUMNS FROM bookroom LIKE 'assigned_to'");
    if (!cols.length) {
      await pool.query("ALTER TABLE bookroom ADD COLUMN assigned_to VARCHAR(255) NULL DEFAULT ''");
    }
  } catch (err) {
    console.warn('ensureColumns (comsystem):', err.message);
  }
})();

async function all(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function get(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows[0] || null;
}

async function run(sql, params = []) {
  const [res] = await pool.query(sql, params);
  return { lastInsertRowid: res.insertId, changes: res.affectedRows };
}

module.exports = { pool, query: all, all, get, run };
