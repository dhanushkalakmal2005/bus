/* ============================================================
   tracking.js — Passenger Live Tracking Logic
   ============================================================ */

const API = 'api';
let PASSENGER_ID = 2; // Updated from session
let sessionUser  = null;

const POLL_MS    = 5000;  // live-feed poll interval
const TICK_MS    = 1000;  // UI tick
const DEMO_SPEED = 40;    // simulation speed multiplier
const AVG_KMH    = 42;    // estimate distance from trip duration

/* ── State ──────────────────────────────────────────────────── */
let schedules  = [];
let myBookings = [];
let tracks     = {};      // schedule_id → { progress, speed, delay, stops }
let simMode    = false;
let selectedId = null;
let tab        = 'mine';
let searchQ    = '';
let follow     = true;
let alertOn    = false;
let alerted    = new Set();
let lastUpdate = null;

// Map refs (rebuilt on selection)
let mapPath = null, mapLen = 0, busG = null, tagText = null, tagRect = null;
let doneEl = null, stopEls = [], otherEls = {};
let cam = { x: 0, y: 0, w: 800, h: 460 }, camTarget = { ...cam };

/* ── Helpers ────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function hash(str) {
  let h = 2166136261;
  for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const toMin = t => { const [h, m] = (t || '00:00').split(':').map(Number); return h * 60 + (m || 0); };
const fmtClock = min => {
  min = ((Math.round(min) % 1440) + 1440) % 1440;
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
};
function duration(s) {
  let d = toMin(s.arrival_time) - toMin(s.departure_time);
  if (d <= 0) d += 1440;
  return d;
}

function toast(msg, type = 'info') {
  const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
  const container = $('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span class="toast-msg">${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'slideInRight 0.3s ease reverse forwards';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

async function quietFetch(url) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
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
    sessionUser = data.user;
    PASSENGER_ID = sessionUser.id;

    const unameEl = $('tracking-username-display');
    if (unameEl) unameEl.textContent = sessionUser.name || sessionUser.username;

    const sAvatar = $('tracking-sidebar-avatar');
    if (sAvatar) sAvatar.textContent = sessionUser.avatar_initials || 'AS';

    const tAvatar = $('tracking-topbar-avatar');
    if (tAvatar) tAvatar.textContent = sessionUser.avatar_initials || 'AS';

    return true;
  } catch (e) {
    console.warn('Auth error in tracking portal', e);
    return true;
  }
}

/* ── Init ───────────────────────────────────────────────────── */
async function init() {
  await checkAuth();

  try {
    schedules = (await quietFetch(`${API}/schedules.php`)).filter(s => s.status !== 'Suspended');
  } catch (e) {
    schedules = [];
    toast('Could not load schedules from the server.', 'error');
  }

  try {
    myBookings = await quietFetch(`${API}/bookings.php?passenger_id=${PASSENGER_ID}`);
  } catch (e) {
    myBookings = [];
  }

  await pollTracking(true);

  const mine = tripsFor('mine');
  tab = mine.length ? 'mine' : 'all';

  const wanted = Number(new URLSearchParams(location.search).get('schedule'));
  if (wanted && schedules.some(s => s.id === wanted)) {
    selectedId = wanted;
    tab = tripsFor('mine').some(s => s.id === wanted) ? 'mine' : 'all';
  } else if (tripsFor(tab)[0]) {
    selectedId = tripsFor(tab)[0].id;
  }

  renderTabs();
  renderList();
  if (selectedId) {
    selectTrip(selectedId, true);
  }

  requestAnimationFrame(cameraLoop);
  setInterval(tick, TICK_MS);
  setInterval(() => pollTracking(false), POLL_MS);
}

/* ── Live feed / simulation ─────────────────────────────────── */
async function pollTracking(first) {
  try {
    const rows = await quietFetch(`${API}/tracking.php`);
    if (!Array.isArray(rows)) throw new Error('bad payload');
    rows.forEach(r => {
      tracks[r.schedule_id] = {
        progress: Math.min(1, Math.max(0, Number(r.progress) || 0)),
        speed: Number(r.speed) || 0,
        delay: Number(r.delay_min) || 0,
        stops: Array.isArray(r.stops) ? r.stops : null,
      };
    });
    // In demo environment without physical GPS tracking hardware, simulation is active
    simMode = true;
    lastUpdate = new Date();
  } catch (e) {
    if (!simMode || first) seedSimulation();
    simMode = true;
  }

  const banner = $('demo-banner');
  if (banner) banner.style.display = simMode ? 'flex' : 'none';

  const pill = $('live-pill');
  if (pill) {
    pill.classList.toggle('sim', simMode);
    pill.innerHTML = `<span class="live-dot"></span> ${simMode ? 'SCHEDULE-LIVE' : 'LIVE'}`;
  }

  document.querySelectorAll('.map-bus-g').forEach(g => {
    g.style.transitionDuration = simMode ? '1s' : (POLL_MS / 1000) + 's';
  });

  if (!first) {
    renderList();
    refreshDetail();
  }
}

function seedSimulation() {
  schedules.forEach(s => {
    if (tracks[s.id]) return;
    const h = hash(s.id + s.route_name);
    tracks[s.id] = {
      progress: 0.15 + (h % 70) / 100,
      speed: 38,
      delay: h % 5 === 0 ? 3 : 0,
      stops: null,
      _seed: h,
    };
  });
}

function stepSimulation() {
  schedules.forEach(s => {
    const t = tracks[s.id];
    if (!t || t._seed === undefined) return;
    const durSec = duration(s) * 60;
    if (t.progress >= 1) {
      t._hold = (t._hold || 0) + 1;
      if (t._hold > 8) { t.progress = 0; t._hold = 0; }
      t.speed = 0;
      return;
    }
    t.progress = Math.min(1, t.progress + (DEMO_SPEED * TICK_MS / 1000) / durSec);
    const wob = Math.sin(Date.now() / 4000 + t._seed) * 0.5 + 0.5;
    t.speed = t.progress < 0.02 ? 0 : Math.round(28 + wob * 24);
  });
  lastUpdate = new Date();
}

/* ── Derived values ─────────────────────────────────────────── */
function stateOf(s) {
  const t = tracks[s.id] || { progress: 0, delay: 0 };
  if (t.progress >= 1)   return { key: 'arrived',  label: 'Arrived', badge: 'badge-blue' };
  if (t.progress < 0.02) return { key: 'boarding', label: 'Boarding', badge: 'badge-purple' };
  if (t.delay >= 3)       return { key: 'delayed',  label: `Delayed ${Math.round(t.delay)} min`, badge: 'badge-amber' };
  return { key: 'ontime', label: 'In Transit', badge: 'badge-green' };
}

function remainingMin(s) {
  const t = tracks[s.id];
  return (1 - (t?.progress || 0)) * duration(s) + (t?.delay || 0) * (t && t.progress < 1 ? 1 : 0);
}

function etaClock(s) {
  return fmtClock(toMin(s.arrival_time) + (tracks[s.id]?.delay || 0));
}

const isMine = s => myBookings.some(b => ['Confirmed','Pending'].includes(b.status) &&
  (Number(b.schedule_id) === Number(s.id) ||
   (b.route_name === s.route_name && (b.departure_time || '').substring(0,5) === (s.departure_time || '').substring(0,5))));

function tripsFor(which) {
  let list = which === 'mine' ? schedules.filter(isMine) : schedules.slice();
  if (searchQ) {
    const q = searchQ.toLowerCase();
    list = list.filter(s => `${s.route_name} ${s.origin} ${s.destination} ${s.shuttle_code} ${s.plate_number}`.toLowerCase().includes(q));
  }
  return list;
}

/* ── Tabs / search ──────────────────────────────────────────── */
function setTab(t) {
  tab = t;
  renderTabs();
  renderList();
}

function filterTrips(q) {
  searchQ = (q || '').trim();
  renderTabs();
  renderList();
}

function renderTabs() {
  const tMine = $('tab-mine');
  const tAll  = $('tab-all');
  if (tMine) tMine.classList.toggle('active', tab === 'mine');
  if (tAll)  tAll.classList.toggle('active', tab === 'all');

  const cntMine = $('cnt-mine') || $('tab-mine-count');
  const cntAll  = $('cnt-all')  || $('tab-all-count');
  if (cntMine) cntMine.textContent = tripsFor('mine').length;
  if (cntAll)  cntAll.textContent  = tripsFor('all').length;
}

/* ── Stats ──────────────────────────────────────────────────── */
function updateStats() {
  let active = 0, ontime = 0, delayed = 0, mine = 0;
  schedules.forEach(s => {
    const st = stateOf(s).key;
    if (st === 'ontime' || st === 'delayed') {
      active++;
      if (isMine(s)) mine++;
    }
    if (st === 'ontime') ontime++;
    if (st === 'delayed') delayed++;
  });
  if ($('st-active'))  $('st-active').textContent  = active;
  if ($('st-ontime'))  $('st-ontime').textContent  = ontime;
  if ($('st-delayed')) $('st-delayed').textContent = delayed;
  if ($('st-mine'))    $('st-mine').textContent    = mine;
}

/* ── Shuttle list ───────────────────────────────────────────── */
function renderList() {
  const list = tripsFor(tab);
  const el = $('tk-list');
  if (!el) return;

  if (!list.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${tab === 'mine' ? '🎫' : '🔍'}</div>
        <p>${tab === 'mine' ? 'You have no active bookings to track.' : 'No shuttles match your search.'}</p>
        ${tab === 'mine' ? `<button class="btn btn-primary btn-sm" onclick="setTab('all')">Browse All Shuttles</button>` : ''}
      </div>`;
    return;
  }

  el.innerHTML = list.map(s => {
    const t = tracks[s.id] || { progress: 0 }, st = stateOf(s), rem = remainingMin(s);
    return `
      <div class="tk-item ${s.id === selectedId ? 'selected' : ''}" data-id="${s.id}" onclick="selectTrip(${s.id})">
        <div class="tk-item-top">
          <div>
            <div class="tk-item-name">${esc(s.route_name)}</div>
            <div class="tk-item-sub"><span>${esc(s.origin)}</span> → ${esc(s.destination)}</div>
          </div>
          <span class="badge ${st.badge}" data-role="badge">${st.label}</span>
        </div>
        <div class="tk-item-mid">
          <div>🚐 ${esc(s.shuttle_code)} · ${esc((s.departure_time||'').substring(0,5))} → ${esc((s.arrival_time||'').substring(0,5))}</div>
          <div class="tk-item-eta" data-role="eta">${st.key === 'arrived' ? '—' : Math.max(0, Math.round(rem))}<small>${st.key === 'arrived' ? 'arrived' : 'min'}</small></div>
        </div>
        <div class="tk-mini-bar"><div class="tk-mini-fill" data-role="fill" style="width:${(t.progress * 100).toFixed(1)}%"></div></div>
      </div>`;
  }).join('');
}

function updateListLive() {
  document.querySelectorAll('.tk-item').forEach(item => {
    const s = schedules.find(x => x.id === Number(item.dataset.id));
    if (!s) return;
    const t = tracks[s.id] || { progress: 0 }, st = stateOf(s), rem = remainingMin(s);
    const b = item.querySelector('[data-role=badge]');
    if (b) { b.className = `badge ${st.badge}`; b.textContent = st.label; }
    const eta = item.querySelector('[data-role=eta]');
    if (eta) eta.innerHTML = `${st.key === 'arrived' ? '—' : Math.max(0, Math.round(rem))}<small>${st.key === 'arrived' ? 'arrived' : 'min'}</small>`;
    const fill = item.querySelector('[data-role=fill]');
    if (fill) fill.style.width = (t.progress * 100).toFixed(1) + '%';
  });
}

/* ── Selection ──────────────────────────────────────────────── */
function selectTrip(id, silent) {
  selectedId = id;
  document.querySelectorAll('.tk-item').forEach(i => {
    i.classList.toggle('selected', Number(i.dataset.id) === id);
  });
  const s = schedules.find(x => x.id === id);
  const detailPanel = $('trip-detail-panel') || $('tk-detail');
  if (detailPanel) detailPanel.style.display = s ? 'block' : 'none';

  const mapTitle = $('map-route-title') || $('map-title');
  if (mapTitle) {
    mapTitle.textContent = s ? `${s.route_name}: ${s.origin} → ${s.destination}` : 'Select a shuttle to view live route';
  }

  if (s) {
    buildMap(s);
    refreshDetail();
    if (!silent && window.innerWidth <= 1100 && $('tk-map')) {
      $('tk-map').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

/* ── Map ────────────────────────────────────────────────────── */
const SVGNS = 'http://www.w3.org/2000/svg';
function mk(tag, attrs = {}, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

function routePoints(s) {
  const r = rng(hash(s.route_name || s.id));
  const n = 6, pts = [];
  for (let i = 0; i < n; i++) {
    const x = 90 + (620 * i) / (n - 1);
    const y = i === 0 || i === n - 1 ? 150 + r() * 160 : 80 + r() * 300;
    pts.push([x, y]);
  }
  return pts;
}

function smoothPath(p) {
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function stopList(s) {
  const t = tracks[s.id] || {};
  const dur = duration(s), dep = toMin(s.departure_time);
  const mids = (t.stops && t.stops.length) ? t.stops : ['Midway Stop 1', 'Transit Junction', 'University Station'];
  const out = [{ name: s.origin, frac: 0, kind: 'start' }];
  mids.forEach((name, i) => out.push({ name, frac: (i + 1) / (mids.length + 1), kind: 'mid' }));
  out.push({ name: s.destination, frac: 1, kind: 'end' });
  out.forEach(o => o.sched = dep + o.frac * dur);
  return out;
}

function buildMap(s) {
  const svg = $('tk-map');
  if (!svg) return;
  svg.innerHTML = '';
  otherEls = {};
  stopEls = [];
  cam = { x: 0, y: 0, w: 800, h: 460 };
  camTarget = { ...cam };
  applyCam();

  const defs = mk('defs', {}, svg);
  const g = mk('linearGradient', { id: 'routeGrad', x1: '0', x2: '1' }, defs);
  mk('stop', { offset: '0', 'stop-color': '#38bdf8' }, g);
  mk('stop', { offset: '1', 'stop-color': '#a78bfa' }, g);

  // Background map grid
  const r = rng(hash('bg' + s.route_name));
  const bg = mk('g', {}, svg);
  for (let x = 0; x <= 800; x += 40) mk('line', { x1: x, y1: 0, x2: x, y2: 460, class: 'map-grid-line' }, bg);
  for (let y = 0; y <= 460; y += 40) mk('line', { x1: 0, y1: y, x2: 800, y2: y, class: 'map-grid-line' }, bg);
  for (let i = 0; i < 14; i++) mk('rect', { x: r() * 740, y: r() * 400, width: 30 + r() * 60, height: 24 + r() * 44, rx: 6, class: 'map-block' }, bg);
  for (let i = 0; i < 4; i++) mk('path', { d: `M${-20},${40 + r() * 380} Q${300 + r() * 200},${r() * 460} ${820},${40 + r() * 380}`, class: 'map-road' }, bg);

  const d = smoothPath(routePoints(s));
  mapPath = mk('path', { d, class: 'map-track' }, svg);
  mapLen  = mapPath.getTotalLength();
  doneEl  = mk('path', { d, class: 'map-done', 'stroke-dasharray': `0 ${mapLen}` }, svg);

  // Stops + labels
  stopList(s).forEach(st => {
    const pt = mapPath.getPointAtLength(st.frac * mapLen);
    const end = st.kind !== 'mid';
    const c = mk('circle', { cx: pt.x, cy: pt.y, r: end ? 10 : 7, class: 'map-stop' + (end ? ' map-stop-end' : '') }, svg);
    stopEls.push({ el: c, frac: st.frac });
    const below = pt.y < 260;
    const lbl = mk('text', {
      x: pt.x,
      y: pt.y + (below ? 28 : -20),
      'text-anchor': st.kind === 'start' ? 'start' : st.kind === 'end' ? 'end' : 'middle',
      class: 'map-label' + (end ? ' end' : '')
    }, svg);
    if (st.kind === 'start') lbl.setAttribute('x', pt.x - 10);
    if (st.kind === 'end')   lbl.setAttribute('x', pt.x + 10);
    lbl.textContent = st.name;
  });

  // Other shuttles on the same route
  schedules.filter(o => o.id !== s.id && o.route_name === s.route_name).forEach(o => {
    const dot = mk('circle', { r: 9, class: 'map-other' }, svg);
    dot.classList.add('map-bus-g');
    const title = mk('title', {}, dot);
    title.textContent = `${o.shuttle_code} · ${o.departure_time.substring(0,5)}`;
    dot.addEventListener('click', () => selectTrip(o.id));
    otherEls[o.id] = dot;
  });

  // Selected shuttle marker
  busG = mk('g', { class: 'map-bus-g' }, svg);
  mk('circle', { r: 12, class: 'map-pulse' }, busG);
  mk('circle', { r: 17, class: 'map-bus-body' }, busG);
  const ic = mk('text', { class: 'map-bus-icon' }, busG);
  ic.textContent = '🚌';
  const tag = mk('g', { transform: 'translate(0,-34)' }, busG);
  tagRect = mk('rect', { x: -34, y: -13, width: 68, height: 26, rx: 13, class: 'map-tag' }, tag);
  tagText = mk('text', { class: 'map-tag-text' }, tag);
  busG.style.transitionDuration = simMode ? '1s' : (POLL_MS / 1000) + 's';

  busG.style.transition = 'none';
  Object.values(otherEls).forEach(e => e.style.transition = 'none');
  updateMap();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (busG) busG.style.transition = '';
    Object.values(otherEls).forEach(e => e.style.transition = '');
  }));
}

function placeAt(el, frac) {
  if (!mapPath) return { x: 0, y: 0 };
  const pt = mapPath.getPointAtLength(Math.min(1, Math.max(0, frac)) * mapLen);
  el.style.transform = `translate(${pt.x}px, ${pt.y}px)`;
  return pt;
}

function updateMap() {
  const s = schedules.find(x => x.id === selectedId);
  if (!s || !mapPath || !busG) return;
  const t = tracks[s.id] || { progress: 0 };
  const pt = placeAt(busG, t.progress);
  if (doneEl) doneEl.setAttribute('stroke-dasharray', `${t.progress * mapLen} ${mapLen}`);
  stopEls.forEach(o => o.el.classList.toggle('passed', t.progress >= o.frac - 0.001));
  Object.entries(otherEls).forEach(([id, el]) => placeAt(el, (tracks[id] || { progress: 0 }).progress));

  const rem = Math.max(0, Math.round(remainingMin(s)));
  if (tagText) tagText.textContent = t.progress >= 1 ? 'Arrived' : `${rem} min`;

  // Camera tracking
  if (follow) {
    camTarget = { w: 440, h: 253, x: Math.min(800 - 440, Math.max(0, pt.x - 220)), y: Math.min(460 - 253, Math.max(0, pt.y - 126)) };
  } else {
    camTarget = { x: 0, y: 0, w: 800, h: 460 };
  }
}

function applyCam() {
  const map = $('tk-map');
  if (map) map.setAttribute('viewBox', `${cam.x} ${cam.y} ${cam.w} ${cam.h}`);
}

function cameraLoop() {
  const k = 0.06;
  ['x','y','w','h'].forEach(p => cam[p] += (camTarget[p] - cam[p]) * k);
  applyCam();
  requestAnimationFrame(cameraLoop);
}

function toggleFollow() {
  follow = !follow;
  const btn = $('btn-follow') || $('follow-btn');
  if (btn) btn.textContent = `🎯 Follow: ${follow ? 'On' : 'Off'}`;
  updateMap();
}

/* ── Detail panel ───────────────────────────────────────────── */
function refreshDetail() {
  const s = schedules.find(x => x.id === selectedId);
  if (!s) return;
  const t = tracks[s.id] || { progress: 0, speed: 0, delay: 0 };
  const st = stateOf(s), rem = Math.max(0, remainingMin(s));
  const totalKm = duration(s) * AVG_KMH / 60;
  const stops = stopList(s);
  const next = stops.find(x => x.frac > t.progress + 0.0001);
  const cap = Number(s.capacity) || 24, occ = Math.max(0, cap - Number(s.available_seats ?? cap));

  if ($('eta-time')) $('eta-time').textContent = etaClock(s);
  if ($('eta-sub')) {
    $('eta-sub').textContent = st.key === 'arrived' ? `Arrived at ${s.destination}`
      : st.key === 'boarding' ? `Boarding at ${s.origin} · departs ${(s.departure_time||'').substring(0,5)}`
      : `in ${Math.round(rem)} min · scheduled ${(s.arrival_time||'').substring(0,5)}`;
  }

  const dStatus = $('d-status') || $('eta-status');
  if (dStatus) {
    dStatus.className = `badge ${st.badge}`;
    dStatus.textContent = st.label;
  }

  if ($('eta-fill')) $('eta-fill').style.width = (t.progress * 100).toFixed(1) + '%';
  if ($('eta-pct'))  $('eta-pct').textContent  = Math.round(t.progress * 100) + '%';
  if ($('eta-from')) $('eta-from').textContent = s.origin;
  if ($('eta-to'))   $('eta-to').textContent   = s.destination;

  if ($('m-speed')) $('m-speed').innerHTML = `${Math.round(t.speed || 0)} <small>km/h</small>`;
  if ($('m-dist'))  $('m-dist').innerHTML  = `${(totalKm * (1 - t.progress)).toFixed(1)} <small>km</small>`;
  if ($('m-next'))  $('m-next').textContent = next ? `${next.name} · ${fmtClock(next.sched + (t.delay || 0))}` : 'Final stop reached';
  if ($('m-occ'))   $('m-occ').innerHTML = `${occ}<small> / ${cap} seats</small>`;
  if ($('d-shuttle')) $('d-shuttle').textContent = `📅 ${s.operating_days || 'Daily'}`;

  const timeline = $('tk-timeline');
  if (timeline) {
    timeline.innerHTML = stops.map((o, i) => {
      const done = t.progress >= o.frac - 0.001;
      const nextFrac = stops[i + 1]?.frac ?? 2;
      const current = done && t.progress < nextFrac - 0.001 && o.kind !== 'end';
      const cls = current ? 'current' : done ? 'done' : '';
      const note = o.kind === 'start' ? 'Departure' : o.kind === 'end' ? 'Final destination' : 'Stop';
      return `
        <div class="tl-step ${cls}">
          <div class="tl-dot">${done && !current ? '✓' : current ? '🚌' : ''}</div>
          <div class="tl-body">
            <div><div class="tl-name">${esc(o.name)}</div><div class="tl-note">${note}${current ? ' · shuttle in transit' : ''}</div></div>
            <div class="tl-time">${fmtClock(o.sched + (t.delay || 0))}</div>
          </div>
        </div>`;
    }).join('');
  }
}

/* ── Tick / refresh ─────────────────────────────────────────── */
function tick() {
  if (simMode) stepSimulation();
  updateStats();
  updateListLive();
  updateMap();
  refreshDetail();
  const upEl = $('tk-updated');
  if (upEl) {
    upEl.textContent = lastUpdate ? 'Updated ' + lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
  }
}

async function refreshNow() {
  await pollTracking(false);
  tick();
  toast('Tracking refreshed.', 'info');
}

init();
