const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dbPath = path.resolve(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'comsystem.db'));
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookroom (
      row_id INTEGER PRIMARY KEY AUTOINCREMENT,
      datereg TEXT,
      subject TEXT,
      perhead TEXT,
      numper TEXT,
      passenger TEXT,
      tel TEXT,
      room_id INTEGER DEFAULT 0,
      datemeet TEXT,
      s_time TEXT,
      e_time TEXT,
      equip TEXT DEFAULT '',
      food TEXT DEFAULT '',
      memo TEXT DEFAULT '',
      memo1 TEXT DEFAULT '',
      perbook TEXT DEFAULT '',
      b_status INTEGER DEFAULT 0,
      from_ip TEXT DEFAULT '',
      unit_out TEXT DEFAULT '',
      unit_id INTEGER DEFAULT 0,
      start_km INTEGER DEFAULT NULL,
      stop_km INTEGER DEFAULT NULL,
      sum_km INTEGER DEFAULT NULL,
      pricefixing REAL DEFAULT 0,
      bill_oil TEXT DEFAULT '',
      user_id INTEGER DEFAULT 0,
      d_update TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_bookroom_datemeet ON bookroom(datemeet);
    CREATE INDEX IF NOT EXISTS idx_bookroom_status ON bookroom(b_status);
    CREATE INDEX IF NOT EXISTS idx_bookroom_room ON bookroom(room_id);
    CREATE INDEX IF NOT EXISTS idx_bookroom_unit ON bookroom(unit_id);
    CREATE INDEX IF NOT EXISTS idx_bookroom_perbook ON bookroom(perbook);

    CREATE TABLE IF NOT EXISTS room (
      row_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      score REAL DEFAULT 0,
      place TEXT DEFAULT '',
      numper TEXT DEFAULT '0',
      regis_date TEXT,
      tax_date TEXT,
      number_packaging TEXT DEFAULT '',
      car_no TEXT DEFAULT '',
      machine_no TEXT DEFAULT '',
      brand TEXT DEFAULT '',
      price INTEGER DEFAULT 0,
      owner_id INTEGER DEFAULT 0,
      tel TEXT DEFAULT '',
      memo TEXT DEFAULT '',
      picture TEXT DEFAULT '',
      from_ip TEXT DEFAULT '',
      thecarcare TEXT DEFAULT '',
      from_user INTEGER DEFAULT 0,
      d_update TEXT
    );

    CREATE TABLE IF NOT EXISTS equip (
      row_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      tel TEXT DEFAULT '',
      d_update TEXT
    );

    CREATE TABLE IF NOT EXISTS unit_all (
      row_id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_code TEXT DEFAULT '',
      unit_name TEXT NOT NULL,
      unit_head TEXT DEFAULT '',
      unit_head_position TEXT DEFAULT '',
      unit_head_level TEXT DEFAULT '',
      tel TEXT DEFAULT '',
      note TEXT DEFAULT '',
      hcode TEXT DEFAULT '',
      d_update TEXT
    );

    CREATE TABLE IF NOT EXISTS personaldata (
      row_id INTEGER PRIMARY KEY AUTOINCREMENT,
      personalid TEXT DEFAULT '',
      title TEXT DEFAULT '',
      fname TEXT NOT NULL,
      lname TEXT DEFAULT '',
      telephone TEXT DEFAULT '',
      unit_id INTEGER DEFAULT 0,
      usertype TEXT DEFAULT 'user',
      puchai TEXT NOT NULL UNIQUE,
      rahuspan TEXT NOT NULL,
      from_ip TEXT DEFAULT '',
      from_user TEXT DEFAULT '',
      d_update TEXT
    );
  `);
}

function seedDefaultsIfEmpty() {
  const userCount = db.prepare('SELECT COUNT(*) AS cnt FROM personaldata').get().cnt;
  if (userCount === 0) {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    db.prepare(`
      INSERT INTO personaldata (title, fname, lname, telephone, unit_id, usertype, puchai, rahuspan, d_update)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('นาย', 'ผู้ดูแลระบบ', 'โรงพยาบาล', '211', 1, 'adminn', 'admin', 'admin', now);
  }
}

initSchema();
seedDefaultsIfEmpty();

module.exports = db;
