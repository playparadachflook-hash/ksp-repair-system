require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const db = require('./src/db');
const { generateRepairTicketPdf, generateRepairBoardPdf } = require('./src/pdf');

const app = express();
const PORT = Number(process.env.PORT || 3530);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'ksp-repair-system-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 12 },
  })
);

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Helper: current timestamp 'YYYY-MM-DD HH:MM:SS'
function nowSql() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.isAdmin) {
    return res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบ (ช่าง) เท่านั้น' });
  }
  next();
}

// ==================== AUTH ====================
app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'กรุณากรอก Username และ Password' });
  }
  const user = db
    .prepare('SELECT row_id, title, fname, lname, telephone, unit_id, usertype, puchai FROM personaldata WHERE puchai = ? AND rahuspan = ?')
    .get(String(username).trim(), String(password).trim());

  if (!user) {
    return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }

  const fullName = `${user.fname || ''} ${user.lname || ''}`.trim() || user.puchai;
  req.session.user = {
    row_id: user.row_id,
    username: user.puchai,
    fullName,
    unit_id: user.unit_id || 0,
    telephone: user.telephone || '',
    usertype: user.usertype || 'user',
    isAdmin: user.usertype === 'adminn',
  };
  res.json({ user: req.session.user });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// ==================== STATS & ECO ====================
app.get('/api/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS cnt FROM bookroom').get().cnt;
  const statusRows = db.prepare('SELECT b_status, COUNT(*) AS cnt FROM bookroom GROUP BY b_status').all();
  const counts = { 0: 0, 1: 0, 6: 0, 9: 0 };
  for (const r of statusRows) {
    counts[r.b_status] = r.cnt;
  }
  res.json({
    total,
    pending: counts[0] || 0,
    inProgress: counts[1] || 0,
    completed: counts[6] || 0,
    cancelled: counts[9] || 0,
    eco: {
      paper: total,
      baht: Number((total * 0.45).toFixed(2)),
      ghg: Number(((total * 0.8049) / 180).toFixed(3)),
    },
  });
});

// ==================== REPAIRS (bookroom) ====================
app.get('/api/repairs', (req, res) => {
  const { month, year, status, room_id, unit_id, date, q, mine, page = 1, limit = 50 } = req.query;
  const where = [];
  const params = [];

  if (date) {
    where.push('b.datemeet = ?');
    params.push(date);
  } else {
    if (year) {
      where.push("strftime('%Y', b.datemeet) = ?");
      params.push(String(year));
    }
    if (month && Number(month) > 0) {
      where.push("strftime('%m', b.datemeet) = ?");
      params.push(String(month).padStart(2, '0'));
    }
  }
  if (status !== undefined && status !== '') {
    where.push('b.b_status = ?');
    params.push(Number(status));
  }
  if (room_id) {
    where.push('b.room_id = ?');
    params.push(Number(room_id));
  }
  if (unit_id) {
    where.push('b.unit_id = ?');
    params.push(Number(unit_id));
  }
  if (mine === '1' && req.session.user) {
    where.push('(b.perbook = ? OR b.user_id = ?)');
    params.push(req.session.user.fullName, req.session.user.row_id);
  }
  if (q && q.trim()) {
    const like = `%${q.trim()}%`;
    where.push('(b.subject LIKE ? OR b.perhead LIKE ? OR b.numper LIKE ? OR b.perbook LIKE ? OR b.passenger LIKE ? OR CAST(b.row_id AS TEXT) LIKE ?)');
    params.push(like, like, like, like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = db.prepare(`SELECT COUNT(*) AS cnt FROM bookroom b ${whereSql}`).get(...params);

  const pageNum = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(limit) || 50));
  const offset = (pageNum - 1) * pageSize;

  const rows = db
    .prepare(
      `SELECT b.*, r.name AS room_name, u.unit_name AS unit_name
       FROM bookroom b
       LEFT JOIN room r ON r.row_id = b.room_id
       LEFT JOIN unit_all u ON u.row_id = b.unit_id
       ${whereSql}
       ORDER BY COALESCE(NULLIF(b.datemeet, ''), substr(b.datereg, 1, 10)) DESC, b.row_id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);

  const equips = db.prepare('SELECT row_id, name FROM equip').all();
  const equipMap = Object.fromEntries(equips.map((e) => [String(e.row_id), e.name]));

  const enriched = rows.map((row) => {
    const equipIds = (row.equip || '').split('|').filter(Boolean);
    const equipNames = equipIds.map((id) => equipMap[id] || id);
    return { ...row, equipIds, equipNames };
  });

  res.json({
    items: enriched,
    total: totalRow.cnt,
    page: pageNum,
    limit: pageSize,
    totalPages: Math.ceil(totalRow.cnt / pageSize) || 1,
  });
});

app.get('/api/repairs/board/pdf', (req, res) => {
  const { month, year, status, room_id, unit_id, q } = req.query;
  const where = [];
  const params = [];
  if (year) {
    where.push("strftime('%Y', b.datemeet) = ?");
    params.push(String(year));
  }
  if (month && Number(month) > 0) {
    where.push("strftime('%m', b.datemeet) = ?");
    params.push(String(month).padStart(2, '0'));
  }
  if (status !== undefined && status !== '') {
    where.push('b.b_status = ?');
    params.push(Number(status));
  }
  if (room_id) {
    where.push('b.room_id = ?');
    params.push(Number(room_id));
  }
  if (unit_id) {
    where.push('b.unit_id = ?');
    params.push(Number(unit_id));
  }
  if (q && q.trim()) {
    const like = `%${q.trim()}%`;
    where.push('(b.subject LIKE ? OR b.perhead LIKE ? OR b.numper LIKE ? OR b.perbook LIKE ?)');
    params.push(like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT b.*, r.name AS room_name, u.unit_name AS unit_name
       FROM bookroom b
       LEFT JOIN room r ON r.row_id = b.room_id
       LEFT JOIN unit_all u ON u.row_id = b.unit_id
       ${whereSql}
       ORDER BY b.datemeet DESC, b.row_id DESC
       LIMIT 200`
    )
    .all(...params);

  const equips = db.prepare('SELECT row_id, name FROM equip').all();
  const equipMap = Object.fromEntries(equips.map((e) => [String(e.row_id), e.name]));
  const items = rows.map((row) => {
    const equipIds = (row.equip || '').split('|').filter(Boolean);
    return { ...row, equipNames: equipIds.map((id) => equipMap[id] || id) };
  });

  const parts = [];
  if (year) parts.push(`ปี พ.ศ. ${Number(year) + 543}`);
  if (month && Number(month) > 0) parts.push(`เดือน ${month}`);
  parts.push(`จำนวน ${items.length} รายการ`);
  generateRepairBoardPdf(items, parts.join(' | '), res, req.query.download === '1');
});

app.get('/api/repairs/:id/pdf', (req, res) => {
  const row = db
    .prepare(
      `SELECT b.*, r.name AS room_name, u.unit_name AS unit_name
       FROM bookroom b
       LEFT JOIN room r ON r.row_id = b.room_id
       LEFT JOIN unit_all u ON u.row_id = b.unit_id
       WHERE b.row_id = ?`
    )
    .get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'ไม่พบข้อมูลใบแจ้งซ่อม' });

  const equips = db.prepare('SELECT row_id, name FROM equip').all();
  const equipMap = Object.fromEntries(equips.map((e) => [String(e.row_id), e.name]));
  const equipIds = (row.equip || '').split('|').filter(Boolean);
  const ticket = { ...row, equipIds, equipNames: equipIds.map((id) => equipMap[id] || id) };
  generateRepairTicketPdf(ticket, res, req.query.download === '1');
});

app.get('/api/repairs/:id', (req, res) => {
  const row = db
    .prepare(
      `SELECT b.*, r.name AS room_name, u.unit_name AS unit_name
       FROM bookroom b
       LEFT JOIN room r ON r.row_id = b.room_id
       LEFT JOIN unit_all u ON u.row_id = b.unit_id
       WHERE b.row_id = ?`
    )
    .get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'ไม่พบข้อมูลใบแจ้งซ่อม' });

  const equips = db.prepare('SELECT row_id, name FROM equip').all();
  const equipMap = Object.fromEntries(equips.map((e) => [String(e.row_id), e.name]));
  const equipIds = (row.equip || '').split('|').filter(Boolean);
  res.json({ ...row, equipIds, equipNames: equipIds.map((id) => equipMap[id] || id) });
});

app.post('/api/repairs', requireAuth, (req, res) => {
  const b = req.body;
  if (!b.subject || !b.numper) {
    return res.status(400).json({ error: 'กรุณากรอกรายการส่งซ่อม และชื่อผู้แจ้งซ่อม' });
  }
  const now = nowSql();
  const equipStr = Array.isArray(b.equipIds) && b.equipIds.length ? `${b.equipIds.join('|')}|` : '';
  const unitId = b.unit_out ? 0 : Number(b.unit_id || 0);
  const perbook = b.perbook || req.session.user.fullName;

  const info = db
    .prepare(
      `INSERT INTO bookroom (
        datereg, subject, perhead, numper, passenger, tel, room_id,
        datemeet, s_time, e_time, equip, food, memo, memo1,
        perbook, b_status, from_ip, unit_out, unit_id, pricefixing, user_id, d_update
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      now,
      b.subject.trim(),
      (b.perhead || '').trim(),
      b.numper.trim(),
      (b.passenger || '').trim(),
      (b.tel || '').trim(),
      Number(b.room_id || 0),
      b.datemeet || now.slice(0, 10),
      b.s_time || '08:30',
      b.e_time || '16:30',
      equipStr,
      '',
      (b.memo || '').trim(),
      (b.memo1 || '').trim(),
      perbook,
      req.session.user.isAdmin && b.b_status !== undefined ? Number(b.b_status) : 0,
      req.ip || '',
      (b.unit_out || '').trim(),
      unitId,
      Number(b.pricefixing || 0),
      req.session.user.row_id,
      now
    );

  res.status(201).json({ row_id: info.lastInsertRowid });
});

app.put('/api/repairs/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM bookroom WHERE row_id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'ไม่พบข้อมูลใบแจ้งซ่อม' });

  const isOwner = existing.perbook === req.session.user.fullName || existing.user_id === req.session.user.row_id;
  if (!req.session.user.isAdmin && !isOwner) {
    return res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไขใบแจ้งซ่อมนี้' });
  }

  const b = req.body;
  const now = nowSql();
  const unitId = b.unit_out ? 0 : Number(b.unit_id ?? existing.unit_id);
  const equipStr = Array.isArray(b.equipIds)
    ? b.equipIds.length
      ? `${b.equipIds.join('|')}|`
      : ''
    : existing.equip;

  db.prepare(
    `UPDATE bookroom SET
      subject = ?, perhead = ?, numper = ?, passenger = ?, tel = ?,
      room_id = ?, datemeet = ?, s_time = ?, e_time = ?,
      equip = ?, memo = ?, memo1 = ?, b_status = ?,
      unit_out = ?, unit_id = ?, pricefixing = ?, d_update = ?
    WHERE row_id = ?`
  ).run(
    b.subject ?? existing.subject,
    b.perhead ?? existing.perhead,
    b.numper ?? existing.numper,
    b.passenger ?? existing.passenger,
    b.tel ?? existing.tel,
    Number(b.room_id ?? existing.room_id),
    b.datemeet ?? existing.datemeet,
    b.s_time ?? existing.s_time,
    b.e_time ?? existing.e_time,
    req.session.user.isAdmin ? equipStr : existing.equip,
    b.memo ?? existing.memo,
    req.session.user.isAdmin ? (b.memo1 ?? existing.memo1) : existing.memo1,
    req.session.user.isAdmin ? Number(b.b_status ?? existing.b_status) : existing.b_status,
    b.unit_out !== undefined ? b.unit_out : existing.unit_out,
    unitId,
    req.session.user.isAdmin ? Number(b.pricefixing ?? existing.pricefixing) : existing.pricefixing,
    now,
    id
  );

  res.json({ ok: true });
});

app.patch('/api/repairs/:id/approve', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM bookroom WHERE row_id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'ไม่พบข้อมูลใบแจ้งซ่อม' });

  const { b_status, equipIds, assigned_to, memo1, pricefixing } = req.body;
  const equipStr = Array.isArray(equipIds) ? (equipIds.length ? `${equipIds.join('|')}|` : '') : existing.equip;

  db.prepare(
    `UPDATE bookroom SET b_status = ?, equip = ?, assigned_to = ?, memo1 = ?, pricefixing = ?, d_update = ? WHERE row_id = ?`
  ).run(
    Number(b_status ?? existing.b_status),
    equipStr,
    (assigned_to ?? existing.assigned_to ?? '').trim(),
    memo1 !== undefined ? memo1 : existing.memo1,
    pricefixing !== undefined ? Number(pricefixing) : existing.pricefixing,
    nowSql(),
    id
  );
  res.json({ ok: true });
});

app.patch('/api/repairs/:id/status', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM bookroom WHERE row_id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'ไม่พบข้อมูล' });

  const { b_status } = req.body;
  if (!req.session.user.isAdmin && Number(b_status) !== 9) {
    return res.status(403).json({ error: 'เฉพาะช่างเท่านั้นที่เปลี่ยนสถานะนี้ได้' });
  }
  db.prepare('UPDATE bookroom SET b_status = ?, d_update = ? WHERE row_id = ?').run(Number(b_status), nowSql(), id);
  res.json({ ok: true });
});

app.delete('/api/repairs/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM bookroom WHERE row_id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ==================== REPORTS ====================
app.get('/api/reports/summary', (req, res) => {
  const { year, month } = req.query;
  const where = [];
  const params = [];
  if (year) {
    where.push("strftime('%Y', b.datemeet) = ?");
    params.push(String(year));
  }
  if (month && Number(month) > 0) {
    where.push("strftime('%m', b.datemeet) = ?");
    params.push(String(month).padStart(2, '0'));
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const byDepartment = db
    .prepare(
      `SELECT COALESCE(NULLIF(u.unit_name, ''), NULLIF(b.unit_out, ''), 'ไม่ระบุหน่วยงาน') AS name,
              COUNT(*) AS total,
              COALESCE(SUM(b.pricefixing), 0) AS price
       FROM bookroom b
       LEFT JOIN unit_all u ON u.row_id = b.unit_id
       ${whereSql}
       GROUP BY name
       ORDER BY total DESC`
    )
    .all(...params);

  const byCategory = db
    .prepare(
      `SELECT COALESCE(r.name, 'ไม่ระบุประเภท') AS name,
              COUNT(*) AS total,
              COALESCE(SUM(b.pricefixing), 0) AS price
       FROM bookroom b
       LEFT JOIN room r ON r.row_id = b.room_id
       ${whereSql}
       GROUP BY r.row_id
       ORDER BY total DESC`
    )
    .all(...params);

  const byStatus = db
    .prepare(
      `SELECT b.b_status, COUNT(*) AS total
       FROM bookroom b
       ${whereSql}
       GROUP BY b.b_status`
    )
    .all(...params);

  const equips = db.prepare('SELECT row_id, name FROM equip ORDER BY row_id').all();
  const tickets = db.prepare(`SELECT equip, unit_out, unit_id FROM bookroom b ${whereSql}`).all(...params);

  const techCounts = equips.map((e) => ({
    row_id: e.row_id,
    name: e.name,
    total: tickets.filter((t) => (t.equip || '').split('|').includes(String(e.row_id))).length,
  }));

  const internalCount = tickets.filter((t) => !t.unit_out).length;
  const externalCount = tickets.filter((t) => !!t.unit_out).length;

  const years = db
    .prepare("SELECT DISTINCT strftime('%Y', datemeet) AS y FROM bookroom WHERE datemeet IS NOT NULL AND datemeet != '' ORDER BY y DESC")
    .all()
    .map((r) => r.y)
    .filter(Boolean);

  res.json({
    byDepartment,
    byCategory,
    byStatus,
    byTechnician: techCounts,
    internalCount,
    externalCount,
    years,
  });
});

// ==================== CATEGORIES (room) ====================
app.get('/api/categories', (req, res) => {
  const rows = db.prepare('SELECT * FROM room ORDER BY row_id ASC').all();
  res.json(rows);
});

app.post('/api/categories', requireAdmin, (req, res) => {
  const { name, place, numper, tel, memo } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อประเภทรายการซ่อม' });
  const info = db
    .prepare('INSERT INTO room (name, place, numper, tel, memo, d_update) VALUES (?, ?, ?, ?, ?, ?)')
    .run(name.trim(), place || '', numper || '0', tel || '', memo || '', nowSql());
  res.status(201).json({ row_id: info.lastInsertRowid });
});

app.put('/api/categories/:id', requireAdmin, (req, res) => {
  const { name, place, numper, tel, memo } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อประเภทรายการซ่อม' });
  db.prepare('UPDATE room SET name = ?, place = ?, numper = ?, tel = ?, memo = ?, d_update = ? WHERE row_id = ?').run(
    name.trim(),
    place || '',
    numper || '0',
    tel || '',
    memo || '',
    nowSql(),
    Number(req.params.id)
  );
  res.json({ ok: true });
});

app.delete('/api/categories/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM room WHERE row_id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ==================== TECHNICIANS (equip) ====================
app.get('/api/technicians', (req, res) => {
  const rows = db.prepare('SELECT * FROM equip ORDER BY row_id ASC').all();
  res.json(rows);
});

app.post('/api/technicians', requireAdmin, (req, res) => {
  const { name, tel } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อช่าง/ผู้ตรวจสอบ' });
  const info = db.prepare('INSERT INTO equip (name, tel, d_update) VALUES (?, ?, ?)').run(name.trim(), tel || '', nowSql());
  res.status(201).json({ row_id: info.lastInsertRowid });
});

app.put('/api/technicians/:id', requireAdmin, (req, res) => {
  const { name, tel } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อช่าง/ผู้ตรวจสอบ' });
  db.prepare('UPDATE equip SET name = ?, tel = ?, d_update = ? WHERE row_id = ?').run(name.trim(), tel || '', nowSql(), Number(req.params.id));
  res.json({ ok: true });
});

app.delete('/api/technicians/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM equip WHERE row_id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ==================== UNITS (unit_all) ====================
app.get('/api/units', (req, res) => {
  const rows = db.prepare('SELECT * FROM unit_all ORDER BY unit_name ASC').all();
  res.json(rows);
});

app.post('/api/units', requireAdmin, (req, res) => {
  const { unit_code, unit_name, unit_head, tel } = req.body;
  if (!unit_name || !unit_name.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อหน่วยงาน' });
  const info = db
    .prepare('INSERT INTO unit_all (unit_code, unit_name, unit_head, tel, d_update) VALUES (?, ?, ?, ?, ?)')
    .run(unit_code || '', unit_name.trim(), unit_head || '', tel || '', nowSql());
  res.status(201).json({ row_id: info.lastInsertRowid });
});

app.put('/api/units/:id', requireAdmin, (req, res) => {
  const { unit_code, unit_name, unit_head, tel } = req.body;
  if (!unit_name || !unit_name.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อหน่วยงาน' });
  db.prepare('UPDATE unit_all SET unit_code = ?, unit_name = ?, unit_head = ?, tel = ?, d_update = ? WHERE row_id = ?').run(
    unit_code || '',
    unit_name.trim(),
    unit_head || '',
    tel || '',
    nowSql(),
    Number(req.params.id)
  );
  res.json({ ok: true });
});

app.delete('/api/units/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM unit_all WHERE row_id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ==================== USERS (personaldata) ====================
app.get('/api/users', requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.row_id, p.title, p.fname, p.lname, p.telephone, p.unit_id, p.usertype, p.puchai, u.unit_name
       FROM personaldata p
       LEFT JOIN unit_all u ON u.row_id = p.unit_id
       ORDER BY p.row_id DESC`
    )
    .all();
  res.json(rows);
});

app.post('/api/users', requireAdmin, (req, res) => {
  const { title, fname, lname, telephone, unit_id, usertype, puchai, rahuspan } = req.body;
  if (!fname || !puchai || !rahuspan) {
    return res.status(400).json({ error: 'กรุณากรอก ชื่อ, Username และ Password' });
  }
  try {
    const info = db
      .prepare(
        `INSERT INTO personaldata (title, fname, lname, telephone, unit_id, usertype, puchai, rahuspan, d_update)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(title || '', fname.trim(), lname || '', telephone || '', Number(unit_id || 0), usertype === 'adminn' ? 'adminn' : 'user', puchai.trim(), rahuspan.trim(), nowSql());
    res.status(201).json({ row_id: info.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: 'Username นี้มีอยู่ในระบบแล้ว' });
  }
});

app.put('/api/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM personaldata WHERE row_id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });

  const { title, fname, lname, telephone, unit_id, usertype, puchai, rahuspan } = req.body;
  db.prepare(
    `UPDATE personaldata SET title = ?, fname = ?, lname = ?, telephone = ?, unit_id = ?, usertype = ?, puchai = ?, rahuspan = ?, d_update = ? WHERE row_id = ?`
  ).run(
    title ?? existing.title,
    fname ?? existing.fname,
    lname ?? existing.lname,
    telephone ?? existing.telephone,
    Number(unit_id ?? existing.unit_id),
    usertype === 'adminn' ? 'adminn' : 'user',
    puchai ?? existing.puchai,
    rahuspan ? rahuspan : existing.rahuspan,
    nowSql(),
    id
  );
  res.json({ ok: true });
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM personaldata WHERE row_id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// Fallback to SPA index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`KSP Repair System running at http://0.0.0.0:${PORT}`);
});
