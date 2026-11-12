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

// --- Live Google Calendar via Google Identity Services (browser token flow) ---
let _tokenClient = null;
let _accessToken = null;
let _tokenExpiry = 0;
let _pending = null;   // {resolve, reject}

function _initTokenClient() {
  if (_tokenClient) return true;
  if (!(window.google && google.accounts && google.accounts.oauth2)) return false;
  _tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.googleClientId,
    scope: CONFIG.calendarScope,
    callback: (resp) => {
      const p = _pending; _pending = null;
      if (!p) return;
      if (resp && resp.access_token) {
        _accessToken = resp.access_token;
        _tokenExpiry = Date.now() + ((resp.expires_in || 3600) - 60) * 1000;
        p.resolve(_accessToken);
      } else {
        p.reject(new Error(resp && resp.error ? resp.error : "no token"));
      }
    },
    error_callback: (err) => {
      const p = _pending; _pending = null;
      if (p) p.reject(new Error(err && err.type ? err.type : "oauth error"));
    }
  });
  return true;
}

// interactive=false -> silent renewal (no popup, needs an existing grant + live session)
// interactive=true  -> show the Google consent/account chooser (must be from a tap)
function _getToken(interactive) {
  return new Promise((resolve, reject) => {
    if (_accessToken && Date.now() < _tokenExpiry) { resolve(_accessToken); return; }
    if (!_initTokenClient()) { reject(new Error("GIS not loaded")); return; }
    _pending = { resolve, reject };
    try {
      _tokenClient.requestAccessToken({ prompt: interactive ? "consent" : "none" });
    } catch (e) {
      _pending = null; reject(e);
    }
  });
}

async function loadGoogleCalendar() {
  const token = await _getToken(false);   // silent; the Sign in button does the interactive one
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

function signInInteractive() {
  setStatus("Signing in...");
  _getToken(true).then(() => refreshEvents()).catch(() => setStatus("Sign-in failed, tap to retry"));
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
    + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum"
    + "&forecast_days=6&timezone=" + encodeURIComponent(CONFIG.tz);
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("weather " + r.status);
    const j = await r.json();
    const d = j.daily;
    const cTemp = Math.round(j.current.temperature_2m);
    const cCode = j.current.weather_code;
    const cDesc = WMO[cCode] || "Weather";
    const todayRain = d.precipitation_probability_max ? d.precipitation_probability_max[0] : null;

    // small current block in the header
    $("wTemp").textContent = cTemp + "°";
    $("wDesc").textContent = cDesc;

    // prominent current block in the weather panel
    $("wxNow").innerHTML =
      '<span class="wx-ico">' + wxSvg(wmoCat(cCode)) + '</span>'
      + '<span class="wx-now-temp">' + cTemp + '°</span>'
      + '<span class="wx-now-main"><span class="wx-now-text">' + cDesc + '</span>'
      + (todayRain != null && todayRain > 0 ? '<span class="wx-now-rain">Rain ' + Math.round(todayRain) + '%</span>' : '')
      + '</span>';

    // multi-day forecast rows
    const n = Math.min(6, d.time.length);
    let rows = "";
    for (let i = 0; i < n; i++) {
      const prob = d.precipitation_probability_max ? d.precipitation_probability_max[i] : null;
      const sum = d.precipitation_sum ? d.precipitation_sum[i] : 0;
      const wet = (prob != null && prob > 0) || (sum != null && sum >= 0.1);
      const hi = Math.round(d.temperature_2m_max[i]);
      const lo = Math.round(d.temperature_2m_min[i]);
      rows += "<li>"
        + '<span class="d-day">' + dayLabel(i, d.time[i]) + "</span>"
        + '<span class="d-ico">' + wxSvg(wmoCat(d.weather_code[i])) + "</span>"
        + '<span class="d-rain">' + (wet && prob != null ? Math.round(prob) + "%" : '<span class="d-blank">&mdash;</span>') + "</span>"
        + '<span class="d-mm">' + (wet ? mmFmt(sum) : '<span class="d-blank">&nbsp;</span>') + "</span>"
        + '<span class="d-temp">' + hi + "° <span class=\"lo\">" + lo + "°</span></span>"
        + "</li>";
    }
    $("wxDays").innerHTML = rows;
    setStatus("Updated " + pad(new Date().getHours()) + ":" + pad(new Date().getMinutes()));
  } catch (e) {
    $("wDesc").textContent = "Weather offline";
    $("wxNow").innerHTML = '<span class="muted">Weather unavailable</span>';
    setStatus("Weather: " + (e && e.message ? String(e.message).slice(0, 70) : "error"));
  }
}

/* ---------------- agenda ---------------- */
function renderAgenda(events) {
  const today = events
    .filter((e) => sameDay(e.start, new Date()))
    .sort((a, b) => a.start - b.start);
  const ul = $("todayEvents");
  if (!today.length) {
    ul.innerHTML = '<li class="ev-free">Nothing on today</li>';
    return;
  }
  ul.innerHTML = today.map((e) => {
    const time = e.allDay ? '<span class="ev-time ev-all">All day</span>'
      : '<span class="ev-time">' + pad(e.start.getHours()) + ":" + pad(e.start.getMinutes()) + '</span>';
    return "<li>" + time + '<span class="ev-title">' + escapeHtml(e.title) + "</span></li>";
  }).join("");
}

function isTrainingToday(events) {
  return events.some((e) => sameDay(e.start, new Date()) && !e.allDay && CONFIG.trainingRe.test(e.title));
}

/* ---------------- dinner shortlist ---------------- */
function renderDinner(events) {
  const menu = window.FAMILY_MENU || [];
  const training = isTrainingToday(events);
  const pool = training ? menu.filter((m) => m.quick) : menu;   // no pork is already baked into the menu
  const now = new Date();
  const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  const picks = seededShuffle(pool.length ? pool : menu, seed).slice(0, CONFIG.mealCount);

  $("dinnerHint").textContent = training ? "training night, quick picks" : "pick one";
  $("meals").innerHTML = picks.map((m) => {
    const tag = m.quick ? '<span class="tag quick">Quick</span>' : '<span class="tag">Cook-up</span>';
    return '<li class="meal">'
      + '<div class="m-name">' + escapeHtml(m.name) + "</div>"
      + '<div class="m-tags">' + tag + "</div>"
      + '<div class="m-buy">' + escapeHtml(m.buy) + "</div>"
      + '<div class="m-link">' + shortLink(m.link) + "</div>"
      + "</li>";
  }).join("");
}

function shortLink(url) {
  try { const u = new URL(url); return escapeHtml(u.hostname.replace(/^www\./, "") + " recipes"); }
  catch (e) { return ""; }
}

/* ---------------- coming up (all upcoming events after today) ---------------- */
function renderCountdowns(events) {
  const now = new Date();
  const tomorrow0 = new Date(startOfDay(now)); tomorrow0.setDate(tomorrow0.getDate() + 1);
  const upcoming = events
    .filter((e) => e.start >= tomorrow0)
    .sort((a, b) => a.start - b.start)
    .slice(0, 6);
  const ul = $("countdowns");
  if (!upcoming.length) { ul.innerHTML = '<li class="muted">Nothing coming up</li>'; return; }
  ul.innerHTML = upcoming.map((e) => {
    const d = daysBetween(now, e.start);
    let when;
    if (d === 1) when = "Tomorrow";
    else if (d < 7) when = e.start.toLocaleDateString("en-GB", { weekday: "long" });
    else when = e.start.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    const time = e.allDay ? "" : " " + pad(e.start.getHours()) + ":" + pad(e.start.getMinutes());
    const soon = d <= 2 ? " soon" : "";
    return "<li>" + '<span class="cd-title">' + escapeHtml(e.title) + "</span>"
      + '<span class="cd-when' + soon + '">' + when + escapeHtml(time) + "</span></li>";
  }).join("");
}

/* ---------------- plumbing ---------------- */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function refreshEvents() {
  try {
    const events = await getEvents();
    renderAgenda(events);
    renderDinner(events);
    renderCountdowns(events);
    $("signin").hidden = true;
  } catch (e) {
    // Live path not ready / session dropped -> offer a sign-in and keep the rest alive.
    $("todayEvents").innerHTML = '<li class="muted">Tap Sign in to show the calendar</li>';
    $("signin").hidden = USE_MOCK;   // only show the button once the live path exists
    renderDinner([]);                 // still suggest meals even with no calendar
    renderCountdowns([]);
  }
}

function init() {
  const signinBtn = $("signin");
  if (signinBtn) signinBtn.addEventListener("click", signInInteractive);

  tickClock();
  setInterval(tickClock, 1000);

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
  setTimeout(() => { refreshEvents(); scheduleMidnight(); }, next - now);
}

document.addEventListener("DOMContentLoaded", init);
