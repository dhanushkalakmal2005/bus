/* ============================================================
   admin-routes.js — Route, Service & User Management Logic
   Connected to PHP backend API and authenticated admin session
   ============================================================ */

/* ── API Base URL ────────────────────────────────────────────── */
const API = 'api';

let sessionUser = null;

/* ── In-Memory Cache (populated from DB) ────────────────────── */
let routes    = [];
let schedules = [];
let stops     = [];
let shuttles  = [];
let bookings  = [];
let drivers   = [];
let users     = [];

/* ── Editing State ──────────────────────────────────────────── */
let editingRouteId   = null;
let editingSchedId   = null;
let editingStopId    = null;
let editingShuttleId = null;

/* ── Generic API helpers ────────────────────────────────────── */
async function apiFetch(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  } catch (err) {
    toast('API Error: ' + err.message, 'error');
    throw err;
  }
}

/* ── Authentication Guard ───────────────────────────────────── */
async function checkAuth() {
  try {
    const res = await fetch(`${API}/auth.php`);
    const data = await res.json();
    if (!data.authenticated || !data.user) {
      window.location.href = 'login.php?error=unauthorized';
      return false;
    }
    if (data.user.role !== 'admin') {
      window.location.href = 'login.php?error=unauthorized';
      return false;
    }
    sessionUser = data.user;

    const nameEl = document.getElementById('admin-name-display');
    if (nameEl) nameEl.textContent = sessionUser.name || sessionUser.username;

    const sAvatar = document.getElementById('admin-sidebar-avatar');
    if (sAvatar) sAvatar.textContent = sessionUser.avatar_initials || 'AD';

    const tAvatar = document.getElementById('admin-topbar-avatar');
    if (tAvatar) tAvatar.textContent = sessionUser.avatar_initials || 'AD';

    return true;
  } catch (e) {
    console.warn('Auth check error in admin portal', e);
    return true;
  }
}

/* ── Tab Logic ──────────────────────────────────────────────── */
function showTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const targetPanel = document.getElementById('panel-' + tab);
  const targetBtn   = document.getElementById('tab-btn-' + tab);
  if (targetPanel) targetPanel.classList.add('active');
  if (targetBtn) targetBtn.classList.add('active');

  // Also update sidebar item
  const sideNav = document.getElementById('nav-' + tab);
  if (sideNav) setActive(sideNav);

  if (tab === 'users') {
    loadUsers();
  }
}

function setActive(el) {
  if (!el) return;
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
}

/* ── Status Badge ───────────────────────────────────────────── */
function statusBadge(s) {
  const map = {
    'Active':'badge-green','Confirmed':'badge-green','Completed':'badge-blue',
    'Inactive':'badge-gray','Idle':'badge-amber','Suspended':'badge-amber',
    'Pending':'badge-amber','Full':'badge-amber',
    'Maintenance':'badge-red','Cancelled':'badge-red',
    'admin':'badge-purple','passenger':'badge-blue','driver':'badge-green'
  };
  return `<span class="badge ${map[s]||'badge-gray'}">${s}</span>`;
}

/* ── Render: Routes ─────────────────────────────────────────── */
function renderRoutes() {
  const tbody = document.getElementById('routes-tbody');
  if (!tbody) return;
  if (!routes.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:40px">No routes found.</td></tr>';
    return;
  }
  tbody.innerHTML = routes.map(r => `
    <tr data-search="${(r.name+r.origin+r.destination+(r.status||'')).toLowerCase()}">
      <td><span class="text-accent fw-700">${r.route_code}</span></td>
      <td>${r.name}</td>
      <td>${r.origin}</td>
      <td>${r.destination}</td>
      <td>${r.distance_km ? r.distance_km + ' km' : '—'}</td>
      <td><span class="badge badge-blue">🛑 ${r.stop_count || 0} stops</span></td>
      <td>${statusBadge(r.status)}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-secondary btn-icon btn-sm" onclick="editRoute(${r.id})" title="Edit">✏️</button>
          <button class="btn btn-danger btn-icon btn-sm" onclick="confirmDelete('route',${r.id},'Route ${r.route_code}')" title="Delete">🗑️</button>
        </div>
      </td>
    </tr>`).join('');
  const cnt = document.getElementById('cnt-routes');
  if (cnt) cnt.textContent = routes.length;
  const stat = document.getElementById('stat-routes');
  if (stat) stat.textContent = routes.filter(r => r.status === 'Active').length;
}

/* ── Render: Schedules ──────────────────────────────────────── */
function renderSchedules() {
  const tbody = document.getElementById('schedules-tbody');
  if (!tbody) return;
  if (!schedules.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:40px">No schedules found.</td></tr>';
    return;
  }
  tbody.innerHTML = schedules.map(s => {
    const dep = s.departure_time ? s.departure_time.substring(0,5) : '—';
    const arr = s.arrival_time   ? s.arrival_time.substring(0,5)   : '—';
    return `
    <tr data-search="${((s.route_name||'')+(s.shuttle_code||'')+(s.operating_days||'')+(s.status||'')).toLowerCase()}">
      <td><span class="text-accent fw-700">${s.schedule_code}</span></td>
      <td>${s.route_name}</td>
      <td>🕕 ${dep}</td>
      <td>🕑 ${arr}</td>
      <td><span class="badge badge-purple">📅 ${s.operating_days}</span></td>
      <td>${s.shuttle_code}</td>
      <td><span class="badge badge-blue">💺 ${s.available_seats}</span></td>
      <td>${statusBadge(s.status)}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-secondary btn-icon btn-sm" onclick="editSchedule(${s.id})" title="Edit">✏️</button>
          <button class="btn btn-danger btn-icon btn-sm" onclick="confirmDelete('schedule',${s.id},'Schedule ${s.schedule_code}')" title="Delete">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');
  const cnt = document.getElementById('cnt-schedules');
  if (cnt) cnt.textContent = schedules.length;
  const stat = document.getElementById('stat-schedules');
  if (stat) stat.textContent = schedules.length;
}

/* ── Render: Stops ──────────────────────────────────────────── */
function renderStops() {
  const tbody = document.getElementById('stops-tbody');
  if (!tbody) return;
  if (!stops.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:40px">No stops found.</td></tr>';
    return;
  }
  tbody.innerHTML = stops.map(s => `
    <tr data-search="${(s.name+s.address+(s.routes||'')+(s.landmark||'')).toLowerCase()}">
      <td><span class="text-accent fw-700">${s.stop_code}</span></td>
      <td>${s.name}</td>
      <td style="max-width:200px;white-space:normal">${s.address}</td>
      <td>${s.routes || '—'}</td>
      <td><span class="badge badge-blue">Stop ${s.stop_order || '—'}</span></td>
      <td>${s.landmark || '—'}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-secondary btn-icon btn-sm" onclick="editStop(${s.id})" title="Edit">✏️</button>
          <button class="btn btn-danger btn-icon btn-sm" onclick="confirmDelete('stop',${s.id},'Stop ${s.name}')" title="Delete">🗑️</button>
        </div>
      </td>
    </tr>`).join('');
  const cnt = document.getElementById('cnt-stops');
  if (cnt) cnt.textContent = stops.length;
  const stat = document.getElementById('stat-stops');
  if (stat) stat.textContent = stops.length;
}

/* ── Render: Shuttles ───────────────────────────────────────── */
function renderShuttles() {
  const tbody = document.getElementById('shuttles-tbody');
  if (!tbody) return;
  if (!shuttles.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:40px">No shuttles found.</td></tr>';
    return;
  }
  tbody.innerHTML = shuttles.map(s => `
    <tr data-search="${(s.plate_number+s.model+(s.route_name||'')+(s.driver_name||'')+(s.status||'')).toLowerCase()}">
      <td><span class="text-accent fw-700">${s.shuttle_code}</span></td>
      <td><span class="fw-700">${s.plate_number}</span></td>
      <td>${s.model}</td>
      <td><span class="badge badge-blue">💺 ${s.capacity}</span></td>
      <td>${s.route_name || 'Unassigned'}</td>
      <td>${s.driver_name || 'Unassigned'}</td>
      <td>${statusBadge(s.status)}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-secondary btn-icon btn-sm" onclick="editShuttle(${s.id})" title="Edit">✏️</button>
          <button class="btn btn-danger btn-icon btn-sm" onclick="confirmDelete('shuttle',${s.id},'Shuttle ${s.plate_number}')" title="Delete">🗑️</button>
        </div>
      </td>
    </tr>`).join('');
  const cnt = document.getElementById('cnt-shuttles');
  if (cnt) cnt.textContent = shuttles.length;
  const stat = document.getElementById('stat-shuttles');
  if (stat) stat.textContent = shuttles.length;
}

/* ── Render: Bookings ───────────────────────────────────────── */
function renderBookings() {
  const tbody = document.getElementById('bookings-tbody');
  if (!tbody) return;
  if (!bookings.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:40px">No bookings found.</td></tr>';
    return;
  }
  tbody.innerHTML = bookings.map(b => {
    const dep = b.departure_time ? b.departure_time.substring(0,5) : '—';
    return `
    <tr data-search="${(b.booking_code+(b.passenger_name||'')+(b.route_name||'')+(b.status||'')).toLowerCase()}">
      <td><span class="text-accent fw-700">${b.booking_code}</span></td>
      <td>${b.passenger_name || 'Passenger'}</td>
      <td>${b.route_name}</td>
      <td>${b.travel_date}</td>
      <td>🕕 ${dep}</td>
      <td><span class="badge badge-purple">💺 ${b.seat_number}</span></td>
      <td>₱${parseFloat(b.fare).toFixed(2)}</td>
      <td>${statusBadge(b.status)}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-secondary btn-icon btn-sm" onclick="viewBooking(${b.id})" title="View Details">👁️</button>
          ${b.status !== 'Cancelled' && b.status !== 'Completed'
            ? `<button class="btn btn-danger btn-icon btn-sm" onclick="confirmDelete('booking',${b.id},'Booking ${b.booking_code}')" title="Cancel">✕</button>`
            : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
  const cnt = document.getElementById('cnt-bookings');
  if (cnt) cnt.textContent = bookings.length;
  const stat = document.getElementById('stat-bookings');
  if (stat) stat.textContent = bookings.length;
}

/* ── Render: Users (Requirement 7) ──────────────────────────── */
async function loadUsers() {
  try {
    users = await apiFetch(`${API}/users.php`);
    renderUsers();
  } catch(err) {
    console.error('Failed to load users:', err);
  }
}

function renderUsers(filteredData = null) {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  const data = filteredData || users;

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:40px">No user accounts found.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(u => {
    const created = u.created_at ? u.created_at.substring(0, 10) : '—';
    const isSelf = sessionUser && Number(sessionUser.id) === Number(u.id);

    return `
    <tr data-search="${((u.name||'') + (u.username||'') + (u.email||'') + (u.role||'')).toLowerCase()}">
      <td><span class="text-accent fw-700">#${u.id}</span></td>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="user-avatar" style="width:32px;height:32px;font-size:12px">${u.avatar_initials || 'U'}</div>
          <div>
            <div style="font-weight:600">${u.name}</div>
            ${isSelf ? '<span class="badge badge-green" style="font-size:10px;padding:2px 6px">You (Current)</span>' : ''}
          </div>
        </div>
      </td>
      <td><code>${u.username}</code></td>
      <td>${u.email}</td>
      <td>${statusBadge(u.role)}</td>
      <td>${created}</td>
      <td>
        <div class="action-btns">
          ${isSelf
            ? `<span style="font-size:12px;color:var(--text-muted)">Active Session</span>`
            : `<button class="btn btn-danger btn-icon btn-sm" onclick="confirmDeleteUser(${u.id}, '${escapeHtml(u.username)}', '${u.role}')" title="Delete Account">🗑️</button>`
          }
        </div>
      </td>
    </tr>`;
  }).join('');

  const cnt = document.getElementById('cnt-users');
  if (cnt) cnt.textContent = users.length;
  const stat = document.getElementById('stat-users');
  if (stat) stat.textContent = users.length;
}

function filterUsers(query) {
  const q = (query || '').toLowerCase();
  const roleFilter = document.getElementById('users-role-filter')?.value || '';
  let filtered = users;
  if (roleFilter) {
    filtered = filtered.filter(u => u.role === roleFilter);
  }
  if (q) {
    filtered = filtered.filter(u =>
      (u.name || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.role || '').toLowerCase().includes(q)
    );
  }
  renderUsers(filtered);
}

function filterUsersByRole(role) {
  const query = document.querySelector('#panel-users .search-input')?.value || '';
  filterUsers(query);
}

function openAddUserModal() {
  document.getElementById('form-user').reset();
  openModal('modal-user');
}

async function saveUser(e) {
  e.preventDefault();
  const saveBtn = document.getElementById('save-user-btn');
  saveBtn.disabled = true;

  const payload = {
    username: document.getElementById('usr-username').value.trim(),
    name:     document.getElementById('usr-name').value.trim(),
    email:    document.getElementById('usr-email').value.trim(),
    role:     document.getElementById('usr-role').value,
    password: document.getElementById('usr-password').value,
  };

  try {
    const res = await apiFetch(`${API}/users.php`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    closeModal('modal-user');
    toast(res.message || 'User account created successfully!', 'success');
    await loadUsers();
    // Also refresh drivers dropdown if new driver was created
    if (payload.role === 'driver') {
      drivers = await apiFetch(`${API}/users.php?role=driver`);
      populateRouteDropdowns();
    }
  } catch(err) {
    // apiFetch shows error toast
  } finally {
    saveBtn.disabled = false;
  }
}

function confirmDeleteUser(id, username, role) {
  document.getElementById('confirm-msg').textContent =
    `Are you sure you want to delete user account "${username}" (${role})? This action cannot be undone.`;
  document.getElementById('confirm-delete-btn').onclick = async () => {
    closeModal('modal-confirm');
    try {
      const res = await apiFetch(`${API}/users.php?id=${id}`, { method: 'DELETE' });
      toast(res.message || 'User deleted successfully.', 'success');
      await loadUsers();
      if (role === 'driver') {
        drivers = await apiFetch(`${API}/users.php?role=driver`);
        populateRouteDropdowns();
      }
    } catch(err) {
      // apiFetch shows error toast
    }
  };
  openModal('modal-confirm');
}

/* ── Populate Dropdowns ─────────────────────────────────────── */
function populateRouteDropdowns() {
  ['s-route', 'sp-route', 'sh-route'].forEach(selId => {
    const el = document.getElementById(selId);
    if (!el) return;
    const cur = el.value;
    el.innerHTML = '<option value="">— Select Route —</option>' +
      routes.map(r => `<option value="${r.id}" ${cur == r.id ? 'selected' : ''}>${r.route_code} — ${r.name}</option>`).join('');
  });

  const shuttleSel = document.getElementById('s-shuttle');
  if (shuttleSel) {
    const cur = shuttleSel.value;
    shuttleSel.innerHTML = '<option value="">— Select Shuttle —</option>' +
      shuttles.map(s => `<option value="${s.id}" ${cur == s.id ? 'selected' : ''}>${s.shuttle_code} (${s.plate_number} — ${s.model})</option>`).join('');
  }

  const driverSel = document.getElementById('sh-driver');
  if (driverSel) {
    const cur = driverSel.value;
    driverSel.innerHTML = '<option value="">— Unassigned —</option>' +
      drivers.map(d => `<option value="${d.id}" ${cur == d.id ? 'selected' : ''}>${d.name}</option>`).join('');
  }
}

/* ── Modal Helpers ──────────────────────────────────────────── */
function openModal(id) {
  populateRouteDropdowns();
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

/* ── ROUTES CRUD ────────────────────────────────────────────── */
function editRoute(id) {
  const r = routes.find(x => x.id === id);
  if (!r) return;
  editingRouteId = id;
  document.getElementById('modal-route-title').textContent = 'Edit Route';
  document.getElementById('route-id-field').value = id;
  document.getElementById('r-name').value     = r.name;
  document.getElementById('r-origin').value   = r.origin;
  document.getElementById('r-destination').value = r.destination;
  document.getElementById('r-distance').value = r.distance_km || '';
  document.getElementById('r-duration').value = r.duration_min || '';
  document.getElementById('r-fare').value     = r.fare || '';
  document.getElementById('r-status').value   = r.status;
  document.getElementById('r-notes').value    = r.notes || '';
  openModal('modal-route');
}

async function saveRoute(e) {
  e.preventDefault();
  const payload = {
    name:         document.getElementById('r-name').value.trim(),
    origin:       document.getElementById('r-origin').value.trim(),
    destination:  document.getElementById('r-destination').value.trim(),
    distance_km:  document.getElementById('r-distance').value || null,
    duration_min: document.getElementById('r-duration').value || null,
    fare:         document.getElementById('r-fare').value || 0,
    status:       document.getElementById('r-status').value,
    notes:        document.getElementById('r-notes').value.trim(),
  };

  try {
    if (editingRouteId) {
      await apiFetch(`${API}/routes.php?id=${editingRouteId}`, { method:'PUT', body: JSON.stringify(payload) });
      toast('Route updated successfully!', 'success');
    } else {
      await apiFetch(`${API}/routes.php`, { method:'POST', body: JSON.stringify(payload) });
      toast('Route added successfully!', 'success');
    }
    editingRouteId = null;
    closeModal('modal-route');
    await loadAllData();
  } catch(err) {}
}

/* ── SCHEDULES CRUD ─────────────────────────────────────────── */
function editSchedule(id) {
  const s = schedules.find(x => x.id === id);
  if (!s) return;
  editingSchedId = id;
  document.getElementById('modal-schedule-title').textContent = 'Edit Schedule';
  document.getElementById('sched-id-field').value = id;
  populateRouteDropdowns();
  setTimeout(() => {
    document.getElementById('s-route').value   = s.route_id;
    document.getElementById('s-shuttle').value = s.shuttle_id;
    document.getElementById('s-dep').value     = (s.departure_time || '').substring(0,5);
    document.getElementById('s-arr').value     = (s.arrival_time   || '').substring(0,5);
    document.getElementById('s-seats').value   = s.available_seats;
    document.getElementById('s-status').value  = s.status;
    const dayVals = (s.operating_days || '').split(',').map(d => d.trim());
    document.querySelectorAll('#modal-schedule .day-check input').forEach(cb => {
      cb.checked = dayVals.includes(cb.value);
    });
  }, 50);
  openModal('modal-schedule');
}

async function saveSchedule(e) {
  e.preventDefault();
  const checked = [...document.querySelectorAll('#modal-schedule .day-check input:checked')].map(c => c.value);
  const payload = {
    route_id:       document.getElementById('s-route').value,
    shuttle_id:     document.getElementById('s-shuttle').value,
    departure_time: document.getElementById('s-dep').value,
    arrival_time:   document.getElementById('s-arr').value,
    available_seats:document.getElementById('s-seats').value || 24,
    status:         document.getElementById('s-status').value,
    operating_days: checked.join(',') || 'Mon,Tue,Wed,Thu,Fri',
  };

  try {
    if (editingSchedId) {
      await apiFetch(`${API}/schedules.php?id=${editingSchedId}`, { method:'PUT', body: JSON.stringify(payload) });
      toast('Schedule updated!', 'success');
    } else {
      await apiFetch(`${API}/schedules.php`, { method:'POST', body: JSON.stringify(payload) });
      toast('Schedule added!', 'success');
    }
    editingSchedId = null;
    closeModal('modal-schedule');
    await loadAllData();
  } catch(err) {}
}

/* ── STOPS CRUD ─────────────────────────────────────────────── */
function editStop(id) {
  const s = stops.find(x => x.id === id);
  if (!s) return;
  editingStopId = id;
  document.getElementById('modal-stop-title').textContent = 'Edit Stop';
  document.getElementById('stop-id-field').value = id;
  populateRouteDropdowns();
  setTimeout(() => {
    document.getElementById('sp-name').value     = s.name;
    document.getElementById('sp-address').value  = s.address;
    document.getElementById('sp-landmark').value = s.landmark || '';
    document.getElementById('sp-lat').value      = s.latitude  || '';
    document.getElementById('sp-lng').value      = s.longitude || '';
    document.getElementById('sp-order').value    = s.stop_order || 1;
  }, 50);
  openModal('modal-stop');
}

async function saveStop(e) {
  e.preventDefault();
  const payload = {
    name:      document.getElementById('sp-name').value.trim(),
    address:   document.getElementById('sp-address').value.trim(),
    landmark:  document.getElementById('sp-landmark').value.trim() || null,
    latitude:  document.getElementById('sp-lat').value  || null,
    longitude: document.getElementById('sp-lng').value  || null,
    route_id:  document.getElementById('sp-route').value || null,
    stop_order:document.getElementById('sp-order').value || 1,
  };

  try {
    if (editingStopId) {
      await apiFetch(`${API}/stops.php?id=${editingStopId}`, { method:'PUT', body: JSON.stringify(payload) });
      toast('Stop updated!', 'success');
    } else {
      await apiFetch(`${API}/stops.php`, { method:'POST', body: JSON.stringify(payload) });
      toast('Stop added!', 'success');
    }
    editingStopId = null;
    closeModal('modal-stop');
    await loadAllData();
  } catch(err) {}
}

/* ── SHUTTLES CRUD ──────────────────────────────────────────── */
function editShuttle(id) {
  const s = shuttles.find(x => x.id === id);
  if (!s) return;
  editingShuttleId = id;
  document.getElementById('modal-shuttle-title').textContent = 'Edit Shuttle';
  document.getElementById('shuttle-id-field').value = id;
  populateRouteDropdowns();
  setTimeout(() => {
    document.getElementById('sh-plate').value    = s.plate_number;
    document.getElementById('sh-model').value    = s.model;
    document.getElementById('sh-capacity').value = s.capacity;
    document.getElementById('sh-year').value     = s.year || '';
    document.getElementById('sh-route').value    = s.route_id  || '';
    document.getElementById('sh-driver').value   = s.driver_id || '';
    document.getElementById('sh-status').value   = s.status;
    document.getElementById('sh-lastmaint').value= s.last_maintained || '';
  }, 50);
  openModal('modal-shuttle');
}

async function saveShuttle(e) {
  e.preventDefault();
  const payload = {
    plate_number:    document.getElementById('sh-plate').value.trim(),
    model:           document.getElementById('sh-model').value.trim(),
    capacity:        document.getElementById('sh-capacity').value,
    year:            document.getElementById('sh-year').value || null,
    route_id:        document.getElementById('sh-route').value  || null,
    driver_id:       document.getElementById('sh-driver').value || null,
    status:          document.getElementById('sh-status').value,
    last_maintained: document.getElementById('sh-lastmaint').value || null,
  };

  try {
    if (editingShuttleId) {
      await apiFetch(`${API}/shuttles.php?id=${editingShuttleId}`, { method:'PUT', body: JSON.stringify(payload) });
      toast('Shuttle updated!', 'success');
    } else {
      await apiFetch(`${API}/shuttles.php`, { method:'POST', body: JSON.stringify(payload) });
      toast('Shuttle added!', 'success');
    }
    editingShuttleId = null;
    closeModal('modal-shuttle');
    await loadAllData();
  } catch(err) {}
}

/* ── BOOKINGS ────────────────────────────────────────────────── */
function viewBooking(id) {
  const b = bookings.find(x => x.id === id);
  if (!b) return;
  const dep = b.departure_time ? b.departure_time.substring(0,5) : '—';
  document.getElementById('booking-detail-body').innerHTML = `
    <div class="booking-detail-grid">
      <div class="bd-item"><label>Booking ID</label><span class="text-accent fw-700">${b.booking_code}</span></div>
      <div class="bd-item"><label>Status</label><span>${statusBadge(b.status)}</span></div>
      <div class="bd-item"><label>Passenger</label><span>${b.passenger_name || 'Passenger'}</span></div>
      <div class="bd-item"><label>Seat No.</label><span>${b.seat_number}</span></div>
      <div class="bd-item"><label>Route</label><span>${b.route_name}</span></div>
      <div class="bd-item"><label>Departure</label><span>${dep}</span></div>
      <div class="bd-item"><label>Travel Date</label><span>${b.travel_date}</span></div>
      <div class="bd-item"><label>Fare</label><span>₱${parseFloat(b.fare).toFixed(2)}</span></div>
    </div>`;
  const cancelBtn = document.getElementById('admin-cancel-booking-btn');
  if (b.status === 'Cancelled' || b.status === 'Completed') {
    cancelBtn.style.display = 'none';
  } else {
    cancelBtn.style.display = '';
    cancelBtn.onclick = async () => {
      await apiFetch(`${API}/bookings.php?id=${b.id}`, { method:'PUT', body: JSON.stringify({ status: 'Cancelled' }) });
      closeModal('modal-booking-view');
      toast('Booking cancelled.', 'warning');
      await loadAllData();
    };
  }
  openModal('modal-booking-view');
}

/* ── Confirm Delete (Generic) ───────────────────────────────── */
function confirmDelete(type, id, label) {
  document.getElementById('confirm-msg').textContent = `Delete "${label}"? This action cannot be undone.`;
  document.getElementById('confirm-delete-btn').onclick = () => {
    doDelete(type, id);
    closeModal('modal-confirm');
  };
  openModal('modal-confirm');
}

async function doDelete(type, id) {
  const endpointMap = { route:'routes', schedule:'schedules', stop:'stops', shuttle:'shuttles', booking:'bookings' };
  const endpoint = endpointMap[type];
  if (!endpoint) return;

  if (type === 'booking') {
    await apiFetch(`${API}/bookings.php?id=${id}`, { method:'PUT', body: JSON.stringify({ status: 'Cancelled' }) });
    toast('Booking cancelled.', 'warning');
  } else {
    await apiFetch(`${API}/${endpoint}.php?id=${id}`, { method:'DELETE' });
    toast(`${type.charAt(0).toUpperCase()+type.slice(1)} deleted.`, 'error');
  }
  await loadAllData();
}

/* ── Filter / Search ────────────────────────────────────────── */
function filterTable(tbodyId, query) {
  const q = (query || '').toLowerCase();
  document.querySelectorAll(`#${tbodyId} tr`).forEach(row => {
    const text = row.getAttribute('data-search') || row.textContent.toLowerCase();
    row.style.display = text.includes(q) ? '' : 'none';
  });
}

function filterByStatus(tbodyId, status) {
  document.querySelectorAll(`#${tbodyId} tr`).forEach(row => {
    if (!status) { row.style.display = ''; return; }
    row.style.display = row.textContent.includes(status) ? '' : 'none';
  });
}

/* ── Toast ──────────────────────────────────────────────────── */
function toast(msg, type = 'info') {
  const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span><span class="toast-msg">${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => { el.style.animation='slideInRight 0.3s ease reverse forwards'; setTimeout(()=>el.remove(), 300); }, 3000);
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

/* ── Load All Data from DB ──────────────────────────────────── */
async function loadAllData() {
  try {
    [routes, schedules, stops, shuttles, bookings, drivers, users] = await Promise.all([
      apiFetch(`${API}/routes.php`),
      apiFetch(`${API}/schedules.php`),
      apiFetch(`${API}/stops.php`),
      apiFetch(`${API}/shuttles.php`),
      apiFetch(`${API}/bookings.php`),
      apiFetch(`${API}/users.php?role=driver`),
      apiFetch(`${API}/users.php`),
    ]);
    renderRoutes();
    renderSchedules();
    renderStops();
    renderShuttles();
    renderBookings();
    renderUsers();
    populateRouteDropdowns();
  } catch(err) {
    console.error('Failed to load data:', err);
  }
}

/* ── Init ───────────────────────────────────────────────────── */
async function init() {
  const ok = await checkAuth();
  if (ok) {
    await loadAllData();
  }
}

init();
