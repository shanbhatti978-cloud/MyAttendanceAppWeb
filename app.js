// ============================================================
// AUTH — SHA-256 password hashing (matches the mobile app's
// `crypto` package, which also just does a plain SHA-256 hex digest
// of the UTF-8 password string, so the same password produces the
// same hash on both sides).
// ============================================================
async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

let currentUser = null; // { username, role }

function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast ' + type;
  setTimeout(() => toast.classList.add('hidden'), 3500);
}

// ============================================================
// LOGIN
// ============================================================
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Logging in...';

  try {
    const passwordHash = await sha256Hex(password);
    const { data, error } = await db
      .from('app_users')
      .select('username, role, password_hash')
      .eq('username', username)
      .maybeSingle();

    if (error) throw error;

    if (!data || data.password_hash !== passwordHash) {
      errorEl.textContent = 'Invalid username or password.';
      return;
    }
    if (data.role !== 'Admin' && data.role !== 'Supervisor') {
      errorEl.textContent = 'This account does not have web dashboard access.';
      return;
    }

    currentUser = { username: data.username, role: data.role };
    sessionStorage.setItem('rams_user', JSON.stringify(currentUser));
    enterApp();
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'Could not reach the server. Check your internet connection.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'LOGIN';
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  currentUser = null;
  sessionStorage.removeItem('rams_user');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
});

function enterApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('userLabel').textContent = `${currentUser.username} (${currentUser.role})`;
  loadDashboard();
}

// Restore session on page refresh
(function restoreSession() {
  const saved = sessionStorage.getItem('rams_user');
  if (saved) {
    currentUser = JSON.parse(saved);
    enterApp();
  }
})();

// ============================================================
// NAVIGATION
// ============================================================
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    btn.classList.add('active');
    const view = btn.dataset.view;
    document.getElementById('view-' + view).classList.remove('hidden');
    if (view === 'dashboard') loadDashboard();
    if (view === 'employees') loadEmployees();
    if (view === 'leave') loadLeaveRequests();
  });
});

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const kpiGrid = document.getElementById('kpiGrid');
  kpiGrid.innerHTML = '<div class="empty-state">Loading...</div>';

  try {
    const [{ count: totalEmployees }, { data: todayAttendance }, { data: recentLeave }] = await Promise.all([
      db.from('employees').select('id', { count: 'exact', head: true }).eq('status', 'Active'),
      db.from('attendance').select('status').eq('date', today),
      db.from('leave_requests').select('*').order('applied_at', { ascending: false }).limit(5),
    ]);

    const counts = { Present: 0, Absent: 0, Leave: 0, 'Weekly Rest': 0 };
    (todayAttendance || []).forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });

    kpiGrid.innerHTML = `
      ${kpiCard(totalEmployees || 0, 'Total Employees', 'var(--primary)')}
      ${kpiCard(counts.Present, 'Present Today', 'var(--success)')}
      ${kpiCard(counts.Absent, 'Absent Today', 'var(--danger)')}
      ${kpiCard(counts.Leave, 'Leave Today', 'var(--warning)')}
      ${kpiCard(counts['Weekly Rest'], 'Weekly Rest Today', 'var(--rest)')}
    `;

    const leaveListEl = document.getElementById('recentLeaveList');
    if (!recentLeave || recentLeave.length === 0) {
      leaveListEl.innerHTML = '<div class="empty-state">No leave requests yet.</div>';
    } else {
      leaveListEl.innerHTML = recentLeave.map(r => `
        <div class="info-card">
          <div class="info-card-title">${escapeHtml(r.employee_code)} — ${escapeHtml(r.leave_type)}
            <span class="badge badge-${r.status.toLowerCase()}">${r.status}</span>
          </div>
          <div class="info-card-sub">${r.from_date} to ${r.to_date} • Applied by ${escapeHtml(r.applied_by || '-')}</div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error(err);
    kpiGrid.innerHTML = '<div class="empty-state">Could not load dashboard data.</div>';
  }
}

function kpiCard(value, label, color) {
  return `<div class="kpi-card"><div class="kpi-value" style="color:${color}">${value}</div><div class="kpi-label">${label}</div></div>`;
}

// ============================================================
// EMPLOYEES
// ============================================================
let allEmployees = [];

async function loadEmployees() {
  const wrap = document.getElementById('employeeTableWrap');
  wrap.innerHTML = '<div class="empty-state">Loading...</div>';
  try {
    const { data, error } = await db.from('employees').select('*').order('name');
    if (error) throw error;
    allEmployees = data || [];
    renderEmployeeTable(allEmployees);
  } catch (err) {
    console.error(err);
    wrap.innerHTML = '<div class="empty-state">Could not load employees.</div>';
  }
}

function renderEmployeeTable(list) {
  const wrap = document.getElementById('employeeTableWrap');
  if (list.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No employees found.</div>';
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead><tr><th>Code</th><th>Name</th><th>Designation</th><th>Department</th><th>Unit</th><th>Shift</th><th>Status</th></tr></thead>
      <tbody>
        ${list.map(e => `
          <tr>
            <td>${escapeHtml(e.employee_code)}</td>
            <td>${escapeHtml(e.name)}</td>
            <td>${escapeHtml(e.designation || '-')}</td>
            <td>${escapeHtml(e.department || '-')}</td>
            <td>${escapeHtml(e.unit_number || '-')}</td>
            <td>${escapeHtml(e.shift || '-')}</td>
            <td><span class="badge ${e.status === 'Active' ? 'badge-present' : 'badge-absent'}">${e.status}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

document.getElementById('employeeSearch').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  const filtered = allEmployees.filter(emp =>
    (emp.name || '').toLowerCase().includes(q) ||
    (emp.employee_code || '').toLowerCase().includes(q) ||
    (emp.designation || '').toLowerCase().includes(q)
  );
  renderEmployeeTable(filtered);
});

// ============================================================
// ATTENDANCE BY DATE
// ============================================================
document.getElementById('attendanceDate').valueAsDate = new Date();
document.getElementById('attendanceLoadBtn').addEventListener('click', loadAttendanceForDate);

async function loadAttendanceForDate() {
  const date = document.getElementById('attendanceDate').value;
  if (!date) { showToast('Pick a date first', 'error'); return; }

  const wrap = document.getElementById('attendanceTableWrap');
  const kpiEl = document.getElementById('attendanceKpi');
  wrap.innerHTML = '<div class="empty-state">Loading...</div>';
  kpiEl.innerHTML = '';

  try {
    const { data, error } = await db.from('attendance').select('*').eq('date', date);
    if (error) throw error;

    const counts = { Present: 0, Absent: 0, Leave: 0, 'Weekly Rest': 0 };
    (data || []).forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
    kpiEl.innerHTML = `
      ${kpiCard(counts.Present, 'Present', 'var(--success)')}
      ${kpiCard(counts.Absent, 'Absent', 'var(--danger)')}
      ${kpiCard(counts.Leave, 'Leave', 'var(--warning)')}
      ${kpiCard(counts['Weekly Rest'], 'Weekly Rest', 'var(--rest)')}
    `;

    if (!data || data.length === 0) {
      wrap.innerHTML = '<div class="empty-state">No attendance records for this date yet.</div>';
      return;
    }

    const badgeClass = { Present: 'badge-present', Absent: 'badge-absent', Leave: 'badge-leave', 'Weekly Rest': 'badge-rest' };
    wrap.innerHTML = `
      <table>
        <thead><tr><th>Employee Code</th><th>Status</th></tr></thead>
        <tbody>
          ${data.sort((a, b) => a.employee_code.localeCompare(b.employee_code)).map(r => `
            <tr>
              <td>${escapeHtml(r.employee_code)}</td>
              <td><span class="badge ${badgeClass[r.status] || ''}">${r.status}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.error(err);
    wrap.innerHTML = '<div class="empty-state">Could not load attendance.</div>';
  }
}

// ============================================================
// LEAVE REQUESTS (view + approve/reject)
// ============================================================
document.getElementById('leaveStatusFilter').addEventListener('change', loadLeaveRequests);

async function loadLeaveRequests() {
  const status = document.getElementById('leaveStatusFilter').value;
  const wrap = document.getElementById('leaveTableWrap');
  wrap.innerHTML = '<div class="empty-state">Loading...</div>';

  try {
    let query = db.from('leave_requests').select('*').order('applied_at', { ascending: false });
    if (status !== 'All') query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;

    if (!data || data.length === 0) {
      wrap.innerHTML = '<div class="empty-state">No leave requests here.</div>';
      return;
    }

    wrap.innerHTML = data.map(r => `
      <div class="info-card" style="margin-bottom:10px;">
        <div class="info-card-title">${escapeHtml(r.employee_code)} — ${escapeHtml(r.leave_type)}
          <span class="badge badge-${r.status.toLowerCase()}">${r.status}</span>
        </div>
        <div class="info-card-sub">
          ${r.from_date} to ${r.to_date} • Applied by ${escapeHtml(r.applied_by || '-')}<br>
          ${r.reason ? 'Reason: ' + escapeHtml(r.reason) : ''}
          ${r.status !== 'Pending' && r.decided_by ? `<br>${r.status} by ${escapeHtml(r.decided_by)}${r.remarks ? ' — ' + escapeHtml(r.remarks) : ''}` : ''}
        </div>
        ${r.status === 'Pending' ? `
          <div style="margin-top:10px; display:flex; gap:8px;">
            <button class="btn-sm btn-approve" onclick="decideLeave('${r.id}', true)">Approve</button>
            <button class="btn-sm btn-reject" onclick="decideLeave('${r.id}', false)">Reject</button>
          </div>
        ` : ''}
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
    wrap.innerHTML = '<div class="empty-state">Could not load leave requests.</div>';
  }
}

async function decideLeave(requestId, approve) {
  const remarks = prompt(approve ? 'Approve this leave request. Any remarks? (optional)' : 'Reject this leave request. Any remarks? (optional)') || '';

  try {
    const { data: request, error: fetchErr } = await db.from('leave_requests').select('*').eq('id', requestId).single();
    if (fetchErr) throw fetchErr;

    const newStatus = approve ? 'Approved' : 'Rejected';
    const { error: updateErr } = await db.from('leave_requests').update({
      status: newStatus,
      decided_by: currentUser.username,
      decided_at: new Date().toISOString(),
      remarks: remarks,
      updated_at: new Date().toISOString(),
    }).eq('id', requestId);
    if (updateErr) throw updateErr;

    // Approving marks attendance as "Leave" for every date in the
    // range — mirrors exactly what the mobile app does, so a request
    // approved from the web shows up correctly on phones after their
    // next sync.
    if (approve) {
      const dates = dateRange(request.from_date, request.to_date);
      const rows = dates.map(d => ({
        employee_code: request.employee_code,
        date: d,
        status: 'Leave',
        updated_at: new Date().toISOString(),
      }));
      const { error: attErr } = await db.from('attendance').upsert(rows, { onConflict: 'employee_code,date' });
      if (attErr) throw attErr;
    }

    showToast(`Leave request ${newStatus.toLowerCase()}.`, 'success');
    loadLeaveRequests();
  } catch (err) {
    console.error(err);
    showToast('Could not update this request. Try again.', 'error');
  }
}

function dateRange(from, to) {
  const dates = [];
  let cur = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// ============================================================
// MONTHLY REPORT
// ============================================================
document.getElementById('reportMonth').value = new Date().toISOString().slice(0, 7);
document.getElementById('reportLoadBtn').addEventListener('click', loadMonthlyReport);

async function loadMonthlyReport() {
  const month = document.getElementById('reportMonth').value; // "YYYY-MM"
  if (!month) { showToast('Pick a month first', 'error'); return; }

  const wrap = document.getElementById('reportTableWrap');
  wrap.innerHTML = '<div class="empty-state">Loading...</div>';

  try {
    const [{ data: employees, error: empErr }, { data: attendance, error: attErr }] = await Promise.all([
      db.from('employees').select('employee_code, name, designation').eq('status', 'Active'),
      db.from('attendance').select('employee_code, status').like('date', `${month}%`),
    ]);
    if (empErr) throw empErr;
    if (attErr) throw attErr;

    const byEmployee = {};
    (attendance || []).forEach(r => {
      byEmployee[r.employee_code] = byEmployee[r.employee_code] || { Present: 0, Absent: 0, Leave: 0, 'Weekly Rest': 0 };
      if (byEmployee[r.employee_code][r.status] !== undefined) byEmployee[r.employee_code][r.status]++;
    });

    if (!employees || employees.length === 0) {
      wrap.innerHTML = '<div class="empty-state">No employees found.</div>';
      return;
    }

    wrap.innerHTML = `
      <table>
        <thead><tr><th>Code</th><th>Name</th><th>Present</th><th>Absent</th><th>Leave</th><th>Weekly Rest</th><th>Attendance %</th></tr></thead>
        <tbody>
          ${employees.map(e => {
            const c = byEmployee[e.employee_code] || { Present: 0, Absent: 0, Leave: 0, 'Weekly Rest': 0 };
            const workingDays = c.Present + c.Absent;
            const pct = workingDays > 0 ? ((c.Present / workingDays) * 100).toFixed(1) : '0.0';
            return `
              <tr>
                <td>${escapeHtml(e.employee_code)}</td>
                <td>${escapeHtml(e.name)}</td>
                <td>${c.Present}</td>
                <td>${c.Absent}</td>
                <td>${c.Leave}</td>
                <td>${c['Weekly Rest']}</td>
                <td>${pct}%</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.error(err);
    wrap.innerHTML = '<div class="empty-state">Could not load the report.</div>';
  }
}

// ============================================================
// UTIL
// ============================================================
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
