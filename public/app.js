const state = {
  user: null,
  categories: [],
  technicians: [],
  units: [],
  currentTab: 'list',
  mineOnly: false,
  viewMode: 'calendar',
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth() + 1,
  page: 1,
  masterType: null,
  masterEditId: null,
};

const STATUS_MAP = {
  0: { label: 'รอตรวจสอบ', cls: 'badge-0' },
  1: { label: 'กำลังดำเนินการ', cls: 'badge-1' },
  6: { label: 'เสร็จเรียบร้อยแล้ว', cls: 'badge-6' },
  9: { label: 'ยกเลิก', cls: 'badge-9' },
};

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtThaiDate(iso) {
  if (!iso || iso.startsWith('0000')) return '-';
  const p = iso.slice(0, 10).split('-');
  if (p.length !== 3) return iso;
  const y = Number(p[0]) + 543;
  const m = THAI_MONTHS[Number(p[1]) - 1] || p[1];
  return `${Number(p[2])} ${m} ${String(y).slice(-2)}`;
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาดในการเชื่อมต่อ');
  return data;
}

const THAI_FULL_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];
const THAI_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

async function init() {
  await Promise.all([loadAuth(), loadStats(), loadMasterLists()]);
  populateYearDropdowns();
  setViewMode('calendar');
  if (!state.user) openLoginModal();
}

async function loadAuth() {
  const { user } = await api('/api/auth/me');
  state.user = user;
  renderAuth();
}

function renderAuth() {
  const area = document.getElementById('authArea');
  const adminBtns = document.querySelectorAll('.admin-only');
  const tabMine = document.getElementById('tabMine');
  const adminFormFields = document.getElementById('adminFormFields');
  const createNotice = document.getElementById('createAuthNotice');

  if (state.user) {
    area.innerHTML = `
      <span class="user-badge">👤 ${esc(state.user.fullName)} ${state.user.isAdmin ? '(ช่าง/Admin)' : ''}</span>
      <button class="btn btn-white btn-sm" onclick="logout()">ออกจากระบบ</button>
    `;
    tabMine.classList.remove('hidden');
    createNotice.classList.add('hidden');
    adminBtns.forEach((b) => b.classList.toggle('hidden', !state.user.isAdmin));
    adminFormFields.classList.toggle('hidden', !state.user.isAdmin);
    if (!document.getElementById('fRowId').value) {
      document.getElementById('fNumper').value = state.user.fullName;
      document.getElementById('fTel').value = state.user.telephone || '';
      if (state.user.unit_id) document.getElementById('fUnitId').value = state.user.unit_id;
    }
  } else {
    area.innerHTML = `<button class="btn btn-white btn-sm" onclick="openLoginModal()">🔐 เข้าสู่ระบบ</button>`;
    tabMine.classList.add('hidden');
    adminBtns.forEach((b) => b.classList.add('hidden'));
    adminFormFields.classList.add('hidden');
    createNotice.classList.remove('hidden');
  }
}

async function loadStats() {
  const s = await api('/api/stats');
  document.getElementById('statTotal').textContent = s.total.toLocaleString();
  document.getElementById('statPending').textContent = s.pending.toLocaleString();
  document.getElementById('statProgress').textContent = s.inProgress.toLocaleString();
  document.getElementById('statDone').textContent = s.completed.toLocaleString();
  document.getElementById('statCancel').textContent = s.cancelled.toLocaleString();
  document.getElementById('ecoPaper').textContent = s.eco.paper.toLocaleString();
  document.getElementById('ecoBaht').textContent = s.eco.baht.toLocaleString();
  document.getElementById('ecoGhg').textContent = s.eco.ghg;
}

async function loadMasterLists() {
  const [cats, techs, units] = await Promise.all([
    api('/api/categories'),
    api('/api/technicians'),
    api('/api/units'),
  ]);
  state.categories = cats;
  state.technicians = techs;
  state.units = units;

  const catOptions = cats.map((c) => `<option value="${c.row_id}">${esc(c.name)}</option>`).join('');
  document.getElementById('filterCategory').innerHTML = `<option value="">-- ทุกประเภท --</option>${catOptions}`;
  document.getElementById('fRoomId').innerHTML = `<option value="0">-- เลือกประเภทรายการซ่อม --</option>${catOptions}`;

  const unitOptions = units.map((u) => `<option value="${u.row_id}">${esc(u.unit_name)}</option>`).join('');
  document.getElementById('fUnitId').innerHTML = `<option value="0">-- เลือกหน่วยงาน --</option>${unitOptions}`;

  document.getElementById('fEquipChecks').innerHTML = techs
    .map((t) => `<label><input type="checkbox" name="equipCheck" value="${t.row_id}" /> ${esc(t.name)}</label>`)
    .join('');
}

function populateYearDropdowns() {
  const curYear = new Date().getFullYear();
  let html = '<option value="">-- ทุกปี --</option>';
  let fyHtml = '';
  for (let y = curYear + 1; y >= 2010; y--) {
    html += `<option value="${y}">${y + 543}</option>`;
    fyHtml += `<option value="${y + 543}">ปีงบประมาณ ${y + 543}</option>`;
  }
  document.getElementById('filterYear').innerHTML = html;
  document.getElementById('repYear').innerHTML = html;
  const fyEl = document.getElementById('repFiscalYear');
  if (fyEl) fyEl.innerHTML = fyHtml;
  const rdEl = document.getElementById('repDate');
  if (rdEl) rdEl.value = new Date().toISOString().slice(0, 10);
}

// ==================== TABS ====================
document.getElementById('navTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-btn');
  if (!btn) return;
  switchTab(btn.dataset.tab);
});

function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-view').forEach((v) => v.classList.add('hidden'));

  if (tab === 'list' || tab === 'mine') {
    state.mineOnly = tab === 'mine';
    document.getElementById('listTitle').textContent = state.mineOnly
      ? 'รายการแจ้งซ่อมของฉัน'
      : state.viewMode === 'calendar'
      ? 'ปฏิทินรายการแจ้งซ่อมบำรุง'
      : 'รายการแจ้งซ่อมบำรุง';
    document.getElementById('view-list').classList.remove('hidden');
    if (state.viewMode === 'calendar') loadCalendar();
    else loadRepairs(1);
  } else {
    document.getElementById(`view-${tab}`).classList.remove('hidden');
    if (tab === 'create' && !document.getElementById('fDatemeet').value) {
      document.getElementById('fDatemeet').value = new Date().toISOString().slice(0, 10);
    }
    if (tab === 'reports') loadReports();
    if (tab === 'admin') loadAdminList(1);
    if (tab === 'categories') renderCategories();
    if (tab === 'technicians') renderTechnicians();
    if (tab === 'units') renderUnits();
    if (tab === 'users') loadUsers();
  }
}

// ==================== CALENDAR & REPAIRS LIST ====================
function setViewMode(mode) {
  state.viewMode = mode;
  document.getElementById('btnViewCal').classList.toggle('active', mode === 'calendar');
  document.getElementById('btnViewTable').classList.toggle('active', mode === 'table');
  document.getElementById('calendarContainer').classList.toggle('hidden', mode !== 'calendar');
  document.getElementById('tableContainer').classList.toggle('hidden', mode !== 'table');
  document.getElementById('listTitle').textContent = state.mineOnly
    ? 'รายการแจ้งซ่อมของฉัน'
    : mode === 'calendar'
    ? 'ปฏิทินรายการแจ้งซ่อมบำรุง'
    : 'รายการแจ้งซ่อมบำรุง';

  if (mode === 'calendar') {
    loadCalendar();
  } else {
    loadRepairs(1);
  }
}

function applyFilters() {
  const fy = document.getElementById('filterYear').value;
  const fm = Number(document.getElementById('filterMonth').value || 0);
  if (state.viewMode === 'calendar') {
    if (fy) state.calYear = Number(fy);
    if (fm > 0) state.calMonth = fm;
    loadCalendar();
  } else {
    loadRepairs(1);
  }
}

function shiftCalMonth(delta) {
  state.calMonth += delta;
  if (state.calMonth > 12) {
    state.calMonth = 1;
    state.calYear += 1;
  } else if (state.calMonth < 1) {
    state.calMonth = 12;
    state.calYear -= 1;
  }
  loadCalendar();
}

function goCalToday() {
  const now = new Date();
  state.calYear = now.getFullYear();
  state.calMonth = now.getMonth() + 1;
  loadCalendar();
}

async function loadCalendar() {
  const y = state.calYear;
  const m = state.calMonth;
  document.getElementById('calMonthLabel').textContent = `${THAI_FULL_MONTHS[m - 1]} พ.ศ. ${y + 543}`;
  document.getElementById('filterYear').value = String(y);
  document.getElementById('filterMonth').value = String(m);

  const params = new URLSearchParams({
    page: 1,
    limit: 500,
    year: y,
    month: m,
    q: document.getElementById('filterQ').value,
    status: document.getElementById('filterStatus').value,
    room_id: document.getElementById('filterCategory').value,
    mine: state.mineOnly ? '1' : '0',
  });
  const data = await api(`/api/repairs?${params.toString()}`);

  const byDate = {};
  for (const r of data.items) {
    const d = (r.datemeet || '').slice(0, 10);
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(r);
  }

  const firstDay = new Date(y, m - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(y, m, 0).getDate();
  const prevMonthDays = new Date(y, m - 1, 0).getDate();
  const todayIso = new Date().toISOString().slice(0, 10);

  let html = THAI_DAYS.map((d, idx) => {
    const cls = idx === 0 ? 'sun' : idx === 6 ? 'sat' : '';
    return `<div class="cal-day-head ${cls}">${d}</div>`;
  }).join('');

  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  for (let cell = 0; cell < totalCells; cell++) {
    const dayNum = cell - firstDay + 1;
    let cellClass = 'cal-cell';
    let displayNum = dayNum;
    let isoDate = '';

    if (dayNum <= 0) {
      cellClass += ' other-month';
      displayNum = prevMonthDays + dayNum;
    } else if (dayNum > daysInMonth) {
      cellClass += ' other-month';
      displayNum = dayNum - daysInMonth;
    } else {
      isoDate = `${y}-${String(m).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      if (isoDate === todayIso) cellClass += ' today';
    }

    const dayItems = isoDate ? byDate[isoDate] || [] : [];
    const visibleItems = dayItems.slice(0, 4);
    const hiddenCount = dayItems.length - visibleItems.length;

    const itemsHtml = visibleItems
      .map((r) => {
        const unit = r.unit_name || r.unit_out || '';
        const title = `#${r.row_id} ${r.subject}${unit ? ' (' + unit + ')' : ''}`;
        return `<div class="cal-item st-${r.b_status}" title="${esc(title)}" onclick="viewRepair(${r.row_id})">
          <strong>#${r.row_id}</strong> ${esc(r.subject)}
        </div>`;
      })
      .join('');

    const moreHtml = hiddenCount > 0
      ? `<div class="cal-more" onclick="openDayInTable('${isoDate}')">+ อีก ${hiddenCount} รายการ</div>`
      : '';

    html += `
      <div class="${cellClass}">
        <div class="cal-cell-top">
          <span class="cal-day-num">${displayNum}</span>
          ${dayItems.length ? `<span class="cal-count">${dayItems.length} งาน</span>` : ''}
        </div>
        ${itemsHtml}
        ${moreHtml}
      </div>
    `;
  }

  document.getElementById('calendarGrid').innerHTML = html;
}

function openDayInTable(isoDate) {
  setViewMode('table');
  loadRepairs(1, isoDate);
}

async function loadRepairs(page = 1, exactDate = '') {
  state.page = page;
  const params = new URLSearchParams({
    page,
    limit: 30,
    date: exactDate,
    q: document.getElementById('filterQ').value,
    year: exactDate ? '' : document.getElementById('filterYear').value,
    month: exactDate ? '0' : document.getElementById('filterMonth').value,
    status: document.getElementById('filterStatus').value,
    room_id: document.getElementById('filterCategory').value,
    mine: state.mineOnly ? '1' : '0',
  });

  const data = await api(`/api/repairs?${params.toString()}`);
  const tbody = document.getElementById('repairsTbody');

  if (!data.items.length) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#64748b;padding:24px;">ไม่พบรายการแจ้งซ่อม</td></tr>';
  } else {
    tbody.innerHTML = data.items
      .map((r) => {
        const st = STATUS_MAP[r.b_status] || { label: `สถานะ ${r.b_status}`, cls: 'badge-0' };
        const unit = r.unit_name || r.unit_out || '-';
        const techs = r.equipNames.length ? r.equipNames.join(', ') : '-';
        const canEdit = state.user && (state.user.isAdmin || r.perbook === state.user.fullName || r.user_id === state.user.row_id);
        return `
          <tr>
            <td><strong>#${r.row_id}</strong></td>
            <td style="white-space:nowrap">${fmtThaiDate(r.datemeet)}</td>
            <td style="white-space:nowrap">${esc(r.s_time || '')}${r.e_time ? ' - ' + esc(r.e_time) : ''}</td>
            <td>${esc(r.room_name || '-')}</td>
            <td><strong>${esc(r.subject)}</strong></td>
            <td>${esc(r.perhead || '-')}${r.passenger ? ` <small>(${esc(r.passenger)})</small>` : ''}</td>
            <td>${esc(unit)}</td>
            <td>${esc(r.numper || r.perbook || '-')}</td>
            <td>${esc(techs)}</td>
            <td><span class="badge ${st.cls}">${st.label}</span></td>
            <td class="no-print" style="white-space:nowrap">
              <button class="btn btn-outline btn-sm" onclick="viewRepair(${r.row_id})">${state.user?.isAdmin ? 'ดู/พิมพ์' : 'ดูรายละเอียด'}</button>
              ${canEdit ? `<button class="btn btn-primary btn-sm" onclick="editRepair(${r.row_id})">แก้ไข</button>` : ''}
              ${state.user?.isAdmin ? `<button class="btn btn-danger btn-sm" onclick="deleteRepair(${r.row_id})">ลบ</button>` : ''}
            </td>
          </tr>
        `;
      })
      .join('');
  }

  document.getElementById('pagination').innerHTML = `
    <div>ทั้งหมด <strong>${data.total.toLocaleString()}</strong> รายการ (หน้า ${data.page} / ${data.totalPages})</div>
    <div style="display:flex;gap:6px;">
      <button class="btn btn-outline btn-sm" ${data.page <= 1 ? 'disabled' : ''} onclick="loadRepairs(${data.page - 1})">◀ ก่อนหน้า</button>
      <button class="btn btn-outline btn-sm" ${data.page >= data.totalPages ? 'disabled' : ''} onclick="loadRepairs(${data.page + 1})">ถัดไป ▶</button>
    </div>
  `;
}

function resetFilters() {
  document.getElementById('filterQ').value = '';
  document.getElementById('filterStatus').value = '';
  document.getElementById('filterCategory').value = '';
  if (state.viewMode === 'calendar') {
    goCalToday();
  } else {
    document.getElementById('filterYear').value = '';
    document.getElementById('filterMonth').value = '0';
    loadRepairs(1);
  }
}

document.getElementById('filterQ').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') applyFilters();
});

function openPdfModal(title, pdfUrl) {
  if (!state.user?.isAdmin) {
    alert('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถดาวน์โหลดหรือพิมพ์เอกสารได้');
    return;
  }
  const modal = document.getElementById('detailModal');
  const frame = document.getElementById('pdfFrame');
  const loading = document.getElementById('pdfLoading');
  const dlBtn = document.getElementById('pdfDownloadBtn');
  const newTabBtn = document.getElementById('pdfNewTabBtn');

  document.getElementById('pdfModalTitle').textContent = title;
  const sep = pdfUrl.includes('?') ? '&' : '?';
  dlBtn.href = `${pdfUrl}${sep}download=1`;
  newTabBtn.href = pdfUrl;

  loading.classList.remove('hidden');
  frame.onload = () => loading.classList.add('hidden');
  frame.src = pdfUrl;
  modal.classList.remove('hidden');
}

function closePdfModal() {
  document.getElementById('pdfFrame').src = 'about:blank';
  closeModal('detailModal');
}

function printPdfFrame() {
  const frame = document.getElementById('pdfFrame');
  try {
    frame.contentWindow.focus();
    frame.contentWindow.print();
  } catch {
    window.open(document.getElementById('pdfNewTabBtn').href, '_blank');
  }
}

async function openRequestDetailModal(id) {
  const r = await api(`/api/repairs/${id}`);
  const st = STATUS_MAP[r.b_status] || { label: `สถานะ ${r.b_status}`, cls: 'badge-0' };
  const unit = r.unit_name || r.unit_out || '-';
  const techs = r.equipNames && r.equipNames.length ? r.equipNames.join(', ') : '-';
  document.getElementById('reqDetailTitle').textContent = `รายละเอียดการแจ้งซ่อม #${r.row_id}`;
  document.getElementById('reqDetailBody').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;font-size:14px;">
      <div><strong>เลขที่ใบแจ้งซ่อม:</strong> #${r.row_id}</div>
      <div><strong>สถานะ:</strong> <span class="badge ${st.cls}">${st.label}</span></div>
      <div><strong>วันที่แจ้ง:</strong> ${fmtThaiDate(r.datemeet)}</div>
      <div><strong>เวลา:</strong> ${esc(r.s_time || '-')}${r.e_time ? ' - ' + esc(r.e_time) : ''}</div>
      <div style="grid-column:1/-1;"><strong>อาการ / เรื่องที่แจ้ง:</strong> ${esc(r.subject || '-')}</div>
      <div><strong>ประเภทรายการซ่อม:</strong> ${esc(r.room_name || '-')}</div>
      <div><strong>สถานที่ / รหัสครุภัณฑ์:</strong> ${esc(r.perhead || '-')}${r.passenger ? ` (${esc(r.passenger)})` : ''}</div>
      <div><strong>ผู้แจ้ง:</strong> ${esc(r.numper || r.perbook || '-')}</div>
      <div><strong>เบอร์โทร:</strong> ${esc(r.tel || '-')}</div>
      <div><strong>หน่วยงาน:</strong> ${esc(unit)}</div>
      <div><strong>ช่างผู้รับผิดชอบ:</strong> ${esc(techs)}</div>
      <div style="grid-column:1/-1;"><strong>รายละเอียดเพิ่มเติม:</strong> ${esc(r.memo || '-')}</div>
      <div style="grid-column:1/-1;"><strong>ผลการดำเนินการ / ความเห็นช่าง:</strong> ${esc(r.memo1 || '-')}</div>
    </div>
  `;
  document.getElementById('requestDetailModal').classList.remove('hidden');
}

async function viewRepair(id) {
  if (state.user?.isAdmin) {
    openPdfModal(`ใบแจ้งซ่อมบำรุง #${id} (ขนาด A4)`, `/api/repairs/${id}/pdf`);
  } else {
    try {
      await openRequestDetailModal(id);
    } catch (err) {
      alert(err.message);
    }
  }
}

function printBoard() {
  const params = new URLSearchParams({
    q: document.getElementById('filterQ').value,
    year: document.getElementById('filterYear').value,
    month: document.getElementById('filterMonth').value,
    status: document.getElementById('filterStatus').value,
    room_id: document.getElementById('filterCategory').value,
  });
  openPdfModal('ตารางรายการแจ้งซ่อมบำรุง (ขนาด A4 แนวนอน)', `/api/repairs/board/pdf?${params.toString()}`);
}

// ==================== CREATE / EDIT REPAIR ====================
function toggleUnitType() {
  const isExt = document.querySelector('input[name="unitType"]:checked').value === 'external';
  document.getElementById('fgUnitInternal').classList.toggle('hidden', isExt);
  document.getElementById('fgUnitExternal').classList.toggle('hidden', !isExt);
}

function resetRepairForm() {
  document.getElementById('repairForm').reset();
  document.getElementById('fRowId').value = '';
  document.getElementById('repairFormTitle').textContent = 'แบบบันทึกการแจ้งซ่อมบำรุง';
  document.getElementById('fDatemeet').value = new Date().toISOString().slice(0, 10);
  document.querySelector('input[name="unitType"][value="internal"]').checked = true;
  toggleUnitType();
  if (state.user) {
    document.getElementById('fNumper').value = state.user.fullName;
    document.getElementById('fTel').value = state.user.telephone || '';
    if (state.user.unit_id) document.getElementById('fUnitId').value = state.user.unit_id;
  }
}

async function editRepair(id) {
  const r = await api(`/api/repairs/${id}`);
  switchTab('create');
  document.getElementById('repairFormTitle').textContent = `แก้ไขใบแจ้งซ่อม #${r.row_id}`;
  document.getElementById('fRowId').value = r.row_id;

  const isExt = !!r.unit_out;
  document.querySelector(`input[name="unitType"][value="${isExt ? 'external' : 'internal'}"]`).checked = true;
  toggleUnitType();
  document.getElementById('fUnitId').value = r.unit_id || 0;
  document.getElementById('fUnitOut').value = r.unit_out || '';
  document.getElementById('fRoomId').value = r.room_id || 0;
  document.getElementById('fSubject').value = r.subject || '';
  document.getElementById('fPerhead').value = r.perhead || '';
  document.getElementById('fPassenger').value = r.passenger || '';
  document.getElementById('fNumper').value = r.numper || '';
  document.getElementById('fTel').value = r.tel || '';
  document.getElementById('fDatemeet').value = (r.datemeet || '').slice(0, 10);
  document.getElementById('fStime').value = r.s_time || '08:30';
  document.getElementById('fEtime').value = r.e_time || '16:30';
  document.getElementById('fMemo').value = r.memo || '';

  if (state.user?.isAdmin) {
    document.getElementById('fStatus').value = String(r.b_status ?? 0);
    document.getElementById('fPrice').value = r.pricefixing || 0;
    document.getElementById('fMemo1').value = r.memo1 || '';
    document.querySelectorAll('input[name="equipCheck"]').forEach((cb) => {
      cb.checked = r.equipIds.includes(cb.value);
    });
  }
}

async function submitRepair(e) {
  e.preventDefault();
  if (!state.user) return openLoginModal();

  const id = document.getElementById('fRowId').value;
  const isExt = document.querySelector('input[name="unitType"]:checked').value === 'external';
  const equipIds = Array.from(document.querySelectorAll('input[name="equipCheck"]:checked')).map((c) => c.value);

  const payload = {
    unit_id: isExt ? 0 : Number(document.getElementById('fUnitId').value || 0),
    unit_out: isExt ? document.getElementById('fUnitOut').value : '',
    room_id: Number(document.getElementById('fRoomId').value || 0),
    subject: document.getElementById('fSubject').value,
    perhead: document.getElementById('fPerhead').value,
    passenger: document.getElementById('fPassenger').value,
    numper: document.getElementById('fNumper').value,
    tel: document.getElementById('fTel').value,
    datemeet: document.getElementById('fDatemeet').value,
    s_time: document.getElementById('fStime').value,
    e_time: document.getElementById('fEtime').value,
    memo: document.getElementById('fMemo').value,
    equipIds,
    b_status: Number(document.getElementById('fStatus').value || 0),
    pricefixing: Number(document.getElementById('fPrice').value || 0),
    memo1: document.getElementById('fMemo1').value,
  };

  try {
    if (id) {
      await api(`/api/repairs/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      alert('บันทึกการแก้ไขเรียบร้อยแล้ว');
    } else {
      await api('/api/repairs', { method: 'POST', body: JSON.stringify(payload) });
      alert('บันทึกการแจ้งซ่อมเรียบร้อยแล้ว');
    }
    resetRepairForm();
    await loadStats();
    switchTab('list');
  } catch (err) {
    alert(err.message);
  }
}

async function deleteRepair(id) {
  if (!confirm(`ยืนยันการลบใบแจ้งซ่อม #${id} ?`)) return;
  await api(`/api/repairs/${id}`, { method: 'DELETE' });
  await loadStats();
  loadRepairs(state.page);
}

// ==================== REPORTS ====================
function toggleReportMode() {
  const mode = document.getElementById('repMode').value;
  document.getElementById('repDate').classList.toggle('hidden', mode !== 'date');
  document.getElementById('repMonth').classList.toggle('hidden', mode !== 'month');
  document.getElementById('repYear').classList.toggle('hidden', mode !== 'month');
  document.getElementById('repFiscalYear').classList.toggle('hidden', mode !== 'fiscal');
}

function getReportQueryString() {
  const mode = document.getElementById('repMode').value;
  const params = new URLSearchParams();
  if (mode === 'date') {
    const d = document.getElementById('repDate').value;
    if (d) params.set('date', d);
  } else if (mode === 'month') {
    const y = document.getElementById('repYear').value;
    const m = document.getElementById('repMonth').value;
    if (y) params.set('year', y);
    if (m && m !== '0') params.set('month', m);
  } else if (mode === 'fiscal') {
    const fy = document.getElementById('repFiscalYear').value;
    if (fy) params.set('fiscalYear', fy);
  }
  return params.toString();
}

function printReportSection(section, title) {
  const qs = getReportQueryString();
  const url = `/api/reports/pdf?section=${section}${qs ? '&' + qs : ''}`;
  openPdfModal(`${title} (ขนาด A4)`, url);
}

async function loadReports() {
  const qs = getReportQueryString();
  const data = await api(`/api/reports/summary${qs ? '?' + qs : ''}`);

  const renderTable = (title, section, headers, rowsHtml) => `
    <div class="report-box">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
        <h3 style="margin:0;">${title}</h3>
        ${state.user?.isAdmin ? `<button class="btn btn-outline btn-sm" onclick="printReportSection('${section}', '${title}')">🖨️ พิมพ์ / PDF</button>` : ''}
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${rowsHtml || '<tr><td colspan="3">ไม่มีข้อมูล</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;

  const deptRows = data.byDepartment
    .map((r) => `<tr><td>${esc(r.name)}</td><td>${r.total}</td><td>${Number(r.price).toLocaleString()}</td></tr>`)
    .join('');

  const catRows = data.byCategory
    .map((r) => `<tr><td>${esc(r.name)}</td><td>${r.total}</td><td>${Number(r.price).toLocaleString()}</td></tr>`)
    .join('');

  const techRows = data.byTechnician
    .map((r) => {
      const jobsList = (r.jobs || [])
        .map((j) => `<div style="font-size:12px;color:#475569;">• ${fmtThaiDate(j.datemeet)}: ${esc(j.subject)}</div>`)
        .join('');
      return `<tr><td><strong>${esc(r.name)}</strong></td><td style="white-space:nowrap"><strong>${r.total}</strong> งาน</td><td>${jobsList || '-'}</td></tr>`;
    })
    .join('');

  const statusRows = data.byStatus
    .map((r) => `<tr><td>${(STATUS_MAP[r.b_status] || {}).label || r.b_status}</td><td>${r.total}</td></tr>`)
    .join('');

  const scopeRows = `
    <tr><td>ภายในโรงพยาบาล</td><td>${data.internalCount}</td></tr>
    <tr><td>หน่วยงานภายนอก (CUP)</td><td>${data.externalCount}</td></tr>
  `;

  document.getElementById('reportsContent').innerHTML =
    renderTable('รายงานสรุปตามช่างผู้รับผิดชอบ', 'technician', ['ชื่อช่าง', 'จำนวนงาน', 'รายละเอียดงานล่าสุด'], techRows) +
    renderTable('รายงานสรุปตามประเภทรายการซ่อม', 'category', ['ประเภท', 'จำนวน', 'ค่าใช้จ่าย (บ.)'], catRows) +
    renderTable('รายงานสรุปตามหน่วยงาน', 'department', ['หน่วยงาน', 'จำนวน', 'ค่าใช้จ่าย (บ.)'], deptRows) +
    renderTable('รายงานสรุปตามสถานะ & พื้นที่', 'status', ['รายการ', 'จำนวน (ครั้ง)'], statusRows + scopeRows);
}

// ==================== ADMIN APPROVAL & ASSIGNMENT ====================
async function loadAdminList(page = 1) {
  const params = new URLSearchParams({
    page,
    limit: 30,
    status: document.getElementById('adminFilterStatus').value,
    q: document.getElementById('adminFilterQ').value,
  });
  const data = await api(`/api/repairs?${params.toString()}`);
  const tbody = document.getElementById('adminTbody');

  if (!data.items.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#64748b;padding:24px;">ไม่พบรายการในสถานะที่เลือก</td></tr>';
  } else {
    tbody.innerHTML = data.items
      .map((r) => {
        const st = STATUS_MAP[r.b_status] || { label: r.b_status, cls: 'badge-0' };
        const unit = r.unit_name || r.unit_out || '-';
        const assignee = [...(r.equipNames || []), r.assigned_to || ''].filter(Boolean).join(', ') || '-';
        return `
          <tr>
            <td><strong>#${r.row_id}</strong></td>
            <td style="white-space:nowrap">${fmtThaiDate(r.datemeet)}<br><small style="color:#64748b">${esc(r.s_time || '')}</small></td>
            <td><strong>${esc(r.subject)}</strong>${r.perhead ? `<br><small style="color:#64748b">ครุภัณฑ์: ${esc(r.perhead)}</small>` : ''}</td>
            <td>${esc(unit)}</td>
            <td>${esc(r.numper || r.perbook || '-')}</td>
            <td>${esc(assignee)}</td>
            <td><span class="badge ${st.cls}">${st.label}</span></td>
            <td style="white-space:nowrap">
              <button class="btn btn-outline btn-sm" onclick="viewRepair(${r.row_id})">👁️ ดู PDF</button>
              <button class="btn btn-primary btn-sm" onclick="openAdminActionModal(${r.row_id})">✅ อนุมัติ / มอบหมาย</button>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  document.getElementById('adminPagination').innerHTML = `
    <div>ทั้งหมด <strong>${data.total.toLocaleString()}</strong> รายการ (หน้า ${data.page} / ${data.totalPages})</div>
    <div style="display:flex;gap:6px;">
      <button class="btn btn-outline btn-sm" ${data.page <= 1 ? 'disabled' : ''} onclick="loadAdminList(${data.page - 1})">◀ ก่อนหน้า</button>
      <button class="btn btn-outline btn-sm" ${data.page >= data.totalPages ? 'disabled' : ''} onclick="loadAdminList(${data.page + 1})">ถัดไป ▶</button>
    </div>
  `;
}

async function openAdminActionModal(id) {
  const r = await api(`/api/repairs/${id}`);
  document.getElementById('aaRowId').textContent = r.row_id;
  document.getElementById('aaId').value = r.row_id;
  document.getElementById('aaSummary').innerHTML = `
    <strong>เรื่อง:</strong> ${esc(r.subject)}<br>
    <strong>หน่วยงาน:</strong> ${esc(r.unit_name || r.unit_out || '-')} | <strong>ผู้แจ้ง:</strong> ${esc(r.numper || '-')} | <strong>วันที่:</strong> ${fmtThaiDate(r.datemeet)}
  `;
  document.getElementById('aaStatus').value = String(r.b_status ?? 0);
  document.getElementById('aaAssignedTo').value = r.assigned_to || '';
  document.getElementById('aaPrice').value = r.pricefixing || 0;
  document.getElementById('aaMemo1').value = r.memo1 || '';

  document.getElementById('aaEquipChecks').innerHTML = state.technicians
    .map((t) => `<label><input type="checkbox" name="aaEquip" value="${t.row_id}" ${r.equipIds.includes(String(t.row_id)) ? 'checked' : ''} /> ${esc(t.name)}</label>`)
    .join('');

  document.getElementById('adminActionModal').classList.remove('hidden');
}

async function submitAdminAction(e) {
  e.preventDefault();
  const id = document.getElementById('aaId').value;
  const equipIds = Array.from(document.querySelectorAll('input[name="aaEquip"]:checked')).map((c) => c.value);
  await api(`/api/repairs/${id}/approve`, {
    method: 'PATCH',
    body: JSON.stringify({
      b_status: Number(document.getElementById('aaStatus').value),
      equipIds,
      assigned_to: document.getElementById('aaAssignedTo').value,
      pricefixing: Number(document.getElementById('aaPrice').value || 0),
      memo1: document.getElementById('aaMemo1').value,
    }),
  });
  closeModal('adminActionModal');
  await loadStats();
  loadAdminList(1);
}

// ==================== MASTER CRUD ====================
function renderCategories() {
  document.getElementById('categoriesTbody').innerHTML = state.categories
    .map(
      (c) => `
      <tr>
        <td>${c.row_id}</td>
        <td><strong>${esc(c.name)}</strong></td>
        <td>${esc(c.place || '-')}</td>
        <td>${esc(c.tel || '-')}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="openMasterModal('category', ${c.row_id})">แก้ไข</button>
          <button class="btn btn-danger btn-sm" onclick="deleteMaster('categories', ${c.row_id}, renderCategories)">ลบ</button>
        </td>
      </tr>`
    )
    .join('');
}

function renderTechnicians() {
  document.getElementById('techniciansTbody').innerHTML = state.technicians
    .map(
      (t) => `
      <tr>
        <td>${t.row_id}</td>
        <td><strong>${esc(t.name)}</strong></td>
        <td>${esc(t.tel || '-')}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="openMasterModal('technician', ${t.row_id})">แก้ไข</button>
          <button class="btn btn-danger btn-sm" onclick="deleteMaster('technicians', ${t.row_id}, renderTechnicians)">ลบ</button>
        </td>
      </tr>`
    )
    .join('');
}

function renderUnits() {
  document.getElementById('unitsTbody').innerHTML = state.units
    .map(
      (u) => `
      <tr>
        <td>${u.row_id}</td>
        <td>${esc(u.unit_code || '-')}</td>
        <td><strong>${esc(u.unit_name)}</strong></td>
        <td>${esc(u.unit_head || '-')}</td>
        <td>${esc(u.tel || '-')}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="openMasterModal('unit', ${u.row_id})">แก้ไข</button>
          <button class="btn btn-danger btn-sm" onclick="deleteMaster('units', ${u.row_id}, renderUnits)">ลบ</button>
        </td>
      </tr>`
    )
    .join('');
}

let cachedUsers = [];
async function loadUsers() {
  cachedUsers = await api('/api/users');
  document.getElementById('usersTbody').innerHTML = cachedUsers
    .map(
      (u) => `
      <tr>
        <td>${u.row_id}</td>
        <td><strong>${esc(u.title)}${esc(u.fname)} ${esc(u.lname)}</strong></td>
        <td>${esc(u.puchai)}</td>
        <td>${esc(u.unit_name || '-')}</td>
        <td>${esc(u.telephone || '-')}</td>
        <td><span class="badge ${u.usertype === 'adminn' ? 'badge-1' : 'badge-6'}">${u.usertype === 'adminn' ? 'ช่าง/Admin' : 'ผู้ใช้ทั่วไป'}</span></td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="openMasterModal('user', ${u.row_id})">แก้ไข</button>
          <button class="btn btn-danger btn-sm" onclick="deleteMaster('users', ${u.row_id}, loadUsers)">ลบ</button>
        </td>
      </tr>`
    )
    .join('');
}

function openMasterModal(type, id = null) {
  state.masterType = type;
  state.masterEditId = id;
  const form = document.getElementById('masterForm');
  const title = document.getElementById('masterModalTitle');

  if (type === 'category') {
    const item = id ? state.categories.find((x) => x.row_id === id) : {};
    title.textContent = id ? 'แก้ไขประเภทรายการซ่อม' : 'เพิ่มประเภทรายการซ่อม';
    form.innerHTML = `
      <div class="form-group"><label>ชื่อประเภทรายการซ่อม *</label><input name="name" required value="${esc(item.name || '')}" /></div>
      <div class="form-group"><label>สถานที่ / กลุ่มงาน</label><input name="place" value="${esc(item.place || '')}" /></div>
      <div class="form-group"><label>เบอร์โทร</label><input name="tel" value="${esc(item.tel || '')}" /></div>
      <div class="form-actions"><button class="btn btn-primary full-btn" type="submit">บันทึก</button></div>
    `;
  } else if (type === 'technician') {
    const item = id ? state.technicians.find((x) => x.row_id === id) : {};
    title.textContent = id ? 'แก้ไขข้อมูลช่าง' : 'เพิ่มข้อมูลช่าง';
    form.innerHTML = `
      <div class="form-group"><label>ชื่อ-นามสกุลช่าง *</label><input name="name" required value="${esc(item.name || '')}" /></div>
      <div class="form-group"><label>เบอร์โทร</label><input name="tel" value="${esc(item.tel || '')}" /></div>
      <div class="form-actions"><button class="btn btn-primary full-btn" type="submit">บันทึก</button></div>
    `;
  } else if (type === 'unit') {
    const item = id ? state.units.find((x) => x.row_id === id) : {};
    title.textContent = id ? 'แก้ไขหน่วยงาน' : 'เพิ่มหน่วยงาน';
    form.innerHTML = `
      <div class="form-group"><label>รหัสหน่วยงาน</label><input name="unit_code" value="${esc(item.unit_code || '')}" /></div>
      <div class="form-group"><label>ชื่อหน่วยงาน *</label><input name="unit_name" required value="${esc(item.unit_name || '')}" /></div>
      <div class="form-group"><label>หัวหน้าหน่วยงาน</label><input name="unit_head" value="${esc(item.unit_head || '')}" /></div>
      <div class="form-group"><label>เบอร์โทร</label><input name="tel" value="${esc(item.tel || '')}" /></div>
      <div class="form-actions"><button class="btn btn-primary full-btn" type="submit">บันทึก</button></div>
    `;
  } else if (type === 'user') {
    const item = id ? cachedUsers.find((x) => x.row_id === id) : {};
    title.textContent = id ? 'แก้ไขผู้ใช้งาน' : 'เพิ่มผู้ใช้งาน';
    const unitOpts = state.units.map((u) => `<option value="${u.row_id}" ${u.row_id === item.unit_id ? 'selected' : ''}>${esc(u.unit_name)}</option>`).join('');
    form.innerHTML = `
      <div class="form-group"><label>คำนำหน้า</label><input name="title" value="${esc(item.title || '')}" /></div>
      <div class="form-group"><label>ชื่อ *</label><input name="fname" required value="${esc(item.fname || '')}" /></div>
      <div class="form-group"><label>นามสกุล</label><input name="lname" value="${esc(item.lname || '')}" /></div>
      <div class="form-group"><label>หน่วยงาน</label><select name="unit_id"><option value="0">-- เลือก --</option>${unitOpts}</select></div>
      <div class="form-group"><label>เบอร์โทร</label><input name="telephone" value="${esc(item.telephone || '')}" /></div>
      <div class="form-group"><label>Username *</label><input name="puchai" required value="${esc(item.puchai || '')}" /></div>
      <div class="form-group"><label>Password ${id ? '(เว้นว่างหากไม่เปลี่ยน)' : '*'}</label><input name="rahuspan" type="password" ${id ? '' : 'required'} /></div>
      <div class="form-group"><label>สิทธิ์การใช้งาน</label>
        <select name="usertype">
          <option value="user" ${item.usertype !== 'adminn' ? 'selected' : ''}>ผู้ใช้ทั่วไป</option>
          <option value="adminn" ${item.usertype === 'adminn' ? 'selected' : ''}>ผู้ดูแลระบบ (ช่าง)</option>
        </select>
      </div>
      <div class="form-actions"><button class="btn btn-primary full-btn" type="submit">บันทึก</button></div>
    `;
  }

  document.getElementById('masterModal').classList.remove('hidden');
}

async function submitMaster(e) {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target).entries());
  const endpointMap = { category: 'categories', technician: 'technicians', unit: 'units', user: 'users' };
  const ep = endpointMap[state.masterType];

  try {
    if (state.masterEditId) {
      await api(`/api/${ep}/${state.masterEditId}`, { method: 'PUT', body: JSON.stringify(fd) });
    } else {
      await api(`/api/${ep}`, { method: 'POST', body: JSON.stringify(fd) });
    }
    closeModal('masterModal');
    await loadMasterLists();
    if (state.masterType === 'category') renderCategories();
    if (state.masterType === 'technician') renderTechnicians();
    if (state.masterType === 'unit') renderUnits();
    if (state.masterType === 'user') loadUsers();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteMaster(ep, id, refreshFn) {
  if (!confirm('ยืนยันการลบข้อมูลนี้ ?')) return;
  await api(`/api/${ep}/${id}`, { method: 'DELETE' });
  await loadMasterLists();
  refreshFn();
}

// ==================== LOGIN / MODALS ====================
function openLoginModal() {
  document.getElementById('loginError').classList.add('hidden');
  const closeBtn = document.querySelector('#loginModal .close-btn');
  if (closeBtn) closeBtn.classList.toggle('hidden', !state.user);
  document.getElementById('loginModal').classList.remove('hidden');
  document.getElementById('loginUser').focus();
}

function closeModal(id) {
  if (id === 'loginModal' && !state.user) return;
  document.getElementById(id).classList.add('hidden');
}

async function submitLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('loginError');
  errEl.classList.add('hidden');
  try {
    await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('loginUser').value,
        password: document.getElementById('loginPass').value,
      }),
    });
    await loadAuth();
    closeModal('loginModal');
    loadRepairs(state.page);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  state.user = null;
  renderAuth();
  switchTab('list');
  openLoginModal();
}

init();
