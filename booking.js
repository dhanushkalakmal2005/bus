/* ============================================================
   booking.js — Passenger Reservation & Booking System Logic
   Connected to PHP backend API and authenticated session
   ============================================================ */

/* ── API Base URL ────────────────────────────────────────────── */
const API = 'api';

let sessionUser        = null;
let PASSENGER_ID       = 2;    // Updated dynamically from authenticated session
let availableSchedules = [];   // from DB
let myBookings         = [];   // from DB for this passenger
let currentSchedule    = null;
let selectedSeats      = [];
let requestedSeats     = 1;
let cancelTargetId     = null;
let bookedSeatNumbers  = [];   // seats already taken for currentSchedule

/* ── Generic API helper ─────────────────────────────────────── */
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

/* ── Authentication & Session Guard ─────────────────────────── */
async function checkAuth() {
  try {
    const res = await fetch(`${API}/auth.php`);
    const data = await res.json();
    if (!data.authenticated || !data.user) {
      window.location.href = 'login.php?error=unauthorized';
      return false;
    }
    sessionUser = data.user;
    PASSENGER_ID = sessionUser.id;

    // Update UI elements with real user data
    const unameEl = document.getElementById('sidebar-username');
    if (unameEl) unameEl.textContent = sessionUser.name || sessionUser.username;

    const sAvatar = document.getElementById('sidebar-avatar');
    if (sAvatar) sAvatar.textContent = sessionUser.avatar_initials || 'PS';

    const tAvatar = document.getElementById('topbar-avatar');
    if (tAvatar) tAvatar.textContent = sessionUser.avatar_initials || 'PS';

    return true;
  } catch (e) {
    console.warn('Auth check error, proceeding with fallback session', e);
    return true;
  }
}

/* ── Init ──────────────────────────────────────────────────── */
async function init() {
  await checkAuth();
  setDefaultDate();
  await loadSchedules();
  await loadMyBookings();
  populateStopDropdowns();
  renderPopularRoutes();
  renderMyBookings();
  updateMyBookingStats();

  // Handle URL hash navigation (e.g., booking.html#mybookings)
  handleHashNavigation();
  window.addEventListener('hashchange', handleHashNavigation);
}

async function loadSchedules() {
  try {
    availableSchedules = await apiFetch(`${API}/schedules.php`);
  } catch(e) {
    availableSchedules = [];
  }
}

async function loadMyBookings() {
  try {
    myBookings = await apiFetch(`${API}/bookings.php?passenger_id=${PASSENGER_ID}`);
  } catch(e) {
    myBookings = [];
  }
}

function populateStopDropdowns() {
  const fromSel = document.getElementById('sf-from');
  const toSel   = document.getElementById('sf-to');
  if (!fromSel || !toSel) return;

  const origins = [...new Set(availableSchedules.map(s => s.origin))].sort();
  const dests   = [...new Set(availableSchedules.map(s => s.destination))].sort();
  const allLocs = [...new Set([...origins, ...dests])].sort();

  fromSel.innerHTML = '<option value="">— Select origin —</option>' +
    allLocs.map(l => `<option value="${l}">${l}</option>`).join('');
  toSel.innerHTML = '<option value="">— Select destination —</option>' +
    allLocs.map(l => `<option value="${l}">${l}</option>`).join('');
}

function setDefaultDate() {
  const today = new Date();
  const dateEl = document.getElementById('sf-date');
  if (dateEl) dateEl.value = today.toISOString().split('T')[0];
}

/* ── View Navigation ────────────────────────────────────────── */
function showView(name) {
  const searchView = document.getElementById('view-search');
  const bookingsView = document.getElementById('view-mybookings');

  if (name === 'search') {
    if (searchView) searchView.style.display = 'block';
    if (bookingsView) bookingsView.style.display = 'none';
    const title = document.getElementById('view-title');
    const sub = document.getElementById('view-subtitle');
    if (title) title.textContent = 'Book a Shuttle';
    if (sub) sub.textContent = 'Search available routes and reserve your seat';
  } else if (name === 'mybookings') {
    if (searchView) searchView.style.display = 'none';
    if (bookingsView) bookingsView.style.display = 'block';
    const title = document.getElementById('view-title');
    const sub = document.getElementById('view-subtitle');
    if (title) title.textContent = 'My Bookings';
    if (sub) sub.textContent = 'View and manage your shuttle reservations';
    loadMyBookings().then(() => { renderMyBookings(); updateMyBookingStats(); });
  }
}

function setActiveNav(el) {
  if (!el) return;
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
}

function navigateToView(viewName) {
  if (viewName === 'mybookings') {
    window.location.hash = 'mybookings';
  } else {
    if (window.location.hash) {
      history.pushState(null, '', window.location.pathname);
    }
    showView('search');
    setActiveNav(document.getElementById('nav-search'));
  }
}

/* ── Hash Navigation Handler (Requirement 4.C) ──────────────── */
function handleHashNavigation() {
  const hash = (window.location.hash || '').toLowerCase();
  if (hash === '#mybookings') {
    showView('mybookings');
    setActiveNav(document.getElementById('nav-mybookings'));
    setTimeout(() => {
      const el = document.getElementById('mybookings') || document.getElementById('view-mybookings');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 120);
  } else {
    showView('search');
    setActiveNav(document.getElementById('nav-search'));
  }
}

/* ── Search ─────────────────────────────────────────────────── */
function swapFromTo() {
  const f = document.getElementById('sf-from');
  const t = document.getElementById('sf-to');
  if (f && t) [f.value, t.value] = [t.value, f.value];
}

function searchRoutes() {
  const from  = document.getElementById('sf-from').value;
  const to    = document.getElementById('sf-to').value;
  const date  = document.getElementById('sf-date').value;
  requestedSeats = Number(document.getElementById('sf-seats').value);

  const results = availableSchedules.filter(s => {
    const fromMatch = !from || s.origin === from;
    const toMatch   = !to   || s.destination === to;
    const active    = s.status !== 'Suspended';
    return fromMatch && toMatch && active;
  });

  document.getElementById('popular-routes').style.display = 'none';
  document.getElementById('search-results').style.display = 'block';

  const heading = from && to ? `${from} → ${to}` : from ? `From ${from}` : to ? `To ${to}` : 'All Available Trips';
  document.getElementById('results-heading').textContent = heading;
  document.getElementById('results-sub').textContent = `${date} · ${results.length} trip${results.length!==1?'s':''} found`;

  const list = document.getElementById('results-list');
  if (results.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>No trips found for your search. Try different locations or dates.</p>
      </div>`;
    return;
  }

  list.innerHTML = results.map(s => {
    const dep = (s.departure_time || '').substring(0,5);
    const arr = (s.arrival_time   || '').substring(0,5);
    const avail = s.available_seats;
    const full  = avail < requestedSeats || s.status === 'Full';
    const seatsClass = avail >= 10 ? 'high' : avail >= 4 ? 'mid' : 'low';

    return `
      <div class="trip-card ${full ? 'no-seats' : ''}" onclick="${full ? '' : `openSeatSelection(${s.id}, ${requestedSeats}, '${date}')`}">
        <div class="trip-time-block">
          <div class="trip-time">${dep}</div>
          <div class="trip-label">Departure</div>
        </div>
        <div class="trip-line" style="position:relative">
          <div class="trip-dot"></div>
          <div class="trip-track" style="position:relative">
            <span class="trip-duration">${s.route_name}</span>
          </div>
          <div class="trip-dot" style="border-color:var(--accent-2)"></div>
        </div>
        <div class="trip-time-block">
          <div class="trip-time" style="color:var(--accent-2)">${arr}</div>
          <div class="trip-label">Arrival</div>
        </div>
        <div class="trip-info">
          <div class="trip-route-name">${s.origin} → ${s.destination}</div>
          <div class="trip-shuttle">🚐 ${s.shuttle_code} (${s.plate_number})</div>
          <div style="margin-top:6px"><span class="badge badge-purple">📅 ${s.operating_days}</span></div>
        </div>
        <div class="trip-seats-block">
          <div class="seats-available ${seatsClass}">${avail}</div>
          <div class="seats-label">${full ? 'FULL' : 'seats left'}</div>
        </div>
        <div class="trip-fare-block">
          <div class="trip-fare">₱${parseFloat(s.fare||0).toFixed(0)}</div>
          <div class="trip-fare-label">per seat</div>
        </div>
        <div class="trip-book-btn">
          ${full
            ? `<span class="badge badge-red">Full</span>`
            : `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();openSeatSelection(${s.id},${requestedSeats},'${date}')">Book Now</button>`}
        </div>
      </div>`;
  }).join('');
}

function clearSearch() {
  document.getElementById('sf-from').value = '';
  document.getElementById('sf-to').value   = '';
  document.getElementById('search-results').style.display  = 'none';
  document.getElementById('popular-routes').style.display  = 'block';
}

/* ── Popular Routes ─────────────────────────────────────────── */
function renderPopularRoutes() {
  const popular = availableSchedules.slice(0, 6);
  const colors  = ['blue','purple','green','amber','blue','purple'];
  const grid = document.getElementById('popular-grid');
  if (!grid) return;

  grid.innerHTML = popular.map((s, i) => {
    const dep   = (s.departure_time || '').substring(0,5);
    const avail = s.available_seats;
    return `
      <div class="popular-card color-${colors[i]}" onclick="openSeatSelection(${s.id},1,'${new Date().toISOString().split('T')[0]}')">
        <div class="pc-header">
          <div class="pc-route-name">${s.route_name}</div>
          <div class="pc-fare">₱${parseFloat(s.fare||0).toFixed(0)}</div>
        </div>
        <div class="pc-from-to"><span>${s.origin}</span> → ${s.destination}</div>
        <div class="pc-meta">
          <span class="badge badge-blue">🕕 ${dep}</span>
          <span class="badge ${avail>5?'badge-green':avail>0?'badge-amber':'badge-red'}">💺 ${avail} left</span>
          <span class="badge badge-purple">📅 ${s.operating_days}</span>
        </div>
      </div>`;
  }).join('');
}

/* ── Seat Selection ─────────────────────────────────────────── */
async function openSeatSelection(scheduleId, numSeats, travelDate) {
  currentSchedule = availableSchedules.find(s => s.id === scheduleId);
  selectedSeats   = [];
  requestedSeats  = numSeats || 1;
  if (!currentSchedule) return;

  const dep = (currentSchedule.departure_time || '').substring(0,5);
  const arr = (currentSchedule.arrival_time   || '').substring(0,5);
  const fare= parseFloat(currentSchedule.fare || 0);

  // Fetch booked seats from DB for this schedule
  try {
    const res = await apiFetch(`${API}/bookings.php?schedule_id=${scheduleId}`);
    bookedSeatNumbers = res.booked_seats || [];
  } catch(e) {
    bookedSeatNumbers = [];
  }

  document.getElementById('seat-trip-info').innerHTML = `
    <div class="sti-item"><label>Route</label><span>${currentSchedule.route_name}</span></div>
    <div class="sti-item"><label>Time</label><span>${dep} → ${arr}</span></div>
    <div class="sti-item"><label>Fare</label><span>₱${fare} × ${numSeats} = ₱${(fare*numSeats).toFixed(2)}</span></div>`;

  buildSeatGrid();
  updateSeatSummary();
  currentSchedule._travelDate = travelDate || document.getElementById('sf-date').value;
  openModal('modal-seats');
}

function buildSeatGrid() {
  const grid  = document.getElementById('seat-grid');
  const rows  = ['A','B','C','D','E','F'];
  const cols  = [1, 2, 3, 4];
  let html    = '';

  rows.forEach(r => {
    html += '<div class="seat-row">';
    cols.forEach(c => {
      if (c === 3) html += '<div class="seat-aisle"></div>';
      const seatNo = `${r}${c}`;
      const taken  = bookedSeatNumbers.includes(seatNo);
      const sel    = selectedSeats.includes(seatNo);
      html += `
        <div class="seat ${taken ? 'occupied' : sel ? 'selected' : 'available'}"
             data-seat="${seatNo}"
             onclick="${taken ? '' : `toggleSeat('${seatNo}')`}"
             title="${taken ? 'Occupied' : 'Seat ' + seatNo}">
          ${seatNo}
        </div>`;
    });
    html += '</div>';
  });
  grid.innerHTML = html;
}

function toggleSeat(seatNo) {
  const idx = selectedSeats.indexOf(seatNo);
  if (idx >= 0) {
    selectedSeats.splice(idx, 1);
  } else {
    if (selectedSeats.length >= requestedSeats) {
      selectedSeats.shift();
    }
    selectedSeats.push(seatNo);
  }
  buildSeatGrid();
  updateSeatSummary();
}

function updateSeatSummary() {
  const sumEl = document.getElementById('seat-summary');
  const btn   = document.getElementById('proceed-booking-btn');
  const fare  = parseFloat(currentSchedule?.fare || 0);

  if (selectedSeats.length === 0) {
    sumEl.innerHTML = `<span>Select ${requestedSeats} seat${requestedSeats>1?'s':''}</span>`;
    btn.disabled = true;
  } else {
    const total = fare * selectedSeats.length;
    sumEl.innerHTML = `
      <span>Seat${selectedSeats.length>1?'s':''}: <strong>${selectedSeats.join(', ')}</strong></span>
      <span>Total: <strong>₱${total.toFixed(2)}</strong></span>`;
    btn.disabled = selectedSeats.length < requestedSeats;
  }
}

/* ── Booking Confirm ────────────────────────────────────────── */
function openBookingConfirm() {
  closeModal('modal-seats');
  const dep   = (currentSchedule.departure_time || '').substring(0,5);
  const arr   = (currentSchedule.arrival_time   || '').substring(0,5);
  const fare  = parseFloat(currentSchedule.fare || 0);
  const total = fare * selectedSeats.length;

  document.getElementById('confirm-booking-card').innerHTML = `
    <div class="cbc-route">${currentSchedule.route_name}</div>
    <div class="cbc-fromto">📍 ${currentSchedule.origin} → 🏁 ${currentSchedule.destination}</div>
    <div class="cbc-meta-grid">
      <div><label>Date</label><span>${currentSchedule._travelDate}</span></div>
      <div><label>Time</label><span>${dep} – ${arr}</span></div>
      <div><label>Shuttle</label><span>${currentSchedule.shuttle_code}</span></div>
      <div><label>Seat(s)</label><span style="color:var(--accent)">${selectedSeats.join(', ')}</span></div>
    </div>
    <div class="cbc-total">
      <span>Total Fare</span>
      <span class="cbc-total-amount">₱${total.toFixed(2)}</span>
    </div>`;
  document.getElementById('terms-check').checked = false;
  openModal('modal-confirm-booking');
}

async function confirmBooking() {
  if (!document.getElementById('terms-check').checked) {
    toast('Please agree to the booking terms.', 'warning');
    return;
  }

  const special = document.getElementById('special-requests').value.trim();
  const fare    = parseFloat(currentSchedule.fare || 0);

  let successCount = 0;
  let lastBookingCode = '';

  for (const seat of selectedSeats) {
    try {
      const payload = {
        passenger_id:     PASSENGER_ID,
        schedule_id:      currentSchedule.id,
        travel_date:      currentSchedule._travelDate,
        seat_number:      seat,
        fare:             fare,
        special_requests: special || null,
        status:           'Confirmed',
      };
      const res = await apiFetch(`${API}/bookings.php`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      successCount++;
      lastBookingCode = res.booking_code;
    } catch(err) {
      toast(`Failed to book seat ${seat}: ` + err.message, 'error');
    }
  }

  closeModal('modal-confirm-booking');

  if (successCount > 0) {
    document.getElementById('booking-ref-card').innerHTML = `
      <div class="booking-ref-number">${lastBookingCode}</div>
      <p style="font-size:12px;color:var(--text-muted);margin-top:6px">
        ${selectedSeats.length > 1 ? `${successCount} seats confirmed.` : 'Show this reference to your driver.'}
      </p>`;
    openModal('modal-success');
    await loadMyBookings();
    renderMyBookings();
    updateMyBookingStats();
  }
}

/* ── My Bookings Rendering ──────────────────────────────────── */
function renderMyBookings(filter = '', search = '') {
  const tbody = document.getElementById('my-bookings-tbody');
  if (!tbody) return;

  let data = [...myBookings];
  if (filter) data = data.filter(b => b.status === filter);
  if (search) {
    const q = search.toLowerCase();
    data = data.filter(b =>
      b.booking_code.toLowerCase().includes(q) ||
      b.route_name.toLowerCase().includes(q) ||
      b.seat_number.toLowerCase().includes(q) ||
      b.travel_date.includes(q)
    );
  }

  if (data.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="8">
        <div class="empty-state">
          <div class="empty-icon">🎫</div>
          <p>No bookings found.</p>
          <button class="btn btn-primary" onclick="navigateToView('search')">Book a Shuttle</button>
        </div>
      </td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(b => {
    const dep = (b.departure_time || '').substring(0,5);
    const arr = (b.arrival_time   || '').substring(0,5);
    return `
    <tr>
      <td><span class="text-accent fw-700">${b.booking_code}</span></td>
      <td>
        <div style="font-weight:600">${b.route_name}</div>
        <div style="font-size:11px;color:var(--text-muted)">${b.origin} → ${b.destination}</div>
      </td>
      <td>${b.travel_date}</td>
      <td>🕕 ${dep} → 🕑 ${arr}</td>
      <td><span class="badge badge-purple">💺 ${b.seat_number}</span></td>
      <td><span class="text-accent fw-700">₱${parseFloat(b.fare).toFixed(2)}</span></td>
      <td>${statusBadge(b.status)}</td>
      <td>
        <div style="display:flex;gap:5px">
          <button class="btn btn-secondary btn-icon btn-sm" onclick="viewMyBooking(${b.id})" title="View Details">👁️</button>
          ${b.status === 'Confirmed' || b.status === 'Pending'
            ? `<button class="btn btn-danger btn-icon btn-sm" onclick="openCancelConfirm(${b.id})" title="Cancel">✕</button>`
            : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

function filterMyBookings(filter) {
  const search = document.querySelector('#view-mybookings .search-input')?.value || '';
  renderMyBookings(filter, search);
}

function searchMyBookings(q) {
  const filter = document.getElementById('mb-filter')?.value || '';
  renderMyBookings(filter, q);
}

function updateMyBookingStats() {
  const tot = document.getElementById('mb-total');
  const conf = document.getElementById('mb-confirmed');
  const pend = document.getElementById('mb-pending');
  const canc = document.getElementById('mb-cancelled');
  if (tot) tot.textContent = myBookings.length;
  if (conf) conf.textContent = myBookings.filter(b => b.status === 'Confirmed').length;
  if (pend) pend.textContent = myBookings.filter(b => b.status === 'Pending').length;
  if (canc) canc.textContent = myBookings.filter(b => b.status === 'Cancelled').length;
}

function viewMyBooking(bookingId) {
  const b = myBookings.find(x => x.id === bookingId);
  if (!b) return;
  const dep = (b.departure_time || '').substring(0,5);
  const arr = (b.arrival_time   || '').substring(0,5);
  document.getElementById('booking-detail-content').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div><label style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px">Booking ID</label><span class="text-accent fw-700">${b.booking_code}</span></div>
      <div><label style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px">Status</label>${statusBadge(b.status)}</div>
      <div><label style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px">Route</label><span style="font-size:14px;font-weight:600">${b.route_name}</span></div>
      <div><label style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px">Seat</label><span style="font-size:14px;font-weight:600">${b.seat_number}</span></div>
      <div><label style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px">From</label><span style="font-size:14px">${b.origin}</span></div>
      <div><label style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px">To</label><span style="font-size:14px">${b.destination}</span></div>
      <div><label style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px">Date</label><span style="font-size:14px">${b.travel_date}</span></div>
      <div><label style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px">Time</label><span style="font-size:14px">${dep} – ${arr}</span></div>
      <div><label style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px">Fare</label><span class="text-accent fw-700" style="font-size:18px">₱${parseFloat(b.fare).toFixed(2)}</span></div>
    </div>`;
  const cancelBtn = document.getElementById('detail-cancel-btn');
  if (b.status === 'Cancelled' || b.status === 'Completed') {
    cancelBtn.style.display = 'none';
  } else {
    cancelBtn.style.display = '';
    cancelBtn.onclick = () => { closeModal('modal-booking-detail'); openCancelConfirm(bookingId); };
  }
  openModal('modal-booking-detail');
}

function openCancelConfirm(bookingId) {
  cancelTargetId = bookingId;
  const b = myBookings.find(x => x.id === bookingId);
  document.getElementById('cancel-confirm-msg').textContent =
    `Cancel booking ${b?.booking_code} — ${b?.route_name} on ${b?.travel_date}?`;
  document.getElementById('do-cancel-btn').onclick = doCancel;
  openModal('modal-cancel-confirm');
}

async function doCancel() {
  try {
    await apiFetch(`${API}/bookings.php?id=${cancelTargetId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'Cancelled' }),
    });
    closeModal('modal-cancel-confirm');
    toast('Booking cancelled successfully.', 'warning');
    await loadMyBookings();
    renderMyBookings();
    updateMyBookingStats();
  } catch(err) {}
}

/* ── Helpers ────────────────────────────────────────────────── */
function statusBadge(s) {
  const map = {
    Confirmed:'badge-green', Completed:'badge-blue',
    Pending:'badge-amber',   Cancelled:'badge-red',
  };
  return `<span class="badge ${map[s]||'badge-gray'}">${s}</span>`;
}

function openModal(id) {
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

function toast(msg, type = 'info') {
  const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span><span class="toast-msg">${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'slideInRight 0.3s ease reverse forwards';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

/* ── Start ──────────────────────────────────────────────────── */
init();
