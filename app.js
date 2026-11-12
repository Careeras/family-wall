/* Family wall - display only. Vanilla JS, no framework (kiosk-friendly).
   Panels: clock, today agenda, dinner shortlist, countdowns, Farum weather.
   Lights and shopping are intentionally NOT here (Gemini voice / open the app). */
"use strict";

const CONFIG = {
  lat: 55.8126, lon: 12.3661, tz: "Europe/Copenhagen",   // Farum
  weatherEveryMs: 30 * 60 * 1000,
  eventsEveryMs: 15 * 60 * 1000,
  mealCount: 3,
  // Google OAuth (public client ID, browser token flow, read-only calendar). Household account only.
  googleClientId: "908805586296-b8nla3dfcv0hovecsu45rqa5jf4ivkuv.apps.googleusercontent.com",
  calendarScope: "https://www.googleapis.com/auth/calendar.readonly",
  calendarDaysAhead: 21,
  // A timed event whose title matches this is a "training night" -> prefer quick meals.
  trainingRe: /\b(tennis|football|fodbold|gym|gymnastik|tr[aæ]ning|sv[oø]m|h[aå]ndbold|basket|kamp|turnering|st[aæ]vne)\b/i,
  // Upcoming events that read like a competition, for the countdowns panel.
  competitionRe: /\b(cup|turnering|st[aæ]vne|kamp|competition|julecup|finale|match)\b/i
};

/* ======================================================================
   CALENDAR SOURCE  --  the only place that changes when OAuth is wired.
   getEvents() must resolve to an array of:
     { title:String, start:Date, end:Date, allDay:Boolean }
   Right now it returns mock data so the page is fully testable offline.
   To go live: set USE_MOCK=false and implement loadGoogleCalendar()
   (Google Identity Services token client, scope calendar.readonly,
    the household account). See OAUTH-SETUP.md (kept in the private repo).
   ====================================================================== */
const USE_MOCK = false;

function getEvents() {
  if (USE_MOCK) return Promise.resolve(mockEvents());
  return loadGoogleCalendar();
}

function mockEvents() {
  const now = new Date();
  const at = (dayOffset, h, m) => {
    const d = new Date(now); d.setDate(d.getDate() + dayOffset); d.setHours(h, m, 0, 0); return d;
  };
  const mk = (title, s, durMin, allDay) => ({ title, start: s, end: new Date(s.getTime() + (durMin || 60) * 60000), allDay: !!allDay });
  return [
    mk("J: GYM", at(0, 16, 30), 90),
    mk("V: Tennis", at(0, 18, 0), 60),
    mk("V: Tennis turnering", at(3, 9, 0), 240),
    mk("Tandlæge Julia", at(5, 14, 15), 45),
    mk("GIF Julecup", at(10, 10, 0), 0, true)
  ];
}

// --- Live Google Calendar via OAuth 2.0 redirect flow (works without popups) ---
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const REDIRECT_URI = "https://careeras.github.io/family-wall/oauth.html";

let _accessToken = null;
let _tokenExpiry = 0;
let _cacheLoaded = false;
let _silent = null;   // {resolve, reject, ifr, timer} while a silent refresh is in flight

function _loadCachedToken() {
  if (_cacheLoaded) return;
  _cacheLoaded = true;
  try {
    const o = JSON.parse(localStorage.getItem("fw_tok") || "null");
    if (o && o.t && o.e && Date.now() < o.e) { _accessToken = o.t; _tokenExpiry = o.e; }
  } catch (e) { /* storage may be blocked */ }
}
function _saveToken() {
  try {
    localStorage.setItem("fw_tok", JSON.stringify({ t: _accessToken, e: _tokenExpiry }));
    localStorage.setItem("fw_granted", "1");
  } catch (e) { /* ignore */ }
}
function _granted() {
  try { return localStorage.getItem("fw_granted") === "1"; } catch (e) { return false; }
}

function _newState() {
  try {
    const a = new Uint8Array(16); crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch (e) { return String(Date.now()) + Math.random().toString(16).slice(2); }
}

function _authUrl(prompt, state) {
  const p = new URLSearchParams();
  p.set("client_id", CONFIG.googleClientId);
  p.set("redirect_uri", REDIRECT_URI);
  p.set("response_type", "token");
  p.set("scope", CONFIG.calendarScope);
  p.set("include_granted_scopes", "true");
  if (state) p.set("state", state);
  if (prompt) p.set("prompt", prompt);
  return AUTH_ENDPOINT + "?" + p.toString();
}

// Silent refresh via a hidden iframe (no page reload). Needs 3rd-party cookies + a live Google session.
function _silentRenew() {
  return new Promise((resolve, reject) => {
    if (_silent) { reject(new Error("busy")); return; }
    const ifr = document.createElement("iframe");
    ifr.style.display = "none";
    ifr.setAttribute("aria-hidden", "true");
    const state = _newState();
    const timer = setTimeout(() => _endSilent(null, "timeout"), 12000);
    _silent = { resolve, reject, ifr, timer, state };
    ifr.src = _authUrl("none", state);
    document.body.appendChild(ifr);
  });
}
function _endSilent(token, err) {
  if (!_silent) return;
  const s = _silent; _silent = null;
  clearTimeout(s.timer);
  try { s.ifr.remove(); } catch (e) {}
  if (token) s.resolve(token); else s.reject(new Error(err || "silent failed"));
}

window.addEventListener("message", (ev) => {
  if (ev.origin !== location.origin) return;
  const d = ev.data;
  if (!d || typeof d.fw_oauth !== "string") return;
  const h = new URLSearchParams(d.fw_oauth);
  // CSRF guard: the returned state must match the one we created for this silent request.
  if (!_silent || !h.get("state") || h.get("state") !== _silent.state) { _endSilent(null, "state mismatch"); return; }
  const t = h.get("access_token");
  if (t) {
    _accessToken = t;
    _tokenExpiry = Date.now() + ((parseInt(h.get("expires_in"), 10) || 3600) - 60) * 1000;
    _saveToken();
    _endSilent(t);
  } else {
    _endSilent(null, h.get("error") || "no token");
  }
});

async function _ensureToken() {
  _loadCachedToken();
  if (_accessToken && Date.now() < _tokenExpiry) return _accessToken;
  if (_granted()) return await _silentRenew();   // may reject -> caller shows Sign in
  throw new Error("no token");
}

async function loadGoogleCalendar() {
  const token = await _ensureToken();
  const now = new Date();
  const max = new Date(now); max.setDate(max.getDate() + CONFIG.calendarDaysAhead);
  const url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
    + "?singleEvents=true&orderBy=startTime&maxResults=50"
    + "&timeMin=" + encodeURIComponent(startOfDay(now).toISOString())
    + "&timeMax=" + encodeURIComponent(max.toISOString());
  const r = await fetch(url, { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
  if (r.status === 401) { _accessToken = null; _tokenExpiry = 0; throw new Error("calendar 401"); }
  if (!r.ok) throw new Error("calendar " + r.status);
  const j = await r.json();
  return (j.items || []).map((ev) => {
    const allDay = !!(ev.start && ev.start.date);
    const start = new Date(allDay ? ev.start.date + "T00:00:00" : ev.start.dateTime);
    const endRaw = allDay ? (ev.end && ev.end.date ? ev.end.date + "T00:00:00" : null) : (ev.end && ev.end.dateTime);
    const end = endRaw ? new Date(endRaw) : new Date(start.getTime() + 3600000);
    return { title: ev.summary || "(no title)", start, end, allDay };
  });
}

// Interactive sign-in: a full-page redirect to Google (no popup needed).
function signInInteractive() {
  setStatus("Signing in...");
  const state = _newState();
  try { sessionStorage.setItem("fw_state", state); } catch (e) {}
  location.href = _authUrl("", state);
}

/* ---------------- utilities ---------------- */
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000);

// deterministic shuffle so the shortlist is stable through the day, changes daily
function seededShuffle(arr, seed) {
  const a = arr.slice();
  let s = seed % 2147483647; if (s <= 0) s += 2147483646;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function setStatus(msg) { $("status").textContent = msg; }

/* ---------------- clock ---------------- */
function tickClock() {
  const d = new Date();
  $("clock").textContent = pad(d.getHours()) + ":" + pad(d.getMinutes());
  $("date").textContent = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

/* ---------------- weather (Open-Meteo, no key, CORS-open) ---------------- */
const WMO = {
  0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
  56: "Freezing drizzle", 57: "Freezing drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
  66: "Freezing rain", 67: "Freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow",
  77: "Snow grains", 80: "Showers", 81: "Showers", 82: "Heavy showers",
  85: "Snow showers", 86: "Snow showers", 95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm"
};

function wmoCat(c) {
  if (c === 0) return "clear";
  if (c === 1 || c === 2) return "partly";
  if (c === 3) return "cloud";
  if (c === 45 || c === 48) return "fog";
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return "snow";
  if (c >= 95) return "thunder";
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return "rain";
  return "cloud";
}

// Inline SVG weather icons (no emoji, per the voice charter). cat -> svg string.
const _CLOUD = '<g fill="#9aa7b4"><circle cx="24" cy="36" r="10"/><circle cx="38" cy="31" r="13"/><circle cx="47" cy="40" r="9"/><rect x="20" y="40" width="31" height="10" rx="5"/></g>';
function wxSvg(cat) {
  const sun = '<circle cx="32" cy="30" r="11" fill="#f5a623"/><g stroke="#f5a623" stroke-width="3" stroke-linecap="round"><line x1="32" y1="6" x2="32" y2="13"/><line x1="32" y1="47" x2="32" y2="54"/><line x1="8" y1="30" x2="15" y2="30"/><line x1="49" y1="30" x2="56" y2="30"/><line x1="14" y1="12" x2="19" y2="17"/><line x1="45" y1="43" x2="50" y2="48"/><line x1="50" y1="12" x2="45" y2="17"/><line x1="19" y1="43" x2="14" y2="48"/></g>';
  const inner = {
    clear: '<svg viewBox="0 0 64 64" aria-hidden="true">' + sun + '</svg>',
    partly: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="23" cy="22" r="8" fill="#f5a623"/><g stroke="#f5a623" stroke-width="2.5" stroke-linecap="round"><line x1="23" y1="4" x2="23" y2="9"/><line x1="7" y1="22" x2="12" y2="22"/><line x1="11" y1="10" x2="14" y2="13"/><line x1="35" y1="10" x2="32" y2="13"/></g>' + _CLOUD + '</svg>',
    cloud: '<svg viewBox="0 0 64 64" aria-hidden="true">' + _CLOUD + '</svg>',
    fog: '<svg viewBox="0 0 64 64" aria-hidden="true">' + _CLOUD + '<g stroke="#9aa7b4" stroke-width="3" stroke-linecap="round"><line x1="20" y1="55" x2="44" y2="55"/><line x1="25" y1="61" x2="39" y2="61"/></g></svg>',
    rain: '<svg viewBox="0 0 64 64" aria-hidden="true">' + _CLOUD + '<g stroke="#2f7fe0" stroke-width="3.2" stroke-linecap="round"><line x1="26" y1="53" x2="23" y2="61"/><line x1="34" y1="53" x2="31" y2="61"/><line x1="42" y1="53" x2="39" y2="61"/></g></svg>',
    snow: '<svg viewBox="0 0 64 64" aria-hidden="true">' + _CLOUD + '<g fill="#cfe0ef"><circle cx="26" cy="57" r="2.6"/><circle cx="34" cy="59" r="2.6"/><circle cx="42" cy="57" r="2.6"/></g></svg>',
    thunder: '<svg viewBox="0 0 64 64" aria-hidden="true">' + _CLOUD + '<path d="M34 50 l-9 11 h6 l-4 9 13 -13 h-6 z" fill="#f5c518"/></svg>'
  };
  return inner[cat] || inner.cloud;
}

function mmFmt(x) {
  const v = (x == null ? 0 : x);
  return v.toLocaleString("da-DK", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " mm";
}
function dayLabel(i, iso) {
  if (i === 0) return "Today";
  if (i === 1) return "Tomorrow";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short" });
}

async function loadWeather() {
  const url = "https://api.open-meteo.com/v1/forecast"
    + "?latitude=" + CONFIG.lat + "&longitude=" + CONFIG.lon
    + "&current=temperature_2m,weather_code"
    + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
    + "&forecast_days=3&timezone=" + encodeURIComponent(CONFIG.tz);
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("weather " + r.status);
    const j = await r.json();
    const d = j.daily;
    const cTemp = Math.round(j.current.temperature_2m);
    const n = Math.min(3, d.time.length);
    let cols = "";
    for (let i = 0; i < n; i++) {
      const prob = d.precipitation_probability_max ? d.precipitation_probability_max[i] : null;
      const hi = Math.round(d.temperature_2m_max[i]);
      const lo = Math.round(d.temperature_2m_min[i]);
      const big = (i === 0 ? cTemp : hi);
      cols += '<div class="wx3-col">'
        + '<div class="wx3-day">' + dayLabel(i, d.time[i]) + '</div>'
        + '<div class="wx3-ico">' + wxSvg(wmoCat(d.weather_code[i])) + '</div>'
        + '<div class="wx3-temp">' + big + '°<span class="lo">' + lo + '°</span></div>'
        + '<div class="wx3-rain">' + (prob != null && prob > 0 ? Math.round(prob) + '%' : '&nbsp;') + '</div>'
        + '</div>';
    }
    $("wx3").innerHTML = cols;
    setStatus("Updated " + pad(new Date().getHours()) + ":" + pad(new Date().getMinutes()));
  } catch (e) {
    $("wx3").innerHTML = '<span class="muted">Weather offline</span>';
    setStatus("Weather: " + (e && e.message ? String(e.message).slice(0, 70) : "error"));
  }
}

/* ---------------- quote of the day ---------------- */
function renderQuote() {
  const q = window.FAMILY_QUOTES || [];
  if (!q.length) return;
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const doy = Math.floor((now - start) / 86400000);
  const pick = q[doy % q.length];
  $("quote").innerHTML = '<span class="q-text">“' + escapeHtml(pick.t) + '”</span>'
    + '<span class="q-author">' + escapeHtml(pick.a) + '</span>';
}

function isTrainingToday(events) {
  return events.some((e) => sameDay(e.start, new Date()) && !e.allDay && CONFIG.trainingRe.test(e.title));
}

/* ---------------- dinner shortlist ---------------- */
// pick N meals that differ in BOTH protein and form (no two shrimp, no two wraps, etc.)
function pickDiverse(pool, count) {
  const picks = [], usedP = new Set(), usedF = new Set();
  for (const m of pool) {
    if (picks.length >= count) break;
    if (usedP.has(m.protein) || usedF.has(m.form)) continue;
    picks.push(m); usedP.add(m.protein); usedF.add(m.form);
  }
  if (picks.length < count) {           // relax: keep protein distinct, allow form repeat
    for (const m of pool) {
      if (picks.length >= count) break;
      if (picks.indexOf(m) !== -1 || usedP.has(m.protein)) continue;
      picks.push(m); usedP.add(m.protein);
    }
  }
  for (const m of pool) {               // last resort: fill with anything left
    if (picks.length >= count) break;
    if (picks.indexOf(m) === -1) picks.push(m);
  }
  return picks;
}

function renderDinner(events) {
  const menu = window.FAMILY_MENU || [];
  const training = isTrainingToday(events);
  const pool = training ? menu.filter((m) => m.quick) : menu;   // no pork is already baked into the menu
  const now = new Date();
  const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  const picks = pickDiverse(seededShuffle(pool.length ? pool : menu, seed), CONFIG.mealCount);

  $("dinnerHint").textContent = training ? "training night, quick picks" : "pick one";
  $("meals").innerHTML = picks.map((m) => {
    const photo = m.img ? '<div class="m-photo"><img src="' + m.img + '" alt="" loading="lazy" referrerpolicy="no-referrer"></div>' : "";
    return '<li class="meal"><a class="m-card" href="' + m.link + '" target="_blank" rel="noopener">'
      + photo
      + '<div class="m-body"><div class="m-name">' + escapeHtml(m.name) + "</div></div>"
      + "</a></li>";
  }).join("");
}

function shortLink(url) {
  try { const u = new URL(url); return escapeHtml(u.hostname.replace(/^www\./, "") + " recipes"); }
  catch (e) { return ""; }
}

/* ---------------- coming up (today + upcoming, merged) ---------------- */
function renderCountdowns(events) {
  const now = new Date();
  const today0 = startOfDay(now);
  // Only upcoming: future timed events, plus all-day events for today or later. No done events.
  const list = events
    .filter((e) => (e.allDay ? startOfDay(e.start) >= today0 : e.start >= now))
    .sort((a, b) => a.start - b.start)
    .slice(0, 8);
  const ul = $("countdowns");
  if (!list.length) { ul.innerHTML = '<li class="muted">Nothing scheduled</li>'; return; }
  ul.innerHTML = list.map((e) => {
    const d = daysBetween(now, e.start);
    let label;
    if (d <= 0) label = "Today";
    else if (d === 1) label = "Tomorrow";
    else if (d < 7) label = e.start.toLocaleDateString("en-GB", { weekday: "long" });
    else label = e.start.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    const time = e.allDay ? "" : " " + pad(e.start.getHours()) + ":" + pad(e.start.getMinutes());
    const cls = d <= 0 ? " today" : (d <= 2 ? " soon" : "");
    return "<li>" + '<span class="cd-title">' + escapeHtml(e.title) + "</span>"
      + '<span class="cd-when' + cls + '">' + label + escapeHtml(time) + "</span></li>";
  }).join("");
}

/* ---------------- plumbing ---------------- */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function refreshEvents() {
  try {
    const events = await getEvents();
    renderCountdowns(events);
    renderDinner(events);
    $("signin").hidden = true;
  } catch (e) {
    // Live path not ready / session dropped -> offer a sign-in and keep the rest alive.
    $("countdowns").innerHTML = '<li class="muted">Tap Sign in to show the calendar</li>';
    $("signin").hidden = USE_MOCK;   // only show the button once the live path exists
    renderDinner([]);                 // still suggest meals even with no calendar
  }
}

function init() {
  const signinBtn = $("signin");
  if (signinBtn) signinBtn.addEventListener("click", signInInteractive);

  tickClock();
  setInterval(tickClock, 1000);

  renderQuote();
  loadWeather();
  setInterval(loadWeather, CONFIG.weatherEveryMs);

  refreshEvents();
  setInterval(refreshEvents, CONFIG.eventsEveryMs);

  // recompute at local midnight so the agenda, meal pick and countdowns roll over
  scheduleMidnight();
}

function scheduleMidnight() {
  const now = new Date();
  const next = new Date(now); next.setHours(24, 0, 30, 0);
  setTimeout(() => { renderQuote(); loadWeather(); refreshEvents(); scheduleMidnight(); }, next - now);
}

document.addEventListener("DOMContentLoaded", init);
