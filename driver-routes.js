/* driver-routes.js — Driver view logic connected to PHP API and session */

const API = 'api';
let sessionUser = null;

/* ── Authentication Guard ───────────────────────────────────── */
async function checkAuth() {
  try {
    const res = await fetch(`${API}/auth.php`);
    const data = await res.json();
    if (!data.authenticated || !data.user) {
      window.location.href = 'login.php?error=unauthorized';
      return false;
    }
    // Allow drivers (and admins for testing/supervision)
    if (data.user.role !== 'driver' && data.user.role !== 'admin') {
      window.location.href = 'login.php?error=unauthorized';
      return false;
    }
    sessionUser = data.user;

    const nameEl = document.getElementById('driver-name-display');
    if (nameEl) nameEl.textContent = sessionUser.name || sessionUser.username;

    const sAvatar = document.getElementById('driver-sidebar-avatar');
    if (sAvatar) sAvatar.textContent = sessionUser.avatar_initials || 'JD';

    const tAvatar = document.getElementById('driver-topbar-avatar');
    if (tAvatar) tAvatar.textContent = sessionUser.avatar_initials || 'JD';

    return true;
  } catch (e) {
    console.warn('Auth check error in driver portal', e);
    return true;
  }
}

/* ── API helper ─────────────────────────────────────────────── */
async function apiFetch(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Request failed');
    return await res.json();
  } catch (err) {
    console.error('API error:', err);
    return [];
  }
}

/* ── Status Badge ───────────────────────────────────────────── */
function statusBadge(s) {
  const map = {
    Active: 'badge-green',
    Inactive: 'badge-gray',
    Maintenance: 'badge-red',
    Full: 'badge-amber',
    Suspended: 'badge-amber',
    Idle: 'badge-gray'
  };
  return `<span class="badge ${map[s] || 'badge-gray'}">${s}</span>`;
}

/* ── Render Routes ──────────────────────────────────────────── */
function renderRoutes(data) {
  const tbody = document.getElementById('dr-routes-tbody');
  if (!tbody) return;
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted)">No routes available.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(r => `
    <tr data-search="${(r.route_code + r.name + r.origin + r.destination + (r.status || '')).toLowerCase()}">
      <td><span class="text-accent fw-700">${r.route_code}</span></td>
      <td>${r.name}</td>
      <td>${r.origin}</td>
      <td>${r.destination}</td>
      <td>${r.distance_km ? r.distance_km + ' km' : '—'}</td>
      <td><span class="badge badge-blue">🛑 ${r.stop_count || 0}</span></td>
      <td>${statusBadge(r.status)}</td>
    </tr>`).join('');
}

/* ── Render Schedules ───────────────────────────────────────── */
function renderSchedules(data) {
  const tbody = document.getElementById('dr-schedules-tbody');
  if (!tbody) return;
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">No schedules available.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(s => {
    const dep = (s.departure_time || '').substring(0,5);
    const arr = (s.arrival_time   || '').substring(0,5);
    return `
    <tr data-search="${(s.schedule_code + (s.route_name || '') + (s.shuttle_code || '') + (s.status || '')).toLowerCase()}">
      <td><span class="text-accent fw-700">${s.schedule_code}</span></td>
      <td>${s.route_name}</td>
      <td>🕕 ${dep}</td>
      <td>🕑 ${arr}</td>
      <td><span class="badge badge-purple">📅 ${s.operating_days}</span></td>
      <td>${s.shuttle_code}</td>
      <td><span class="badge badge-blue">💺 ${s.available_seats}</span></td>
      <td>${statusBadge(s.status)}</td>
    </tr>`;
  }).join('');
}

/* ── Render Stops ───────────────────────────────────────────── */
function renderStops(data) {
  const tbody = document.getElementById('dr-stops-tbody');
  if (!tbody) return;
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted)">No stops available.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(s => `
    <tr data-search="${(s.stop_code + s.name + s.address + (s.routes || '')).toLowerCase()}">
      <td><span class="text-accent fw-700">${s.stop_code}</span></td>
      <td>${s.name}</td>
      <td style="max-width:220px;white-space:normal">${s.address}</td>
      <td>${s.routes || '—'}</td>
      <td><span class="badge badge-blue">Stop ${s.stop_order || '—'}</span></td>
      <td>${s.landmark || '—'}</td>
    </tr>`).join('');
}

/* ── Section Switcher ───────────────────────────────────────── */
function showSection(name) {
  ['routes', 'schedules', 'stops'].forEach(s => {
    const el = document.getElementById('section-' + s);
    if (el) el.style.display = (s === name ? 'block' : 'none');
  });
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => el.classList.remove('active'));
  const activeNav = document.getElementById('nav-dr-' + name);
  if (activeNav) activeNav.classList.add('active');
}

/* ── Filter / Search ────────────────────────────────────────── */
function filterRows(tbodyId, q) {
  q = (q || '').toLowerCase();
  document.querySelectorAll('#' + tbodyId + ' tr').forEach(row => {
    const text = row.getAttribute('data-search') || row.textContent.toLowerCase();
    row.style.display = text.includes(q) ? '' : 'none';
  });
}

/* ── Init: Load data from DB ────────────────────────────────── */
async function init() {
  await checkAuth();

  const [routes, schedules, stops, shuttles] = await Promise.all([
    apiFetch(`${API}/routes.php`),
    apiFetch(`${API}/schedules.php`),
    apiFetch(`${API}/stops.php`),
    apiFetch(`${API}/shuttles.php`),
  ]);

  renderRoutes(routes);
  renderSchedules(schedules);
  renderStops(stops);

  // Update stat cards
  const rEl = document.getElementById('st-total-routes');
  if (rEl) rEl.textContent = routes.length;

  const sEl = document.getElementById('st-total-schedules');
  if (sEl) sEl.textContent = schedules.filter(s => s.status === 'Active').length;

  const spEl = document.getElementById('st-total-stops');
  if (spEl) spEl.textContent = stops.length;

  // Resolve assigned shuttle and route for current logged in driver
  let myShuttle = null;
  if (sessionUser) {
    myShuttle = shuttles.find(sh =>
      (sh.driver_id && Number(sh.driver_id) === Number(sessionUser.id)) ||
      (sh.driver_name && sh.driver_name.toLowerCase() === (sessionUser.name || '').toLowerCase())
    );
  }
  if (!myShuttle && shuttles.length) {
    // If testing as general driver, use first assigned shuttle
    myShuttle = shuttles.find(sh => sh.driver_name) || shuttles[0];
  }

  if (myShuttle) {
    const routeTitle = myShuttle.route_name || 'Campus Express';
    const myRouteStat = document.getElementById('st-my-route');
    if (myRouteStat) myRouteStat.textContent = routeTitle;

    const myAssignedRoute = document.getElementById('my-assigned-route');
    if (myAssignedRoute) myAssignedRoute.textContent = routeTitle;

    const myAssignedShuttle = document.getElementById('my-assigned-shuttle');
    if (myAssignedShuttle) myAssignedShuttle.textContent = `${myShuttle.shuttle_code} · ${myShuttle.plate_number}`;

    const myCapacity = document.getElementById('my-assigned-capacity');
    if (myCapacity) myCapacity.textContent = `${myShuttle.capacity} Seats`;

    const myStatus = document.getElementById('my-vehicle-status');
    if (myStatus) myStatus.textContent = myShuttle.status;

    const myBadge = document.getElementById('my-badge-status');
    if (myBadge) myBadge.textContent = myShuttle.status;

    const subtitleDisplay = document.getElementById('driver-shuttle-display');
    if (subtitleDisplay) subtitleDisplay.textContent = `Driver · ${myShuttle.shuttle_code}`;
  } else {
    const myRouteStat = document.getElementById('st-my-route');
    if (myRouteStat) myRouteStat.textContent = 'Unassigned';
    const myAssignedRoute = document.getElementById('my-assigned-route');
    if (myAssignedRoute) myAssignedRoute.textContent = 'No route currently assigned';
  }
}

init();
