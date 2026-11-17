const path = require('path');
const PDFDocument = require('pdfkit');

const FONT_REG = path.join(__dirname, '..', 'fonts', 'Sarabun-Regular.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'fonts', 'Sarabun-Bold.ttf');

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const THAI_SHORT_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

const STATUS_INFO = {
  0: { label: 'รอตรวจสอบ', color: '#b91c1c', bg: '#fee2e2' },
  1: { label: 'กำลังดำเนินการ', color: '#b45309', bg: '#fef3c7' },
  6: { label: 'เสร็จเรียบร้อยแล้ว', color: '#15803d', bg: '#dcfce7' },
  9: { label: 'ยกเลิก', color: '#be185d', bg: '#fce7f3' },
};

function fmtThaiDateFull(iso) {
  if (!iso || String(iso).startsWith('0000')) return '-';
  const p = String(iso).slice(0, 10).split('-');
  if (p.length !== 3) return String(iso);
  const y = Number(p[0]) + 543;
  const m = THAI_MONTHS[Number(p[1]) - 1] || p[1];
  return `${Number(p[2])} ${m} ${y}`;
}

function fmtThaiDateShort(iso) {
  if (!iso || String(iso).startsWith('0000')) return '-';
  const p = String(iso).slice(0, 10).split('-');
  if (p.length !== 3) return String(iso);
  const y = Number(p[0]) + 543;
  const m = THAI_SHORT_MONTHS[Number(p[1]) - 1] || p[1];
  return `${Number(p[2])} ${m} ${String(y).slice(-2)}`;
}

function generateRepairTicketPdf(ticket, res, download = false) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 40, bottom: 40, left: 42, right: 42 },
    info: {
      Title: `ใบแจ้งซ่อมบำรุง #${ticket.row_id}`,
      Author: 'โรงพยาบาลโคกศรีสุพรรณ',
    },
  });

  const filename = `repair-${ticket.row_id}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${filename}"`);
  doc.pipe(res);

  doc.registerFont('Sarabun', FONT_REG);
  doc.registerFont('Sarabun-Bold', FONT_BOLD);

  const pageW = doc.page.width; // 595.28
  const left = 42;
  const contentW = pageW - left * 2; // 511.28

  // ===== HEADER BANNER =====
  doc.roundedRect(left, 38, contentW, 68, 6).fillAndStroke('#f0f9ff', '#0284c7');

  doc.fillColor('#0369a1').font('Sarabun-Bold').fontSize(16)
    .text('ใบแจ้งซ่อมคอมพิวเตอร์ออนไลน์', left + 16, 48, { width: 320 });
  doc.fillColor('#334155').font('Sarabun').fontSize(11)
    .text('โรงพยาบาลโคกศรีสุพรรณ จังหวัดสกลนคร', left + 16, 70, { width: 320 });
  doc.fillColor('#64748b').fontSize(9.5)
    .text(`วันที่บันทึกข้อมูล: ${ticket.datereg || '-'}`, left + 16, 86, { width: 320 });

  // Ticket Number & Status Box on right
  const st = STATUS_INFO[ticket.b_status] || { label: `สถานะ ${ticket.b_status}`, color: '#334155', bg: '#e2e8f0' };
  doc.roundedRect(left + contentW - 155, 46, 142, 52, 5).fillAndStroke('#ffffff', '#bae6fd');
  doc.fillColor('#64748b').font('Sarabun').fontSize(9)
    .text('เลขที่ใบแจ้งซ่อม', left + contentW - 155, 50, { width: 142, align: 'center' });
  doc.fillColor('#0f172a').font('Sarabun-Bold').fontSize(14)
    .text(`#${ticket.row_id}`, left + contentW - 155, 62, { width: 142, align: 'center' });

  doc.roundedRect(left + contentW - 135, 81, 102, 14, 7).fill(st.bg);
  doc.fillColor(st.color).font('Sarabun-Bold').fontSize(8.5)
    .text(st.label, left + contentW - 135, 82, { width: 102, align: 'center' });

  // ===== SECTION 1: ข้อมูลการแจ้งซ่อม =====
  let y = 122;
  doc.fillColor('#0369a1').font('Sarabun-Bold').fontSize(12).text('1. รายละเอียดการแจ้งซ่อม', left, y);
  y += 20;

  const labelW = 155;
  const valW = contentW - labelW;

  const rows1 = [
    ['หน่วยงานที่แจ้งซ่อม', ticket.unit_name || ticket.unit_out || '-'],
    ['ประเภทรายการซ่อม', ticket.room_name || '-'],
    ['รายการส่งซ่อม / อาการ', ticket.subject || '-', true],
    ['หมายเลขครุภัณฑ์ / ยี่ห้อ', `${ticket.perhead || '-'}${ticket.passenger ? `  (ยี่ห้อ: ${ticket.passenger})` : ''}`],
    ['ผู้แจ้งซ่อม / เบอร์โทร', `${ticket.numper || '-'}${ticket.tel ? `  (โทร. ${ticket.tel})` : ''}`],
    ['วันที่ให้ดำเนินการ', `${fmtThaiDateFull(ticket.datemeet)}   เวลา ${ticket.s_time || '-'} - ${ticket.e_time || '-'} น.`],
    ['ตรวจสอบเบื้องต้น / หมายเหตุ', ticket.memo || '-'],
  ];

  for (let i = 0; i < rows1.length; i++) {
    const [lbl, val, boldVal] = rows1[i];
    doc.font(boldVal ? 'Sarabun-Bold' : 'Sarabun').fontSize(10.5);
    const textH = doc.heightOfString(String(val), { width: valW - 16 });
    const rowH = Math.max(25, textH + 12);

    // Row background & border
    doc.rect(left, y, labelW, rowH).fillAndStroke('#f8fafc', '#cbd5e1');
    doc.rect(left + labelW, y, valW, rowH).fillAndStroke('#ffffff', '#cbd5e1');

    doc.fillColor('#334155').font('Sarabun-Bold').fontSize(10)
      .text(lbl, left + 10, y + 6, { width: labelW - 16 });
    doc.fillColor('#0f172a').font(boldVal ? 'Sarabun-Bold' : 'Sarabun').fontSize(10.5)
      .text(String(val), left + labelW + 10, y + 6, { width: valW - 16 });

    y += rowH;
  }

  // ===== SECTION 2: ส่วนสำหรับเจ้าหน้าที่ / ช่าง =====
  y += 16;
  doc.fillColor('#0369a1').font('Sarabun-Bold').fontSize(12).text('2. ส่วนการตรวจสอบและดำเนินการซ่อม (สำหรับช่าง)', left, y);
  y += 20;

  const techNames = (ticket.equipNames && ticket.equipNames.length) ? ticket.equipNames.join(', ') : '-';
  const assignee = [techNames !== '-' ? techNames : '', ticket.assigned_to || ''].filter(Boolean).join(' / ') || '-';
  const costText = `${Number(ticket.pricefixing || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;

  const rows2 = [
    ['ผู้รับผิดชอบ / ช่างผู้ดำเนินการ', assignee],
    ['สถานะการดำเนินการ', st.label, true],
    ['การดำเนินแก้ไขปัญหา', ticket.memo1 || '-'],
    ['ค่าใช้จ่ายในการซ่อม', costText],
    ['ผู้บันทึก / มอบหมายงาน', ticket.perbook || '-'],
  ];

  for (let i = 0; i < rows2.length; i++) {
    const [lbl, val, boldVal] = rows2[i];
    doc.font(boldVal ? 'Sarabun-Bold' : 'Sarabun').fontSize(10.5);
    const textH = doc.heightOfString(String(val), { width: valW - 16 });
    const rowH = Math.max(25, textH + 12);

    doc.rect(left, y, labelW, rowH).fillAndStroke('#f0f9ff', '#cbd5e1');
    doc.rect(left + labelW, y, valW, rowH).fillAndStroke('#ffffff', '#cbd5e1');

    doc.fillColor('#334155').font('Sarabun-Bold').fontSize(10)
      .text(lbl, left + 10, y + 6, { width: labelW - 16 });
    doc.fillColor('#0f172a').font(boldVal ? 'Sarabun-Bold' : 'Sarabun').fontSize(10.5)
      .text(String(val), left + labelW + 10, y + 6, { width: valW - 16 });

    y += rowH;
  }

  // ===== SECTION 3: SIGNATURE BLOCK =====
  let sigY = y + 24;
  if (sigY + 170 > 775) {
    doc.addPage({ size: 'A4', margins: { top: 40, bottom: 40, left: 42, right: 42 } });
    sigY = 60;
  }
  const colW = contentW / 3;

  const sigs = [
    { title: 'ผู้แจ้งซ่อม', name: ticket.numper || '' },
    { title: 'ช่างผู้ตรวจสอบ / ดำเนินการ', name: techNames !== '-' ? techNames.split(',')[0].trim() : '' },
    { title: 'หัวหน้างาน / ผู้รับรอง', name: '' },
  ];

  sigs.forEach((s, idx) => {
    const sx = left + idx * colW;
    doc.fillColor('#334155').font('Sarabun').fontSize(9.5)
      .text('ลงชื่อ ...............................................', sx, sigY, { width: colW, align: 'center' });
    doc.text(`( ${s.name ? s.name : '...........................................'} )`, sx, sigY + 17, { width: colW, align: 'center' });
    doc.font('Sarabun-Bold').text(s.title, sx, sigY + 34, { width: colW, align: 'center' });
    doc.font('Sarabun').fontSize(8.5).fillColor('#64748b')
      .text('วันที่ ........../........../..........', sx, sigY + 51, { width: colW, align: 'center' });
  });

  // ===== DIRECTOR SIGNATURE (CENTER BOTTOM) =====
  const dirY = sigY + 84;
  doc.fillColor('#0f172a').font('Sarabun').fontSize(9.5)
    .text('ลงชื่อ ...............................................', left, dirY, { width: contentW, align: 'center' })
    .text('( นางณัฐปภัสร์ นวัตชัยศิริกุล )', left, dirY + 17, { width: contentW, align: 'center' });
  doc.font('Sarabun-Bold').text('นายแพทย์ชำนาญการพิเศษ', left, dirY + 34, { width: contentW, align: 'center' });
  doc.font('Sarabun').fontSize(9)
    .text('รักษาการในตำแหน่ง\nผู้อำนวยการ รพ.โคกศรีสุพรรณ', left, dirY + 50, { width: contentW, align: 'center' });

  // ===== FOOTER =====
  const nowStr = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  doc.fillColor('#94a3b8').font('Sarabun').fontSize(8.5)
    .text(`พิมพ์จากระบบซ่อมคอมพิวเตอร์ออนไลน์ โรงพยาบาลโคกศรีสุพรรณ | พิมพ์เมื่อ ${nowStr}`, left, 785, {
      width: contentW,
      align: 'center',
    });

  doc.end();
}

function generateRepairBoardPdf(items, filterDesc, res, download = false) {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margins: { top: 32, bottom: 32, left: 30, right: 30 },
    info: {
      Title: 'ตารางรายการแจ้งซ่อมบำรุง โรงพยาบาลโคกศรีสุพรรณ',
      Author: 'โรงพยาบาลโคกศรีสุพรรณ',
    },
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="repair-board.pdf"`);
  doc.pipe(res);

  doc.registerFont('Sarabun', FONT_REG);
  doc.registerFont('Sarabun-Bold', FONT_BOLD);

  const left = 30;
  const contentW = doc.page.width - left * 2; // ~781.89

  const drawHeader = () => {
    doc.fillColor('#0369a1').font('Sarabun-Bold').fontSize(14)
      .text('ตารางรายการแจ้งซ่อมคอมพิวเตอร์ออนไลน์ โรงพยาบาลโคกศรีสุพรรณ', left, 26, { width: contentW, align: 'center' });
    doc.fillColor('#475569').font('Sarabun').fontSize(9.5)
      .text(filterDesc || 'รายการทั้งหมด', left, 46, { width: contentW, align: 'center' });

    const cols = [
      { label: 'เลขที่', w: 54 },
      { label: 'วันที่แจ้ง', w: 62 },
      { label: 'ประเภทซ่อม', w: 95 },
      { label: 'รายการส่งซ่อม / อาการ', w: 205 },
      { label: 'เลขครุภัณฑ์', w: 85 },
      { label: 'หน่วยงาน', w: 105 },
      { label: 'ผู้แจ้ง / ช่าง', w: 105 },
      { label: 'สถานะ', w: 70 },
    ];
    let cx = left;
    const hy = 66;
    cols.forEach((c) => {
      doc.rect(cx, hy, c.w, 22).fillAndStroke('#e0f2fe', '#94a3b8');
      doc.fillColor('#0f172a').font('Sarabun-Bold').fontSize(9)
        .text(c.label, cx + 4, hy + 5, { width: c.w - 8, align: 'center' });
      cx += c.w;
    });
    return { cols, startY: hy + 22 };
  };

  let { cols, startY: y } = drawHeader();

  for (let i = 0; i < items.length; i++) {
    const r = items[i];
    const st = STATUS_INFO[r.b_status] || { label: String(r.b_status), color: '#334155' };
    const vals = [
      `#${r.row_id}`,
      fmtThaiDateShort(r.datemeet),
      r.room_name || '-',
      r.subject || '-',
      r.perhead || '-',
      r.unit_name || r.unit_out || '-',
      `${r.numper || '-'}${r.equipNames?.length ? `\n(${r.equipNames.join(', ')})` : ''}`,
      st.label,
    ];

    doc.font('Sarabun').fontSize(8.5);
    let maxH = 20;
    vals.forEach((v, idx) => {
      const h = doc.heightOfString(String(v), { width: cols[idx].w - 8 }) + 8;
      if (h > maxH) maxH = h;
    });

    if (y + maxH > doc.page.height - 36) {
      doc.addPage({ size: 'A4', layout: 'landscape', margins: { top: 32, bottom: 32, left: 30, right: 30 } });
      ({ cols, startY: y } = drawHeader());
    }

    let cx = left;
    const rowBg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    vals.forEach((v, idx) => {
      doc.rect(cx, y, cols[idx].w, maxH).fillAndStroke(rowBg, '#cbd5e1');
      doc.fillColor(idx === 7 ? st.color : '#0f172a')
        .font(idx === 7 ? 'Sarabun-Bold' : 'Sarabun')
        .fontSize(8.5)
        .text(String(v), cx + 4, y + 4, { width: cols[idx].w - 8 });
      cx += cols[idx].w;
    });
    y += maxH;
  }

  if (y + 105 > doc.page.height - 28) {
    doc.addPage({ size: 'A4', layout: 'landscape', margins: { top: 32, bottom: 32, left: 30, right: 30 } });
    y = 40;
  }
  const dirY = y + 18;
  doc.fillColor('#0f172a').font('Sarabun').fontSize(9.5)
    .text('ลงชื่อ ...............................................', left, dirY, { width: contentW, align: 'center' })
    .text('( นางณัฐปภัสร์ นวัตชัยศิริกุล )', left, dirY + 17, { width: contentW, align: 'center' });
  doc.font('Sarabun-Bold').text('นายแพทย์ชำนาญการพิเศษ', left, dirY + 34, { width: contentW, align: 'center' });
  doc.font('Sarabun').fontSize(9)
    .text('รักษาการในตำแหน่ง\nผู้อำนวยการ รพ.โคกศรีสุพรรณ', left, dirY + 50, { width: contentW, align: 'center' });

  doc.end();
}

function generateReportSectionPdf(title, filterDesc, columns, rows, res, download = false) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 36, bottom: 36, left: 36, right: 36 },
    info: { Title: title, Author: 'โรงพยาบาลโคกศรีสุพรรณ' },
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="report.pdf"`);
  doc.pipe(res);
  doc.registerFont('Sarabun', FONT_REG);
  doc.registerFont('Sarabun-Bold', FONT_BOLD);
  const left = 36;
  const contentW = doc.page.width - left * 2;
  const drawHeader = () => {
    doc.fillColor('#0369a1').font('Sarabun-Bold').fontSize(14).text(title, left, 30, { width: contentW, align: 'center' });
    doc.fillColor('#475569').font('Sarabun').fontSize(9.5).text(`โรงพยาบาลโคกศรีสุพรรณ | ${filterDesc || 'ข้อมูลทั้งหมด'}`, left, 50, { width: contentW, align: 'center' });
    let cx = left;
    const hy = 72;
    columns.forEach((c) => {
      doc.rect(cx, hy, c.w, 22).fillAndStroke('#e0f2fe', '#94a3b8');
      doc.fillColor('#0f172a').font('Sarabun-Bold').fontSize(9).text(c.label, cx + 4, hy + 5, { width: c.w - 8, align: c.align || 'left' });
      cx += c.w;
    });
    return hy + 22;
  };
  let y = drawHeader();
  for (let i = 0; i < rows.length; i++) {
    const vals = rows[i];
    doc.font('Sarabun').fontSize(9);
    let maxH = 20;
    vals.forEach((v, idx) => {
      const h = doc.heightOfString(String(v ?? '-'), { width: columns[idx].w - 8 }) + 9;
      if (h > maxH) maxH = h;
    });
    if (y + maxH > doc.page.height - 42) {
      doc.addPage({ size: 'A4', margins: { top: 36, bottom: 36, left: 36, right: 36 } });
      y = drawHeader();
    }
    let cx = left;
    const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    vals.forEach((v, idx) => {
      doc.rect(cx, y, columns[idx].w, maxH).fillAndStroke(bg, '#cbd5e1');
      doc.fillColor('#0f172a').font('Sarabun').fontSize(9).text(String(v ?? '-'), cx + 4, y + 4.5, { width: columns[idx].w - 8, align: columns[idx].align || 'left' });
      cx += columns[idx].w;
    });
    y += maxH;
  }
  if (y + 185 > doc.page.height - 32) {
    doc.addPage({ size: 'A4', margins: { top: 36, bottom: 36, left: 36, right: 36 } });
    y = 44;
  }
  const sigY = y + 22;
  const sigColW = contentW / 3;
  const sigCols = ['ผู้จัดทำรายงาน', 'ผู้ดำเนินการ / ตรวจสอบ', 'ผู้รับรอง / หัวหน้างาน'];
  sigCols.forEach((roleLabel, idx) => {
    const sx = left + sigColW * idx;
    doc.fillColor('#0f172a').font('Sarabun').fontSize(9)
      .text('ลงชื่อ .......................................', sx, sigY, { width: sigColW, align: 'center' })
      .text('( ........................................... )', sx, sigY + 15, { width: sigColW, align: 'center' });
    doc.font('Sarabun-Bold').text(roleLabel, sx, sigY + 30, { width: sigColW, align: 'center' });
    doc.font('Sarabun').fontSize(8.5).fillColor('#64748b')
      .text('วันที่ ......... / ......... / .............', sx, sigY + 45, { width: sigColW, align: 'center' });
  });

  const dirY = sigY + 74;
  doc.fillColor('#0f172a').font('Sarabun').fontSize(9.5)
    .text('ลงชื่อ ...............................................', left, dirY, { width: contentW, align: 'center' })
    .text('( นางณัฐปภัสร์ นวัตชัยศิริกุล )', left, dirY + 17, { width: contentW, align: 'center' });
  doc.font('Sarabun-Bold').text('นายแพทย์ชำนาญการพิเศษ', left, dirY + 34, { width: contentW, align: 'center' });
  doc.font('Sarabun').fontSize(9).text('รักษาการในตำแหน่ง\nผู้อำนวยการ รพ.โคกศรีสุพรรณ', left, dirY + 50, { width: contentW, align: 'center' });
  doc.end();
}

module.exports = { generateRepairTicketPdf, generateRepairBoardPdf, generateReportSectionPdf };
