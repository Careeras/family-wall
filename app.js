/* Family wall - vanilla JS, no framework (kiosk-friendly), a scrolling column of cards.
   Cards: hero (clock, quote), weather, family agenda, tomorrow morning, shopping (opens Keep),
   dinner ideas, birthdays. Nothing personal lives in this public code (see the birthdays note). */
"use strict";

const CONFIG = {
  lat: 55.8126, lon: 12.3661, tz: "Europe/Copenhagen",   // Farum
  weatherEveryMs: 30 * 60 * 1000,
  eventsEveryMs: 15 * 60 * 1000,
  mealCount: 3,
  // Quote pack shown in the hero (quotes.js QUOTE_PACKS). A household picks its own on the tablet:
  // localStorage "fw_quotes" = { "pack": "<name>" }. The choice stays on the device.
  quotePack: "wisdom",
  // Google OAuth (public client ID, browser token flow, read-only calendar). Household account only.
  googleClientId: "908805586296-b8nla3dfcv0hovecsu45rqa5jf4ivkuv.apps.googleusercontent.com",
  calendarScope: "https://www.googleapis.com/auth/calendar.readonly",
  photoScope: "https://www.googleapis.com/auth/drive.readonly",
  calendarDaysAhead: 28,
  agendaDays: 3,
  // Traffic checks (hours, decimal): live 07:15-07:45 on school days, forecast for tomorrow from 20:00.
  traffic: { morningFrom: 7.25, morningUntil: 7.75, eveningFrom: 20, maxCallsPerDay: 3 },
  // Weekday school run shown in the plan card. offRe: an all-day event that cancels school that day.
  // start and leave are placeholders; the real times come from the device config (see applyFamilyConfig).
  school: { start: "08:00", leave: "07:45", bufferMin: 5, days: [1, 2, 3, 4, 5], offRe: /ferie|fridag|skolefri|lukkedag|holiday|vacation|day off/i },
  // Plan card modes: morning before morningUntilHour; "next up" while activities remain, until dayUntilHour.
  // maxActions: tiles in "Next up", the soonest first, rolling as the day goes on.
  plan: { morningUntilHour: 9, dayUntilHour: 21, maxActions: 4, graceMin: 15 },   // graceMin: a due action stays this long
  // Who drives what, by activity (first match wins). drop: someone drives them there (leave leadMin before the
  // start); pick: someone picks them up at the end. The family's own rules come first from the device config.
  transport: [
    [/fodbold|football|soccer|h[aå]ndbold|handball/i, { drop: true, pick: true, leadMin: 25 }]
  ],
  transportDefault: { drop: true, pick: true, leadMin: 15 },
  idleTopMs: 120000,      // scroll back to the top after this long without a touch
  // Tomorrow-morning reminders: an event title matching the pattern adds the item.
  // Activities where the drive matters most: the plan shows "<Activity> transport" first.
  driveRe: /fodbold|football|soccer|h[aå]ndbold|handball/i,
  reminders: [
    [/tennis/i, "Tennis bag"],
    [/fodbold|football|soccer/i, "Football clothes"],
    [/\bgym|gymnastik/i, "Gym clothes"],
    [/sv[oø]m|swim/i, "Swim bag"],
    [/h[aå]ndbold|handball/i, "Handball bag"],
    [/udflugt|\btur\b|\btrip\b/i, "Packed lunch"]
  ],
  holidayCount: 3,         // upcoming holidays shown with a counter
  birthdayShowDays: 60,   // a birthday counter appears this many days before
  birthdayCount: 2,       // at most this many counters (the nearest ones)
  // A (title, weekday, time) seen this many times in the window is a weekly activity (4 weeks: weekly=4, biweekly=2).
  weeklyMin: 3,
  // Place word overrides, tested against the event location before the postcode-town rule (device config).
  placeAliases: [],
  // Place word when the event has no location at all, by title (device config).
  titlePlaces: [],
  // A timed event whose title matches this is a "training night" -> prefer quick meals.
  trainingRe: /\b(tennis|football|fodbold|gym|gymnastik|tr[aæ]ning|sv[oø]m|h[aå]ndbold|basket|kamp|turnering|st[aæ]vne)\b/i,
  // Upcoming events that read like a competition, for the countdowns panel.
  competitionRe: /\b(cup|turnering|st[aæ]vne|kamp|competition|julecup|finale|match)\b/i
};

/* Family specifics live ON THE TABLET ONLY, never in this public code: localStorage "fw_family" =
   { "school": { "start": "HH:MM", "leave": "HH:MM" },
     "transport": [ ["<title regex>", { "drop": false, "pick": true, "leadMin": 15 }] ],
     "placeAliases": [ ["<location regex>", "<place word>"] ],
     "titlePlaces": [ ["<title regex>", "<place word>"] ] }
   Patterns are case-insensitive regex strings. Device transport rules are tried before the generic ones. */
function applyFamilyConfig() {
  let f = null;
  try { f = JSON.parse(localStorage.getItem("fw_family") || "null"); } catch (e) { f = null; }
  if (!f) return;
  const rx = (list) => (Array.isArray(list) ? list : []).map(([re, v]) => { try { return [new RegExp(re, "i"), v]; } catch (e) { return null; } }).filter(Boolean);
  if (f.school) Object.assign(CONFIG.school, { start: f.school.start || CONFIG.school.start, leave: f.school.leave || CONFIG.school.leave });
  CONFIG.transport = rx(f.transport).concat(CONFIG.transport);
  CONFIG.placeAliases = rx(f.placeAliases);
  CONFIG.titlePlaces = rx(f.titlePlaces);
}
applyFamilyConfig();

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
  const mk = (title, s, durMin, allDay, location) => ({ title, start: s, end: new Date(s.getTime() + (durMin || 60) * 60000), allDay: !!allDay, location: location || "" });
  // Generic test data (public repo: no real names, venues or schedules). Weekly series plus one-offs.
  const onWeekday = (wd, week, h, m) => { const d = new Date(now); d.setDate(d.getDate() + ((wd - d.getDay() + 7) % 7) + week * 7); d.setHours(h, m, 0, 0); return d; };
  const out = [];
  [0, 1, 2, 3].forEach((w) => {
    out.push(mk("A: Tennis ", onWeekday(1, w, 15, 0), 60));
    out.push(mk("A: Tennis", onWeekday(4, w, 15, 0), 60));
    out.push(mk("Kids GYM", onWeekday(6, w, 10, 0), 90, false, "Sports hall (1 Example Road, 1000 Townville)"));
    out.push(mk("B: Swimming", onWeekday(3, w, 17, 0), 60, false, "Example school (2 Sample Street, 2000 Villagetown)"));
  });
  out.push(mk("B: School trip", at(3, 0, 0), 0, true));
  out.push(mk("Dentist", at(5, 14, 15), 45));
  out.push(mk("Club cup", at(10, 10, 0), 0, true));
  return out.filter((e) => e.start >= startOfDay(now)).sort((a, b) => a.start - b.start);
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

function _authUrl(prompt, state, scope) {
  const p = new URLSearchParams();
  p.set("client_id", CONFIG.googleClientId);
  p.set("redirect_uri", REDIRECT_URI);
  p.set("response_type", "token");
  p.set("scope", scope || CONFIG.calendarScope);
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
    + "?singleEvents=true&orderBy=startTime&maxResults=150"
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
    return { title: normTitle(ev.summary) || "(no title)", start, end, allDay, location: ev.location || "" };
  });
}

// Interactive sign-in: a full-page redirect to Google (no popup needed).
function signInInteractive() {
  setStatus("Signing in...");
  const state = _newState();
  try { sessionStorage.setItem("fw_state", state); } catch (e) {}
  // With a photo folder set up, the one interactive sign-in also asks for read-only Drive. Silent renewal keeps
  // asking for the calendar only; include_granted_scopes carries Drive along once it has been granted.
  location.href = _authUrl("", state, photoCfg() ? CONFIG.calendarScope + " " + CONFIG.photoScope : "");
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

/* ---------------- clock (hero) ---------------- */
function tickClock() {
  const d = new Date();
  const time = pad(d.getHours()) + ":" + pad(d.getMinutes());
  const date = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  if ($("clock").textContent !== time || $("date").textContent !== date) {
    $("clock").textContent = time;
    $("date").textContent = date;
    fitHeroLine();
  }
}

// Size "22:18 Sun 22 Nov" so the one line fills the hero's width (portrait and landscape alike).
function fitHeroLine() {
  const line = $("heroLine");
  const avail = line.parentElement.clientWidth;
  if (!avail) return;
  // Two passes: text width is not perfectly linear in font size; keep 2% spare for rounding.
  let size = 100;
  for (let i = 0; i < 2; i++) {
    line.style.fontSize = size.toFixed(1) + "px";
    const w = line.getBoundingClientRect().width;
    if (!w) return;
    size = Math.max(48, Math.min(190, size * (avail * 0.98) / w));
  }
  line.style.fontSize = size.toFixed(1) + "px";
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
function wxSvg(cat, night) {
  const sun = '<circle cx="32" cy="30" r="11" fill="#f5a623"/><g stroke="#f5a623" stroke-width="3" stroke-linecap="round"><line x1="32" y1="6" x2="32" y2="13"/><line x1="32" y1="47" x2="32" y2="54"/><line x1="8" y1="30" x2="15" y2="30"/><line x1="49" y1="30" x2="56" y2="30"/><line x1="14" y1="12" x2="19" y2="17"/><line x1="45" y1="43" x2="50" y2="48"/><line x1="50" y1="12" x2="45" y2="17"/><line x1="19" y1="43" x2="14" y2="48"/></g>';
  const moon = '<path d="M38 10a20 20 0 1 0 16 30A16 16 0 0 1 38 10z" fill="#c9d3de"/>';
  const inner = {
    clear: '<svg viewBox="0 0 64 64" aria-hidden="true">' + (night ? moon : sun) + '</svg>',
    partly: '<svg viewBox="0 0 64 64" aria-hidden="true">' + (night
      ? '<path d="M30 6a14 14 0 1 0 12 22A11 11 0 0 1 30 6z" fill="#c9d3de"/>'
      : '<circle cx="23" cy="22" r="8" fill="#f5a623"/><g stroke="#f5a623" stroke-width="2.5" stroke-linecap="round"><line x1="23" y1="4" x2="23" y2="9"/><line x1="7" y1="22" x2="12" y2="22"/><line x1="11" y1="10" x2="14" y2="13"/><line x1="35" y1="10" x2="32" y2="13"/></g>') + _CLOUD + '</svg>',
    cloud: '<svg viewBox="0 0 64 64" aria-hidden="true">' + _CLOUD + '</svg>',
    fog: '<svg viewBox="0 0 64 64" aria-hidden="true">' + _CLOUD + '<g stroke="#9aa7b4" stroke-width="3" stroke-linecap="round"><line x1="20" y1="55" x2="44" y2="55"/><line x1="25" y1="61" x2="39" y2="61"/></g></svg>',
    rain: '<svg viewBox="0 0 64 64" aria-hidden="true">' + _CLOUD + '<g stroke="#2f7fe0" stroke-width="3.2" stroke-linecap="round"><line x1="26" y1="53" x2="23" y2="61"/><line x1="34" y1="53" x2="31" y2="61"/><line x1="42" y1="53" x2="39" y2="61"/></g></svg>',
    snow: '<svg viewBox="0 0 64 64" aria-hidden="true">' + _CLOUD + '<g fill="#b9cde0"><circle cx="26" cy="57" r="2.6"/><circle cx="34" cy="59" r="2.6"/><circle cx="42" cy="57" r="2.6"/></g></svg>',
    thunder: '<svg viewBox="0 0 64 64" aria-hidden="true">' + _CLOUD + '<path d="M34 50 l-9 11 h6 l-4 9 13 -13 h-6 z" fill="#f5c518"/></svg>'
  };
  return inner[cat] || inner.cloud;
}

const _ICO = {
  sunrise: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16"/><path d="M7 19a5 5 0 0 1 10 0"/><path d="M12 4v5M9.5 6.5 12 4l2.5 2.5"/><path d="M4.5 14.5l1.4 1M19.5 14.5l-1.4 1"/></g></svg>',
  sunset: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16"/><path d="M7 19a5 5 0 0 1 10 0"/><path d="M12 9V4M9.5 6.5 12 9l2.5-2.5"/><path d="M4.5 14.5l1.4 1M19.5 14.5l-1.4 1"/></g></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  cold: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.5 4.5 12 6l2.5-1.5M9.5 19.5 12 18l2.5 1.5"/></g></svg>',
  rain: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 15a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.6 1.5A3.3 3.3 0 0 1 17 15z"/><path d="M9 18l-1 2M13 18l-1 2M17 18l-1 2"/></g></svg>',
  bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="2.5"/><path d="M9 8V6a3 3 0 0 1 6 0v2M4 13h16"/></g></svg>',
  chevDown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

/* The next hours (15-minute data, ~12 h) and tomorrow morning, in plain words. */
const SNOWY = (c) => (c >= 71 && c <= 77) || c === 85 || c === 86;
function weatherSay(j, withTomorrow) {
  const cur = j.current, m = j.minutely_15, h = j.hourly, d = j.daily;
  const lc = (code) => (WMO[code] || "Cloudy").toLowerCase();
  const hm = (iso) => iso.slice(11, 16);
  const parts = [];
  if (m && m.time && m.time.length) {
    let i0 = m.time.findIndex((t) => t >= cur.time);
    if (i0 < 0) i0 = 0;
    const wet = (i) => (m.precipitation[i] || 0) >= 0.1;
    const last = m.time.length;
    const nowWet = (cur.precipitation || 0) > 0 || wet(i0);
    if (nowWet) {
      let k = i0 + 1;
      while (k < last && (wet(k) || (k + 1 < last && wet(k + 1)))) k++;
      parts.push(k < last ? "Wet now, dry from " + hm(m.time[k]) + "." : "Wet for the next hours.");
    } else {
      let k = i0;
      while (k < last && !wet(k)) k++;
      if (k >= last) {
        parts.push("Dry for the next hours.");
      } else {
        let e = k, sum = 0, snow = false;
        while (e < last && wet(e)) { sum += m.precipitation[e]; snow = snow || SNOWY(m.weather_code[e]); e++; }
        const kind = snow ? "Snow" : (sum < 0.5 ? "A few drops" : (sum < 3 ? "Light rain" : "Rain"));
        parts.push(kind + " from " + hm(m.time[k]) + (e < last ? " to " + hm(m.time[e]) : "") + ".");
      }
    }
  }
  if (withTomorrow !== false && h && h.time && d && d.time.length > 1) {
    const ti = h.time.indexOf(d.time[1] + "T08:00");
    if (ti >= 0) {
      const prob = d.precipitation_probability_max ? d.precipitation_probability_max[1] : 0;
      parts.push("Tomorrow morning " + lc(h.weather_code[ti]) + ", " + Math.round(h.temperature_2m[ti])
        + "°, high " + Math.round(d.temperature_2m_max[1]) + "°" + (prob >= 40 ? ", " + Math.round(prob) + "% rain" : "") + ".");
    }
  }
  return parts.join(" ");
}

let _weather = null;

/* The weather bar: four columns, Now | Later today (or Tonight) | Tomorrow | the day after.
   Each shows an icon, the temperature and rain as "chance % · mm" (or "Dry"). */
const WX_RANK = { clear: 0, partly: 1, cloud: 2, fog: 3, rain: 4, snow: 5, thunder: 6 };
function rainText(prob, mm) {
  const p = Math.round(prob || 0), m = Math.round((mm || 0) * 10) / 10;
  if (m < 0.1 && p < 20) return '<span class="wb-dry">Dry</span>';
  return '<b>' + p + "%</b> · " + m.toFixed(1) + " mm";
}
function hourSpan(h, fromIso, toIso) {
  const idx = [];
  h.time.forEach((t, i) => { if (t >= fromIso && t < toIso) idx.push(i); });
  if (!idx.length) return null;
  let code = h.weather_code[idx[0]], hi = -99, lo = 99, prob = 0, mm = 0;
  idx.forEach((i) => {
    if (WX_RANK[wmoCat(h.weather_code[i])] > WX_RANK[wmoCat(code)]) code = h.weather_code[i];
    hi = Math.max(hi, h.temperature_2m[i]); lo = Math.min(lo, h.temperature_2m[i]);
    prob = Math.max(prob, h.precipitation_probability ? h.precipitation_probability[i] : 0);
    mm += h.precipitation ? h.precipitation[i] : 0;
  });
  return { code, hi, lo, prob, mm };
}
function weatherBar(j) {
  const c = j.current, h = j.hourly, d = j.daily;
  const now = new Date();
  const iso = (dt) => dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate()) + "T" + pad(dt.getHours()) + ":00";
  const plus = (hrs) => { const x = new Date(now); x.setMinutes(0, 0, 0); x.setHours(x.getHours() + hrs); return x; };
  const col = (k, ico, temp, sub, rain, cls) => '<li class="wb' + (cls || "") + '"><span class="wb-k">' + k + "</span>"
    + '<span class="wb-ico">' + ico + "</span>" + '<span class="wb-t">' + temp + "</span>"
    + '<span class="wb-s">' + sub + "</span>" + '<span class="wb-r">' + rain + "</span></li>";

  // Now: the next 3 hours of rain, from the same 15-minute data as the one-liner (chance from hourly).
  const next3 = hourSpan(h, iso(plus(0)), iso(plus(3)));
  const m = j.minutely_15;
  if (next3 && m && m.time) {
    let i0 = m.time.findIndex((t) => t >= c.time); if (i0 < 0) i0 = 0;
    next3.mm = m.precipitation.slice(i0, i0 + 12).reduce((a, x) => a + (x || 0), 0);
  }
  const nowCol = col("Now", wxSvg(wmoCat(c.weather_code), c.is_day === 0), Math.round(c.temperature_2m) + "°",
    escapeHtml(WMO[c.weather_code] || "Cloudy"), next3 ? rainText(next3.prob, next3.mm) : "", " wb-now");

  // Later today: from 3 hours out until 23:00; after 18:00 it becomes Tonight (until 06:00).
  const evening = now.getHours() >= 18;
  const endLater = new Date(now); if (evening) { endLater.setDate(endLater.getDate() + 1); endLater.setHours(6, 0, 0, 0); } else { endLater.setHours(23, 0, 0, 0); }
  const later = hourSpan(h, iso(plus(evening ? 1 : 3)), iso(endLater));
  const laterCol = later
    ? col(evening ? "Tonight" : "Later today", wxSvg(wmoCat(later.code), evening),
        Math.round(evening ? later.lo : later.hi) + "°", escapeHtml(WMO[later.code] || "Cloudy"), rainText(later.prob, later.mm))
    : "";

  const dayCol = (i, label) => col(label, wxSvg(wmoCat(d.weather_code[i])),
    Math.round(d.temperature_2m_max[i]) + '°<small>' + Math.round(d.temperature_2m_min[i]) + "°</small>",
    escapeHtml(WMO[d.weather_code[i]] || "Cloudy"),
    rainText(d.precipitation_probability_max ? d.precipitation_probability_max[i] : 0, d.precipitation_sum ? d.precipitation_sum[i] : 0));
  const dayAfter = new Date(d.time[2] + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long" });
  return nowCol + laterCol + dayCol(1, "Tomorrow") + (d.time.length > 2 ? dayCol(2, dayAfter) : "");
}

async function loadWeather() {
  const url = "https://api.open-meteo.com/v1/forecast"
    + "?latitude=" + CONFIG.lat + "&longitude=" + CONFIG.lon
    + "&current=temperature_2m,apparent_temperature,weather_code,precipitation,is_day"
    + "&minutely_15=precipitation,weather_code&forecast_minutely_15=48"
    + "&hourly=weather_code,temperature_2m,precipitation_probability,precipitation"
    + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum"
    + "&forecast_days=3&timezone=" + encodeURIComponent(CONFIG.tz);
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("weather " + r.status);
    const j = await r.json();
    _weather = j;
    $("wxBar").innerHTML = weatherBar(j);
    $("wxLine").textContent = "Feels like " + Math.round(j.current.apparent_temperature) + "°. " + weatherSay(j, false);
    setStatus("Updated " + hhmm(new Date()));
    renderPlan();
  } catch (e) {
    $("wxBar").innerHTML = '<li class="muted">Weather offline</li>';
    $("wxLine").textContent = "";
    setStatus("Weather: " + (e && e.message ? String(e.message).slice(0, 70) : "error"));
  }
}

/* ---------------- quote of the day ---------------- */
function quotePack() {
  const packs = window.QUOTE_PACKS || {};
  const want = (readJSON("fw_quotes") || {}).pack || CONFIG.quotePack;
  return packs[want] || packs[CONFIG.quotePack] || null;
}
function renderQuote() {
  const pack = quotePack();
  const q = (pack && pack.quotes) || [];
  if (!q.length) return;
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const doy = Math.floor((now - start) / 86400000);
  const pick = q[doy % q.length];
  $("quote").innerHTML = '<span class="q-text' + "" + '">' + escapeHtml(pick.t) + "</span>";
  const who = /^unknown$/i.test(pick.a || "") ? "" : pick.a;
  $("qAuthor").textContent = who && pack.credit ? who + " · " + pack.credit : who;
}

function isTrainingToday(events) {
  return events.some((e) => sameDay(e.start, new Date()) && !e.allDay && CONFIG.trainingRe.test(e.title));
}

/* ---------------- dinner: all meals as photo cards, tonight's three first ---------------- */
// pick N meals that differ in BOTH protein and form (no two shrimp, no two wraps, etc.)
function pickDiverse(pool, count) {
  const picks = [], usedP = new Set(), usedF = new Set();
  for (const m of pool) {
    if (picks.length >= count) break;
    if (usedP.has(m.protein) || usedF.has(m.form)) continue;
    picks.push(m); usedP.add(m.protein); usedF.add(m.form);
  }
  if (picks.length < count) {
    for (const m of pool) {
      if (picks.length >= count) break;
      if (picks.indexOf(m) !== -1 || usedP.has(m.protein)) continue;
      picks.push(m); usedP.add(m.protein);
    }
  }
  for (const m of pool) {
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
  let rest = seededShuffle(menu, seed + 1).filter((m) => picks.indexOf(m) === -1);
  if (training) rest = rest.filter((m) => m.quick).concat(rest.filter((m) => !m.quick));

  $("dinnerHint").textContent = training ? "Training night: quick ones first" : "Tonight's three come first";

  const img = (m) => m.img ? '<img src="' + m.img + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : "";
  const card = (m, isPick) => {
    const cls = "meal" + (isPick ? " is-pick" : "") + (training && !m.quick ? " slow" : "");
    const tags = (isPick ? '<span class="tag pick">Tonight</span>' : "")
      + (m.quick ? '<span class="tag quick">Quick</span>' : "");
    return '<li class="' + cls + '"><a class="m-card" href="' + m.link + '" target="_blank" rel="noopener">'
      + '<div class="m-photo">' + img(m) + "</div>"
      + (tags ? '<div class="m-tags">' + tags + "</div>" : "")
      + '<div class="m-name">' + escapeHtml(m.name) + "</div>"
      + "</a></li>";
  };
  $("meals").innerHTML = picks.map((m) => card(m, true)).join("") + rest.map((m) => card(m, false)).join("");
}

/* ---------------- birthdays ----------------
   Names and dates live ON THE TABLET ONLY (public repo): the Fully start URL carries
   #bd=Name:DD-MM,Name:DD-MM,... ; the page copies it to localStorage "fw_bd" (the hash is lost
   after the OAuth redirect) and then cleans the address bar. Nothing personal is in this code. */
function loadBirthdays() {
  const m = location.hash.match(/(?:^#|&)bd=([^&]+)/);
  if (m) {
    try { localStorage.setItem("fw_bd", decodeURIComponent(m[1])); } catch (e) { /* ignore */ }
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
  }
  let raw = "";
  try { raw = localStorage.getItem("fw_bd") || ""; } catch (e) { /* ignore */ }
  return raw.split(",").map((p) => {
    const x = p.trim().match(/^(.+?):(\d{1,2})-(\d{1,2})$/);
    return x ? { name: x[1].trim(), day: +x[2], month: +x[3] } : null;
  }).filter(Boolean);
}

/* ---------------- upcoming holidays (Danish public holidays, computed locally, no API) ----------------
   Easter by the anonymous Gregorian algorithm; the movable feasts hang off it. Days that follow each other
   are one entry (Christmas 24-26 Dec, Easter Thu-Mon, Whitsun Sun-Mon, New Year 31 Dec-1 Jan).
   Christmas Eve, Constitution Day and New Year's Eve are not official public holidays but are kept, as
   most Danes are off or half off. Store Bededag was abolished from 2024. */
function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
function holidayGroups(year) {
  const E = easterSunday(year);
  const off = (n) => { const d = new Date(E); d.setDate(d.getDate() + n); return d; };
  const D = (m, d, y) => new Date(y || year, m - 1, d);
  return [
    { name: "New Year", da: "Nytår", from: D(12, 31, year - 1), to: D(1, 1) },
    { name: "Easter", da: "Påske", from: off(-3), to: off(1) },
    { name: "Ascension Day", da: "Kristi himmelfart", from: off(39), to: off(39) },
    { name: "Whitsun", da: "Pinse", from: off(49), to: off(50) },
    { name: "Constitution Day", da: "Grundlovsdag", from: D(6, 5), to: D(6, 5) },
    { name: "Christmas", da: "Jul", from: D(12, 24), to: D(12, 26) },
    { name: "New Year", da: "Nytår", from: D(12, 31), to: D(1, 1, year + 1) }
  ];
}
function upcomingHolidays(count) {
  const today = startOfDay(new Date());
  const seen = new Set();
  return holidayGroups(today.getFullYear()).concat(holidayGroups(today.getFullYear() + 1))
    .filter((g) => g.to >= today)
    .filter((g) => { const k = g.name + g.from.getTime(); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.from - b.from)
    .slice(0, count);
}
function renderHolidays() {
  const now = new Date();
  const fmt = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  $("holidays").innerHTML = upcomingHolidays(CONFIG.holidayCount).map((g, i) => {
    const d = daysBetween(now, g.from);
    const on = d <= 0;
    const when = sameDay(g.from, g.to) ? g.from.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
      : fmt(g.from) + " to " + fmt(g.to);
    return '<li class="hol-tile' + (i === 0 ? " next" : "") + (on ? " on" : "") + '">'
      + '<span class="hol-name">' + escapeHtml(g.name) + "</span>"
      + '<span class="hol-da">' + escapeHtml(g.da) + "</span>"
      + (on ? '<span class="hol-big">Now!</span>'
        : '<span class="hol-big">' + d + "<small>" + (d === 1 ? " day" : " days") + "</small></span>")
      + '<span class="hol-when">' + escapeHtml(when) + "</span>"
      + "</li>";
  }).join("");
}

/* ---------------- shopping list: lives in Google Keep (no API), so the wall opens the app ---------------- */
// Needs Fully > Web Content Settings > "Open Other URL Schemes" ON. Fully adds the BROWSABLE
// category, which Keep's launcher rejects; its keep.google.com link handler accepts it.
const KEEP_INTENT = "intent://keep.google.com/#Intent;scheme=https;package=com.google.android.keep;end";
const CAL_INTENT = "intent://calendar.google.com/#Intent;scheme=https;package=com.google.android.calendar;end";

/* ---------------- foldable cards (folded = heading only; remembered on this device) ---------------- */
function initFoldable(sectionId, toggleId, key) {
  const sec = $(sectionId), btn = $(toggleId);
  const set = (folded) => {
    sec.classList.toggle("folded", folded);
    btn.setAttribute("aria-expanded", folded ? "false" : "true");
    try { localStorage.setItem(key, folded ? "1" : "0"); } catch (e) { /* ignore */ }
  };
  let folded = false;
  try { folded = localStorage.getItem(key) === "1"; } catch (e) { /* ignore */ }
  set(folded);
  btn.addEventListener("click", () => set(!sec.classList.contains("folded")));
}

/* ---------------- calendar helpers ---------------- */
const normTitle = (t) => String(t || "").replace(/\s+/g, " ").trim();
const hhmm = (d) => pad(d.getHours()) + ":" + pad(d.getMinutes());

// One word for where it is: a fixed alias, else the town after the postcode, else the place name.
function placeWord(location, title) {
  const loc = String(location || "");
  for (const [re, word] of CONFIG.placeAliases) if (re.test(loc)) return word;
  const m = loc.match(/\b\d{4}\s+([A-Za-zÆØÅæøåÉé-]+)/);
  if (m) return m[1];
  if (loc.trim()) return loc.split(/[,(]/)[0].trim().split(" ")[0];
  for (const [re, word] of CONFIG.titlePlaces) if (re.test(title)) return word;
  return "";
}

// "J: Tennis" -> "J · Tennis"; first letter after the prefix capitalised.
function displayTitle(t) {
  const s = normTitle(t);
  const m = s.match(/^([A-Za-zÆØÅæøå]{1,3})\s*:\s*(.+)$/);
  if (!m) return s;
  return m[1] + " · " + m[2].charAt(0).toUpperCase() + m[2].slice(1);
}

// Who an event is for: a person class from the device birthday list order (p0, p1...),
// "both" when two listed names appear, else "other". No names live in this code.
function personClass(title) {
  const names = loadBirthdays().map((b) => b.name);
  const s = normTitle(title), low = s.toLowerCase();
  const hits = names.filter((n) => low.indexOf(n.toLowerCase()) !== -1);
  if (hits.length >= 2) return "both";
  let initial = "";
  const m = s.match(/^([A-Za-zÆØÅæøå])\s*:/);
  if (m) initial = m[1].toUpperCase();
  else if (hits.length === 1) initial = hits[0].charAt(0).toUpperCase();
  if (!initial) return "other";
  const idx = names.findIndex((n) => n.charAt(0).toUpperCase() === initial);
  return idx >= 0 ? "p" + (idx % 4) : "other";
}
function whoLabel(title) {
  const s = normTitle(title);
  const m = s.match(/^([A-Za-zÆØÅæøå]{1,3})\s*:/);
  if (m) return m[1];
  const names = loadBirthdays().map((b) => b.name);
  const hits = names.filter((n) => s.toLowerCase().indexOf(n.toLowerCase()) !== -1);
  return hits.join(" & ");
}

/* ---------------- family agenda: grouped by day ---------------- */
let _events = null;

function renderAgenda() {
  const events = _events || [];
  const now = new Date();
  const today0 = startOfDay(now);
  const up = events
    .filter((e) => (e.allDay ? startOfDay(e.start) >= today0 : e.end > now))
    .sort((a, b) => (startOfDay(a.start) - startOfDay(b.start)) || ((b.allDay ? 1 : 0) - (a.allDay ? 1 : 0)) || (a.start - b.start));

  const days = [];
  up.forEach((e) => {
    const k = startOfDay(e.start).getTime();
    if (!days.length || days[days.length - 1].k !== k) days.push({ k, date: startOfDay(e.start), items: [] });
    days[days.length - 1].items.push(e);
  });

  const box = $("agenda");
  if (!days.length) { box.innerHTML = '<p class="muted">Nothing on the calendar</p>'; return; }

  const shown = days.slice(0, CONFIG.agendaDays);
  box.innerHTML = shown.map((g) => {
    const d = daysBetween(now, g.date);
    const wd = g.date.toLocaleDateString("en-GB", { weekday: "long" });
    const head = d === 0 ? wd + " · Today" : d === 1 ? wd + " · Tomorrow"
      : d < 7 ? wd : wd + " · " + g.date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const rows = g.items.map((e) => {
      const live = !e.allDay && e.start <= now && e.end > now;
      const time = e.allDay ? "All day" : live ? "Now" : hhmm(e.start);
      const place = placeWord(e.location, e.title);
      return '<div class="ag-row ' + personClass(e.title) + '">'
        + '<span class="ag-time' + (live ? " now" : "") + '">' + time + "</span>"
        + '<span class="ag-bar" aria-hidden="true"></span>'
        + '<span class="ag-main"><span class="ag-title">' + escapeHtml(displayTitle(e.title)) + "</span>"
        + (place ? '<span class="ag-place">' + escapeHtml(place) + "</span>" : "") + "</span>"
        + "</div>";
    }).join("");
    return '<div class="ag-day"><h3 class="ag-dh">' + escapeHtml(head) + "</h3>" + rows + "</div>";
  }).join("");

}

/* ---------------- plan: dynamic by time of day ----------------
   Before 09:00            -> "This morning": school run, weather, bags for today.
   09:00 until the last    -> "Today, next up": drop-offs and pick-ups by name for the rest of today's
   activity of the day        activities, plus bags. Only while CONFIG.plan.dayUntilHour has not passed.
   After that / none left  -> "Tomorrow morning": school run (weekdays), weather, bags for tomorrow. */
const PLAN_ICO = {
  car: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 16V12l1.8-4.2A2 2 0 0 1 8.6 6.5h6.8a2 2 0 0 1 1.8 1.3L19 12v4"/><path d="M3.5 16h17v2.5h-17zM5 12h14"/><circle cx="7.5" cy="18.5" r="1.5"/><circle cx="16.5" cy="18.5" r="1.5"/></g></svg>',
  school: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-5 9 5-9 5z"/><path d="M7 12.3V17c2.8 2 7.2 2 10 0v-4.7"/></g></svg>',
  pick: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></g></svg>'
};

// "A: Tennis" -> "Ann" (initial expanded from the device birthday list), "Ann & Bea GYM" -> both names.
function personName(title) {
  const names = loadBirthdays().map((b) => b.name);
  const s = normTitle(title), low = s.toLowerCase();
  const hits = names.filter((n) => low.indexOf(n.toLowerCase()) !== -1);
  if (hits.length) return hits.join(" & ");
  const m = s.match(/^([A-Za-zÆØÅæøå])\s*:/);
  if (m) {
    const n = names.find((x) => x.charAt(0).toUpperCase() === m[1].toUpperCase());
    return n || m[1];
  }
  return "";
}
// The activity without the person: "A: Tennis" -> "Tennis", "Ann GYM" -> "GYM".
function activityName(title) {
  let s = normTitle(title).replace(/^[A-Za-zÆØÅæøå]{1,3}\s*:\s*/, "");
  loadBirthdays().forEach((b) => { s = s.replace(new RegExp(b.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), ""); });
  s = s.replace(/^\s*(&|og|and)\s*/i, "").replace(/\s*(&|og|and)\s*$/i, "").replace(/\s+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : normTitle(title);
}

function isSchoolDay(day) {
  if (CONFIG.school.days.indexOf(day.getDay()) === -1) return false;
  return !(_events || []).some((e) => e.allDay && sameDay(e.start, day) && CONFIG.school.offRe.test(e.title));
}

/* ---------------- background photo of the day (photos stored on the tablet, or a Google Drive folder) ----------------
   First choice: a library stored on the tablet itself, in the Cache API "fw-photo-lib" (one entry per photo, already
   shrunk and without location data), loaded from the PC over the debugging bridge. No network, no Drive.
   Fallback when the library is empty: localStorage "fw_photos" = { "folder": "<Drive folder id>" }, tablet only.
   Once a day the wall lists the folder's images and takes the next one in a shuffled order that only repeats
   after every photo has been shown (adding or removing photos is picked up the next day). The photo is shrunk
   once and kept in the Cache API, so Drive is read once a day. Without a config, a Drive grant or a network,
   the wall keeps yesterday's photo or its plain look. The glass is cheap on purpose: the fixed photo layer is
   blurred once by CSS and the cards are translucent; a per-card backdrop-filter halved the Tab A8 frame rate. */
let _photoDay = null;   // the day whose photo is showing; loadPhoto runs hourly and stops early once it is set
function photoCfg() { const c = readJSON("fw_photos"); return c && c.folder ? c : null; }
function seededShuffle(arr, seed) {
  const a = arr.slice();
  let x = (seed * 2654435761) >>> 0 || 1;
  const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function photoOfDay(ids, date) {
  const dayNo = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  return seededShuffle(ids, Math.floor(dayNo / ids.length) + 11)[dayNo % ids.length];
}
function showPhoto(blob) {
  let bg = $("bg");
  if (!bg) { bg = document.createElement("div"); bg.id = "bg"; bg.className = "bg-photo"; bg.setAttribute("aria-hidden", "true"); document.body.prepend(bg); }
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const old = bg.dataset.url;
    bg.style.backgroundImage = "url(" + url + ")";
    bg.dataset.url = url;
    bg.classList.add("on");
    document.body.classList.add("has-photo");
    if (old) URL.revokeObjectURL(old);
  };
  img.src = url;
}
async function shrinkPhoto(blob, maxSide) {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  return await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.82));
}
async function libraryPhoto() {
  try {
    const lib = await caches.open("fw-photo-lib");
    const keys = (await lib.keys()).map((r) => r.url).sort();
    if (!keys.length) return null;
    const hit = await lib.match(photoOfDay(keys, new Date()));
    return hit ? await hit.blob() : null;
  } catch (e) { return null; }
}
async function loadPhoto() {
  if (!window.caches) return;
  const today0 = dayKey(new Date());
  if (_photoDay === today0) return;
  const local = await libraryPhoto();
  if (local) { _photoDay = today0; showPhoto(local); return; }
  const cfg = photoCfg();
  if (!cfg) return;
  const KEY = "./__photo-of-the-day";
  let cache, hit;
  try { cache = await caches.open("fw-photo"); hit = await cache.match(KEY); } catch (e) { return; }
  const today = dayKey(new Date());
  if (_photoDay === today) return;
  if (hit && hit.headers.get("x-day") === today) { _photoDay = today; showPhoto(await hit.blob()); return; }
  if (hit) showPhoto(await hit.clone().blob());   // yesterday's photo until today's has arrived
  try {
    const token = await _ensureToken();
    const auth = { headers: { Authorization: "Bearer " + token } };
    const q = "'" + cfg.folder.replace(/[^\w-]/g, "") + "' in parents and mimeType contains 'image/' and trashed = false";
    const r = await fetch("https://www.googleapis.com/drive/v3/files?pageSize=200&orderBy=name&fields=files(id)&q=" + encodeURIComponent(q), auth);
    if (!r.ok) throw new Error("photos " + r.status);
    const ids = ((await r.json()).files || []).map((f) => f.id);
    if (!ids.length) return;
    const id = photoOfDay(ids, new Date());
    const f = await fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(id) + "?alt=media", auth);
    if (!f.ok) throw new Error("photo " + f.status);
    const small = await shrinkPhoto(await f.blob(), 1280);
    await cache.put(KEY, new Response(small, { headers: { "Content-Type": "image/jpeg", "x-day": today } }));
    _photoDay = today;
    showPhoto(small);
  } catch (e) { /* keep what is showing; tomorrow tries again */ }
}

/* ---------------- traffic for the morning drive (Google Routes API, Maps Demo Key) ----------------
   Config lives ON THE TABLET ONLY, never in this public code: localStorage "fw_route" =
   { "key": "<Maps key>", "home": [lat, lon],
     "stops": [ { "name": "School", "at": [lat, lon] }, { "name": "Ballerup", "at": [lat, lon] } ] }
   Budget (decided 2026-11-23): two calls a day on school days, one route request covering every leg.
     - evening, from CONFIG.traffic.eveningFrom: forecast for tomorrow's leave time (departureTime set)
     - morning, CONFIG.traffic.morningFrom to morningUntil: live traffic (departure now)
   Results are cached in localStorage "fw_traffic", so reloads never call again; a hard cap of
   CONFIG.traffic.maxCallsPerDay ("fw_traffic_calls") guards against bugs. The demo key pauses for the
   day when its (unpublished) daily cap is reached, with no charge. */
let _traffic = null;     // { day, kind: "live"|"forecast", at, legs: [{ name, min, delay }], delay, error? }
function readJSON(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
function dayKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function routeCfg() { return readJSON("fw_route"); }

async function loadTraffic() {
  const cfg = routeCfg();
  _traffic = readJSON("fw_traffic");
  if (!cfg || !cfg.key || !cfg.home || !cfg.stops || !cfg.stops.length) { renderPlan(); return; }
  const now = new Date();
  const hr = now.getHours() + now.getMinutes() / 60;
  const today = startOfDay(now);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  let want = null;
  if (hr >= CONFIG.traffic.morningFrom && hr < CONFIG.traffic.morningUntil && isSchoolDay(today)) want = { day: today, kind: "live" };
  else if (hr >= CONFIG.traffic.eveningFrom && isSchoolDay(tomorrow)) want = { day: tomorrow, kind: "forecast" };
  if (!want || (_traffic && !_traffic.error && _traffic.day === dayKey(want.day) && _traffic.kind === want.kind)) { renderPlan(); return; }

  const count = readJSON("fw_traffic_calls") || {};
  const dk = dayKey(now);
  const used = count.day === dk ? count.n : 0;
  if (used >= CONFIG.traffic.maxCallsPerDay) { renderPlan(); return; }
  writeJSON("fw_traffic_calls", { day: dk, n: used + 1 });

  const [lh, lm] = CONFIG.school.leave.split(":").map(Number);
  const depart = new Date(want.day); depart.setHours(lh, lm, 0, 0);
  const pt = (p) => ({ location: { latLng: { latitude: p[0], longitude: p[1] } } });
  const stops = cfg.stops.map((s) => s.at);
  const body = {
    origin: pt(cfg.home), destination: pt(stops[stops.length - 1]), intermediates: stops.slice(0, -1).map(pt),
    travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE"
  };
  if (want.kind === "forecast") body.departureTime = depart.toISOString();
  try {
    const r = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": cfg.key, "X-Goog-FieldMask": "routes.legs.duration,routes.legs.staticDuration" },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error("traffic " + r.status);
    const route = (await r.json()).routes[0];
    const sec = (s) => parseInt(String(s || "0"), 10) || 0;
    const legs = route.legs.map((l, i) => ({
      name: (cfg.stops[i] && cfg.stops[i].name) || "Stop " + (i + 1),
      min: Math.round(sec(l.duration) / 60),
      delay: Math.max(0, Math.round((sec(l.duration) - sec(l.staticDuration)) / 60))
    }));
    _traffic = { day: dayKey(want.day), kind: want.kind, at: Date.now(), legs, delay: legs.reduce((a, l) => a + l.delay, 0) };
    writeJSON("fw_traffic", _traffic);
  } catch (e) {
    _traffic = { day: dayKey(want.day), kind: want.kind, at: Date.now(), error: String((e && e.message) || e) };
  }
  renderPlan();
}

function trafficFor(day) {
  return _traffic && !_traffic.error && _traffic.day === dayKey(day) && _traffic.legs ? _traffic : null;
}
function trafficLine(day) {
  if (!routeCfg()) return "Traffic not connected yet";
  const t = trafficFor(day);
  if (!t) {
    if (_traffic && _traffic.error && _traffic.day === dayKey(day)) return "Traffic unavailable right now";
    const evening = sameDay(day, new Date()) ? "" : " (forecast after " + pad(CONFIG.traffic.eveningFrom) + ":00)";
    return "Live traffic from " + hhmmOf(CONFIG.traffic.morningFrom) + evening;
  }
  const legs = t.legs.map((l) => l.name + " " + l.min + " min").join(", then ");
  const how = t.delay >= 3 ? t.delay + " min slower than usual" : "normal traffic";
  return (t.kind === "live" ? "Traffic now (" + hhmm(new Date(t.at)) + "): " : "Traffic forecast for " + CONFIG.school.leave + ": ")
    + legs + ". " + how.charAt(0).toUpperCase() + how.slice(1) + ".";
}
function hhmmOf(hours) { const h = Math.floor(hours), m = Math.round((hours - h) * 60); return pad(h) + ":" + pad(m); }
// Leave time: school start minus the drive to the first stop (school) and a small buffer, else the fixed time.
function leaveTime(day) {
  const t = trafficFor(day);
  if (t && t.legs.length) {
    const [sh, sm] = CONFIG.school.start.split(":").map(Number);
    const d = new Date(day); d.setHours(sh, sm - CONFIG.school.bufferMin - t.legs[0].min, 0, 0);
    return { time: hhmm(d), smart: true };
  }
  return { time: CONFIG.school.leave, smart: false };
}

/* ---------------- plan tiles: 4 across ---------------- */
function tile(ico, cls, main, sub) { return { ico, cls, main, sub }; }

function morningItems(day) {
  const items = [];
  const school = isSchoolDay(day);
  if (school) {
    const lv = leaveTime(day);
    items.push(tile(PLAN_ICO.car, "go", "Leave <b>" + lv.time + "</b>", "School " + CONFIG.school.start + (lv.smart ? ", with traffic" : "")));
  }
  const w = _weather;
  if (w && w.hourly && w.daily) {
    const di = w.daily.time.indexOf(day.getFullYear() + "-" + pad(day.getMonth() + 1) + "-" + pad(day.getDate()));
    const ti = di >= 0 ? w.hourly.time.indexOf(w.daily.time[di] + "T08:00") : -1;
    if (ti >= 0) {
      const t = Math.round(w.hourly.temperature_2m[ti]);
      if (t <= 0) items.push(tile(_ICO.cold, "wxi", "Freezing, " + t + "°", "Hats and gloves"));
      else if (t <= 4) items.push(tile(_ICO.cold, "wxi", "Cold, " + t + "°", "Dress warmly"));
      const prob = w.hourly.precipitation_probability ? w.hourly.precipitation_probability[ti] : 0;
      if (prob >= 50) items.push(tile(_ICO.rain, "wxi", "Rain likely", "Bring rain gear"));
    }
  }
  activityItems((_events || []).filter((e) => sameDay(e.start, day)), items);
  return { items, school };
}

// One tile per activity: transport first for driving activities (football), else the bag.
function activityItems(events, items) {
  const seen = new Set();
  events.slice().sort((a, b) => a.start - b.start).forEach((e) => {
    const who = personName(e.title);
    const when = e.allDay ? "all day" : hhmm(e.start);
    const place = placeWord(e.location, e.title);
    if (CONFIG.driveRe.test(e.title)) {
      const key = "drive|" + who + "|" + when;
      if (seen.has(key)) return;
      seen.add(key);
      const bag = CONFIG.reminders.find(([re]) => re.test(e.title));
      items.push(tile(PLAN_ICO.car, "go", escapeHtml(activityName(e.title)) + " transport",
        escapeHtml([who, place].filter(Boolean).join(", ")) + " <b>" + when + "</b>" + (bag ? escapeHtml(", " + bag[1].toLowerCase()) : "")));
      return;
    }
    for (const [re, what] of CONFIG.reminders) {
      if (!re.test(e.title)) continue;
      const key = what + "|" + who;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(tile(_ICO.bag, "", escapeHtml(what), escapeHtml(who ? who + ", " : "") + "<b>" + when + "</b>"));
    }
  });
}

function renderPlan() {
  const now = new Date();
  const h = now.getHours();
  let title, sub, items = [], showTraffic = false, planDay = null;

  const leftToday = (_events || [])
    // An activity counts until graceMin after its end, so a late pick-up stays on the card.
    .filter((e) => !e.allDay && sameDay(e.start, now) && e.end.getTime() + CONFIG.plan.graceMin * 60000 > now.getTime())
    .sort((a, b) => a.start - b.start);

  if (h < CONFIG.plan.morningUntilHour) {
    const m = morningItems(startOfDay(now));
    title = "This morning";
    sub = now.toLocaleDateString("en-GB", { weekday: "long" }) + (m.school ? ". School from " + CONFIG.school.start : ". No school");
    items = m.items; showTraffic = m.school; planDay = startOfDay(now);
  } else if (leftToday.length && h < CONFIG.plan.dayUntilHour) {
    title = h < 12 ? "Today" : "This afternoon";
    sub = "Next up";
    // Real actions only (the girls have left with their bags): drives and pick-ups per the transport rules,
    // each with one line of what it needs, sorted by when it is due; done ones roll off, max maxActions.
    const actions = [];
    leftToday.forEach((e) => {
      const rule = (CONFIG.transport.find(([re]) => re.test(e.title)) || [null, CONFIG.transportDefault])[1];
      const who = personName(e.title) || "them";
      const act = activityName(e.title);
      const place = placeWord(e.location, e.title);
      const bag = CONFIG.reminders.find(([re]) => re.test(e.title));
      if (rule.drop && e.start > now) {
        const leave = new Date(e.start.getTime() - (rule.leadMin || CONFIG.transportDefault.leadMin) * 60000);
        actions.push({ at: leave, t: tile(PLAN_ICO.car, "go", "Drive " + escapeHtml(who) + " <b>" + hhmm(leave) + "</b>",
          escapeHtml(act + (place ? " in " + place : "") + ", starts " + hhmm(e.start) + (bag ? ". Bring " + bag[1].toLowerCase() : "")) ) });
      }
      if (rule.pick) {
        actions.push({ at: e.end, t: tile(PLAN_ICO.pick, "go", "Pick up " + escapeHtml(who) + " <b>" + hhmm(e.end) + "</b>",
          escapeHtml(act + (place ? ", " + place : "") + (rule.drop ? "" : ". " + who + " goes there alone"))) });
      }
    });
    actions.filter((a) => a.at.getTime() >= now.getTime() - CONFIG.plan.graceMin * 60000)
      .sort((a, b) => a.at - b.at).slice(0, CONFIG.plan.maxActions).forEach((a) => items.push(a.t));
  } else {
    const day = startOfDay(now); day.setDate(day.getDate() + 1);
    const m = morningItems(day);
    title = "Tomorrow morning";
    sub = day.toLocaleDateString("en-GB", { weekday: "long" }) + (m.school ? ". School from " + CONFIG.school.start : ". No school");
    items = m.items; showTraffic = m.school; planDay = day;
  }

  $("planH").textContent = title;
  $("planSub").textContent = sub;
  const tr = $("planTraffic");
  tr.hidden = !showTraffic;
  if (showTraffic) tr.textContent = trafficLine(planDay);
  $("planList").innerHTML = items.length
    ? items.map((i) => '<li class="tile ' + i.cls + '">' + i.ico
      + '<span class="t-main">' + i.main + "</span>"
      + (i.sub ? '<span class="t-sub">' + i.sub + "</span>" : "") + "</li>").join("")
    : '<li class="muted">Nothing special. An easy start.</li>';
}

/* ---------------- lunch boxes (madpakker): same card as dinner, tomorrow's three first ---------------- */
function renderLunch() {
  const list = window.FAMILY_LUNCH || [];
  const ul = $("lunches");
  ul.classList.toggle("empty", !list.length);
  if (!list.length) { ul.innerHTML = '<li class="muted">Lunch ideas coming soon</li>'; return; }
  const now = new Date();
  const forDay = startOfDay(now);
  if (now.getHours() >= CONFIG.plan.morningUntilHour) forDay.setDate(forDay.getDate() + 1);
  const seed = forDay.getFullYear() * 10000 + (forDay.getMonth() + 1) * 100 + forDay.getDate() + 7;
  const order = seededShuffle(list, seed);
  const picks = pickDiverse(order, 3);
  const rest = order.filter((m) => picks.indexOf(m) === -1);
  $("lunchHint").textContent = (now.getHours() >= CONFIG.plan.morningUntilHour ? "Tomorrow's" : "Today's") + " three come first";
  const label = now.getHours() >= CONFIG.plan.morningUntilHour ? "Tomorrow" : "Today";
  const img = (m) => m.img ? '<img src="' + m.img + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : "";
  const card = (m, isPick) => '<li class="meal' + (isPick ? " is-pick" : "") + '"><a class="m-card" href="' + m.link + '" target="_blank" rel="noopener">'
    + '<div class="m-photo">' + img(m) + "</div>"
    + '<div class="m-tags">' + (isPick ? '<span class="tag pick">' + label + "</span>" : "") + (m.quick ? '<span class="tag quick">Quick</span>' : "") + "</div>"
    + '<div class="m-name">' + escapeHtml(m.name)
    + (isPick ? '<span class="m-sub">' + escapeHtml([m.fruit, m.treat].filter(Boolean).join(" + ")) + "</span>" : "") + "</div>"
    + "</a></li>";
  ul.innerHTML = picks.map((m) => card(m, true)).join("") + rest.map((m) => card(m, false)).join("");
}

/* ---------------- plumbing ---------------- */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function refreshEvents() {
  try {
    const events = await getEvents();
    _events = events;
    renderAgenda();
    renderPlan();
    renderDinner(events);
    $("signin").hidden = true;
    $("calLink").hidden = false;
  } catch (e) {
    // Live path not ready / session dropped -> offer a sign-in and keep the rest alive.
    $("agenda").innerHTML = '<p class="muted">Calendar is signed out</p>';
    $("signin").hidden = USE_MOCK;
    $("calLink").hidden = true;
    renderPlan();
    renderDinner([]);
  }
}

/* ---------------- scroll: depth in the hero, back to the top when idle ---------------- */
function initScroll() {
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce) {
    // Signature move: the clock plane drifts and fades slower than the quote plane as the page scrolls.
    const clock = $("heroClock"), quote = $("heroQuote");
    let ticking = false;
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = Math.max(0, Math.min(window.scrollY, 520));
        clock.style.transform = "translate3d(0," + (y * 0.42).toFixed(1) + "px,0)";
        clock.style.opacity = String(Math.max(0, 1 - y / 360));
        quote.style.transform = "translate3d(0," + (y * 0.16).toFixed(1) + "px,0)";
        ticking = false;
      });
    }, { passive: true });
  }
  let idle;
  const arm = () => {
    clearTimeout(idle);
    idle = setTimeout(() => window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }), CONFIG.idleTopMs);
  };
  ["touchstart", "scroll", "click", "keydown"].forEach((ev) => window.addEventListener(ev, arm, { passive: true }));
  arm();
}

function init() {
  const signinBtn = $("signin");
  if (signinBtn) signinBtn.addEventListener("click", signInInteractive);
  document.querySelectorAll("[data-keep]").forEach((a) => { a.href = KEEP_INTENT; });
  $("calLink").href = CAL_INTENT;
  initFoldable("plan", "planToggle", "fw_plan_folded");
  initFoldable("wxCard", "wxToggle", "fw_wx_folded");
  initFoldable("agendaCard", "agToggle", "fw_agenda_folded");
  initFoldable("shop", "shopToggle", "fw_shop_folded");
  initFoldable("holCard", "holToggle", "fw_hol_folded");
  initFoldable("dinner", "dinnerToggle", "fw_dinner_folded");
  initFoldable("lunch", "lunchToggle", "fw_lunch_folded");
  window.addEventListener("resize", fitHeroLine);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitHeroLine);
  initScroll();
  loadTraffic();
  setInterval(loadTraffic, 10 * 60 * 1000);

  tickClock();
  setInterval(tickClock, 1000);

  renderQuote();
  renderHolidays();
  renderPlan();
  renderLunch();
  setInterval(renderPlan, 5 * 60 * 1000);   // the plan follows the clock (morning / day / evening)
  loadWeather();
  setInterval(loadWeather, CONFIG.weatherEveryMs);

  refreshEvents();
  setInterval(refreshEvents, CONFIG.eventsEveryMs);
  loadPhoto();
  setInterval(loadPhoto, 60 * 60 * 1000);   // retries after a failed start; a no-op once today's photo shows

  scheduleMidnight();
}

function scheduleMidnight() {
  const now = new Date();
  const next = new Date(now); next.setHours(24, 0, 30, 0);
  setTimeout(() => { renderQuote(); renderHolidays(); renderLunch(); loadWeather(); refreshEvents(); loadPhoto(); scheduleMidnight(); }, next - now);
}

document.addEventListener("DOMContentLoaded", init);
