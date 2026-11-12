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

async function loadWeather() {
  const url = "https://api.open-meteo.com/v1/forecast"
    + "?latitude=" + CONFIG.lat + "&longitude=" + CONFIG.lon
    + "&current=temperature_2m,weather_code"
    + "&daily=temperature_2m_max,temperature_2m_min,weather_code"
    + "&timezone=" + encodeURIComponent(CONFIG.tz);
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("weather " + r.status);
    const j = await r.json();
    const t = Math.round(j.current.temperature_2m);
    const desc = WMO[j.current.weather_code] || "Weather";
    $("wTemp").textContent = t + "°";
    $("wDesc").textContent = desc;
    const hi = Math.round(j.daily.temperature_2m_max[0]);
    const lo = Math.round(j.daily.temperature_2m_min[0]);
    const dDesc = WMO[j.daily.weather_code[0]] || "";
    $("wxToday").innerHTML =
      '<span class="wx-hi">' + hi + '°</span>'
      + '<span class="wx-lo">' + lo + '°</span>'
      + '<span class="wx-desc">' + dDesc + '</span>';
    setStatus("Updated " + pad(new Date().getHours()) + ":" + pad(new Date().getMinutes()));
  } catch (e) {
    $("wDesc").textContent = "Weather offline";
    setStatus("Weather error");
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

/* ---------------- countdowns ---------------- */
function renderCountdowns(events) {
  const now = new Date();
  const upcoming = events
    .filter((e) => e.start >= startOfDay(now) && CONFIG.competitionRe.test(e.title))
    .sort((a, b) => a.start - b.start)
    .slice(0, 3);
  const ul = $("countdowns");
  if (!upcoming.length) { ul.innerHTML = '<li class="muted">Nothing coming up</li>'; return; }
  ul.innerHTML = upcoming.map((e) => {
    const d = daysBetween(now, e.start);
    const when = d <= 0 ? "Today" : d === 1 ? "Tomorrow" : "in " + d + " days";
    const soon = d <= 2 ? " soon" : "";
    return "<li>" + '<span class="cd-title">' + escapeHtml(e.title) + "</span>"
      + '<span class="cd-when' + soon + '">' + when + "</span></li>";
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
