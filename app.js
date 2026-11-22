"use strict";

/* =========================================================
   nav. — Inclusive Smart Campus Companion (CS213)
   Scenarios:
     1. Omar   – find and book a study space, then route there
     2. Teya   – class moved → notification → route to new room
     3. Ahmed  – step-free routing that avoids stairs and broken lifts
   ========================================================= */

const PX_TO_M = 0.035;        // floor plan is 2000px ≈ 70 m wide
const WALK_M_PER_MIN = 72;    // ~1.2 m/s walking speed
const NS = "http://www.w3.org/2000/svg";

let graph;        // data/block10.json
let neighbours;   // adjacency list built from the edges
let nodeById;     // quick lookup: id → node

/* ---------- Saved settings (localStorage, safely) ---------- */
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem("nav:" + key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem("nav:" + key, JSON.stringify(value)); } catch {}
  },
};

/* ---------- App state ---------- */
const state = {
  view: "home",
  params: {},
  stepFree: store.get("stepFree", false),
  outages: new Set(store.get("outages", [])),
  start: store.get("start", "entrance"),
  dest: null,
  mapMode: "browse",      // browse | preview | navigate
  navStep: 0,
  viewBox: null,
  bookings: store.get("bookings", []),
  studyFilter: null,
  alertsUnread: true,
};

/* ---------- Demo data ---------- */
const SPACES = [
  { id: "student-lounge", name: "Student Lounge", tags: ["Group", "Power", "Accessible"], seats: 24, free: 6 },
  { id: "ff103", name: "Quiet room FF103", tags: ["Quiet", "Accessible"], seats: 16, free: 12 },
  { id: "ff105", name: "Project room FF105", tags: ["Group", "Power"], seats: 8, free: 1 },
];

const ROOM_CHANGES = [
  { course: "CS213 · HCI", time: "10:30", to: "ff104", was: "FF101" },
  { course: "Math lab", time: "13:00", to: "ff105", was: "FF103" },
];

const SEARCH_WORDS = {
  room: "room class lecture",
  lift: "lift elevator accessible step-free",
  stairs: "stairs steps",
  exit: "exit emergency fire",
};
const EXTRA_WORDS = {
  "men-n": "toilet bathroom wc restroom", "ladies-n": "toilet bathroom wc restroom",
  "men-s": "toilet bathroom wc restroom", "ladies-s": "toilet bathroom wc restroom",
  "student-lounge": "study seat quiet group", "ff103": "study quiet", "ff105": "study project",
  "mech-lab": "lab engineering", "elec-lab": "lab electrical", "pdi-hall": "hall event",
  "mass-office": "office help admin", "pdi-admin": "office help admin",
};

/* ---------- Icons (Tabler outline style) ---------- */
const ICON = {
  home: '<path d="M5 12l-2 0l9 -9l9 9l-2 0"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7"/><path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6"/>',
  map: '<path d="M3 7l6 -3l6 3l6 -3v13l-6 3l-6 -3l-6 3v-13"/><path d="M9 4v13"/><path d="M15 7v13"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  book: '<path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-11a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1"/><path d="M9 4v16"/><path d="M13 8h2"/><path d="M13 12h2"/>',
  bell: '<path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6"/><path d="M9 17v1a3 3 0 0 0 6 0v-1"/>',
  search: '<circle cx="10" cy="10" r="7"/><path d="M21 21l-6 -6"/>',
  pin: '<circle cx="12" cy="11" r="3"/><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0z"/>',
  alert: '<path d="M12 9v4"/><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z"/><path d="M12 16h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01"/><path d="M11 12h1v4h1"/>',
  chevron: '<path d="M9 6l6 6l-6 6"/>',
  back: '<path d="M15 6l-6 6l6 6"/>',
  x: '<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>',
  right: '<path d="M6 18v-6a3 3 0 0 1 3 -3h10"/><path d="M15 5l4 4l-4 4"/>',
  left: '<path d="M18 18v-6a3 3 0 0 0 -3 -3h-10"/><path d="M9 13l-4 -4l4 -4"/>',
  straight: '<path d="M12 5l0 14"/><path d="M18 11l-6 -6"/><path d="M6 11l6 -6"/>',
  lift: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M10 10l2 -2l2 2"/><path d="M10 14l2 2l2 -2"/>',
  stairs: '<path d="M22 5h-5v5h-5v5h-5v5h-5"/>',
  arrive: '<path d="M5 12l5 5l10 -10"/>',
  door: '<path d="M14 12v.01"/><path d="M3 21h18"/><path d="M6 21v-16a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v16"/>',
  toilet: '<circle cx="8" cy="5" r="2"/><circle cx="16" cy="5" r="2"/><path d="M6 10h4v11"/><path d="M14 10h4l-1 6h-2z"/>',
  access: '<circle cx="12" cy="4.5" r="1.5"/><path d="M5 8l7 1.5l7 -1.5"/><path d="M12 9.5v4.5l-3 6"/><path d="M12 14l3 6"/>',
  exit: '<path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2"/><path d="M9 12h12l-3 -3"/><path d="M18 15l3 -3"/>',
};
const icon = (name) =>
  `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

/* =========================================================
   1. GRAPH + ROUTING
   ========================================================= */

async function loadMap() {
  const response = await fetch("data/block10.json");
  graph = await response.json();
  nodeById = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));
  neighbours = buildNeighbours();
  render();
  scheduleNotification();
}

// Turn the flat edge list into "from each node, where can I go and how far?"
function buildNeighbours() {
  const nb = {};
  for (const node of graph.nodes) nb[node.id] = [];

  for (const edge of graph.edges) {
    const a = nodeById[edge.from];
    const b = nodeById[edge.to];
    // Edges to the floor below have a fixed cost; everything else is real distance
    const d = edge.distance ?? Math.hypot(a.x - b.x, a.y - b.y);
    nb[edge.from].push({ to: edge.to, distance: d, stepFree: edge.stepFree });
    nb[edge.to].push({ to: edge.from, distance: d, stepFree: edge.stepFree });
  }
  return nb;
}

// Dijkstra's shortest path. Skips stairs in step-free mode and
// always skips lifts that are out of service.
function findRoute(startId, endId, stepFreeOnly) {
  const dist = {};
  const prev = {};
  const visited = new Set();

  for (const node of graph.nodes) dist[node.id] = Infinity;
  dist[startId] = 0;

  while (true) {
    let current = null;
    for (const node of graph.nodes) {
      if (visited.has(node.id)) continue;
      if (current === null || dist[node.id] < dist[current]) current = node.id;
    }

    if (current === null || dist[current] === Infinity || current === endId) break;
    visited.add(current);

    for (const n of neighbours[current]) {
      if (stepFreeOnly && !n.stepFree) continue;
      if (state.outages.has(n.to)) continue;
      const newDist = dist[current] + n.distance;
      if (newDist < dist[n.to]) {
        dist[n.to] = newDist;
        prev[n.to] = current;
      }
    }
  }

  if (dist[endId] === Infinity) return [];

  const path = [];
  let step = endId;
  while (step !== undefined) {
    path.push(step);
    step = prev[step];
  }
  return path.reverse();
}

// Everything the screens need to know about one route
function planRoute(startId, destId) {
  if (!destId || startId === destId) return null;
  const path = findRoute(startId, destId, state.stepFree);
  if (path.length === 0) return null;

  const nodes = path.map((id) => nodeById[id]);
  const onMap = nodes.filter((n) => !n.offMap);
  let px = 0;
  for (let i = 1; i < onMap.length; i++) {
    px += Math.hypot(onMap[i].x - onMap[i - 1].x, onMap[i].y - onMap[i - 1].y);
  }
  const metres = Math.max(1, Math.round(px * PX_TO_M));
  return {
    path,
    onMap,
    metres,
    minutes: Math.max(1, Math.round(metres / WALK_M_PER_MIN)),
    usesStairs: nodes.some((n) => n.type === "stairs"),
    lift: nodes.find((n) => n.type === "lift") || null,
    floorChange: nodes[0].offMap === true,
  };
}

const metresBetween = (a, b) => Math.max(1, Math.round(Math.hypot(a.x - b.x, a.y - b.y) * PX_TO_M));

// Signed turn angle at b, in degrees. Positive = right turn (SVG y points down).
function turnAngle(a, b, c) {
  const x1 = b.x - a.x, y1 = b.y - a.y;
  const x2 = c.x - b.x, y2 = c.y - b.y;
  return (Math.atan2(x1 * y2 - y1 * x2, x1 * x2 + y1 * y2) * 180) / Math.PI;
}

// Turn the route into turn-by-turn steps
function buildSteps(route, destLabel) {
  const pts = route.onMap;

  // Keep only the points where the route actually changes direction
  const v = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    if (Math.abs(turnAngle(v[v.length - 1], pts[i], pts[i + 1])) > 25) v.push(pts[i]);
  }
  if (pts.length > 1) v.push(pts[pts.length - 1]);

  const steps = [];
  const first = nodeById[route.path[0]];

  if (route.floorChange) {
    const via = pts[0];
    steps.push({
      kind: via.type === "lift" ? "lift" : "stairs",
      title: via.type === "lift" ? `Take the lift to Level 1` : `Take the stairs to Level 1`,
      sub: `${via.label} · Block 10`,
      at: via,
      metres: 0,
    });
  }

  for (let i = 0; i < v.length - 1; i++) {
    const len = metresBetween(v[i], v[i + 1]);
    const leg = [v[i], v[i + 1]];
    if (i === 0) {
      steps.push({
        kind: "straight",
        title: route.floorChange ? "Walk ahead" : `Leave ${first.label}`,
        sub: `Walk ${len} m`,
        leg, metres: len,
      });
      continue;
    }
    const dir = turnAngle(v[i - 1], v[i], v[i + 1]) > 0 ? "right" : "left";
    const isLast = i === v.length - 2;
    if (isLast && len <= 4) {
      steps.push({ kind: dir, title: `${destLabel} is on your ${dir}`, sub: "You've arrived", leg, metres: len, final: true });
    } else {
      steps.push({ kind: dir, title: `Turn ${dir}`, sub: `Walk ${len} m`, leg, metres: len });
    }
  }

  if (!steps[steps.length - 1].final) {
    steps.push({ kind: "arrive", title: `Arrive at ${destLabel}`, sub: "Your destination is ahead", at: pts[pts.length - 1], metres: 0, final: true });
  }
  return steps;
}

const label = (id) => nodeById[id]?.label || id;

/* =========================================================
   2. VIEWS
   ========================================================= */

const TAB_OF = {
  home: "home", search: "home",
  map: "map", arrived: "map",
  services: "services", lifts: "services",
  study: "study", space: "study", reserve: "study", reserved: "study",
  alerts: "alerts",
};
const TABS = [
  ["home", "Home", "home"],
  ["map", "Map", "map"],
  ["services", "Services", "grid"],
  ["study", "Study", "book"],
  ["alerts", "Alerts", "bell"],
];

const VIEWS = {
  home: homeView,
  search: searchView,
  map: mapView,
  arrived: arrivedView,
  study: studyView,
  space: spaceView,
  reserve: reserveView,
  reserved: reservedView,
  alerts: alertsView,
  services: servicesView,
  lifts: liftsView,
};

/* ---- Home ---- */
function homeView() {
  const c = ROOM_CHANGES[0];
  const r = planRoute(state.start, c.to);
  return `
    <h1 class="hero">Welcome! Where to <b>today</b>?</h1>
    <button class="ticket" data-action="route" data-id="${c.to}" aria-label="Route to your next class in ${label(c.to)}">
      <span class="row-item">
        <span class="bar">
          <span class="small">Your next class · ${c.course}</span>
          <span class="title">${label(c.to)}</span>
        </span>
        <span class="round-btn">${icon("chevron")}</span>
        <span class="meta muted">${c.time} · Block 10, Level 1${r ? ` · ${r.minutes} min walk` : ""}</span>
      </span>
      <span class="tag">Moved from ${c.was}</span>
    </button>

    <div class="tiles">
      <button class="tile" data-action="search"><span class="icon-badge">${icon("pin")}</span>Find a room</button>
      <button class="tile" data-action="go" data-id="lifts"><span class="icon-badge">${icon("alert")}</span>Lift status</button>
      <button class="tile" data-action="go" data-id="study"><span class="icon-badge">${icon("book")}</span>Study spots</button>
      <button class="tile" data-action="soon" data-id="Prayer rooms aren't mapped on this floor yet."><span class="icon-badge">${icon("info")}</span>Prayer rooms</button>
    </div>`;
}

/* ---- Search ---- */
function places() {
  return graph.nodes
    .filter((n) => n.label && !n.offMap && n.type !== "corridor")
    .sort((a, b) => a.label.localeCompare(b.label));
}
function typeName(n) {
  return { room: "Room", lift: "Lift", stairs: "Stairs", exit: "Fire exit" }[n.type] || "Place";
}
function typeIcon(n) {
  if (/men|ladies/i.test(n.label)) return "toilet";
  return { lift: "lift", stairs: "stairs", exit: "exit" }[n.type] || "door";
}
function resultsHtml(q) {
  q = q.trim().toLowerCase();
  const list = places().filter((n) => {
    if (!q) return true;
    const words = `${n.label} ${SEARCH_WORDS[n.type] || ""} ${EXTRA_WORDS[n.id] || ""}`.toLowerCase();
    return q.split(/\s+/).every((w) => words.includes(w));
  });
  if (list.length === 0) return `<li class="empty muted">No places match “${q}”.</li>`;
  return list.map((n) => `
    <li><button class="result" data-action="route" data-id="${n.id}">
      <span class="icon-badge">${icon(typeIcon(n))}</span>
      <span><strong>${n.label}</strong><span class="muted">${typeName(n)} · Block 10, Level 1</span></span>
      ${icon("chevron")}
    </button></li>`).join("");
}
function searchView() {
  const quick = [["Toilets", "toilet"], ["Lifts", "lift"], ["Study", "study"], ["Labs", "lab"]];
  return `
    <div class="search-head">
      <button class="icon-btn" data-action="go" data-id="home" aria-label="Back">${icon("back")}</button>
      <label class="search-field">${icon("search")}
        <input id="q" type="search" placeholder="I need to…" autocomplete="off" aria-label="Search rooms and places" value="${state.params.q || ""}">
      </label>
    </div>
    <div class="chips scroll" role="group" aria-label="Quick searches">
      ${quick.map(([t, q]) => `<button class="chip" data-action="quick" data-id="${q}">${t}</button>`).join("")}
    </div>
    <ul class="results card" id="results">${resultsHtml(state.params.q || "")}</ul>`;
}

/* ---- Map: browse / preview / navigate ---- */
function startPicker() {
  const opts = [nodeById.entrance, ...places()]
    .filter((n) => n.id !== state.dest)
    .map((n) => `<option value="${n.id}" ${n.id === state.start ? "selected" : ""}>${n.label}</option>`)
    .join("");
  return `<label class="from"><span>I'm here</span><select id="startSel">${opts}</select></label>`;
}

// Route type sits in the route sheet, next to "I'm here" and Start,
// so people choose step-free while they set up the route (usability fix 1).
function routeType() {
  return `
    <div class="route-type" role="radiogroup" aria-label="Route type">
      <button class="seg" role="radio" aria-checked="${state.stepFree}" data-action="set-mode" data-id="stepfree">
        ${icon("access")}<span><strong>Step-free</strong><small>No stairs, lifts only</small></span>
      </button>
      <button class="seg" role="radio" aria-checked="${!state.stepFree}" data-action="set-mode" data-id="fastest">
        ${icon("stairs")}<span><strong>Fastest</strong><small>May use stairs</small></span>
      </button>
    </div>`;
}

function outageBanner(route) {
  if (state.outages.size === 0) return "";
  const names = [...state.outages].map(label).join(" and ");
  const msg = route && route.lift
    ? `${names} is out of service. Rerouted via the ${route.lift.label.toLowerCase()}.`
    : `${names} is out of service. Routes avoid it.`;
  return `<div class="banner warn">${icon("alert")}<span>${msg}</span></div>`;
}

function mapView() {
  const mode = state.mapMode;
  let top = "";
  let sheet = "";

  if (mode === "browse" || !state.dest) {
    top = `<button class="search-box" data-action="search">${icon("search")}<span>Search rooms and places</span></button>`;
    sheet = `
      <div class="sheet">
        <div class="grabber"></div>
        <h2 class="sheet-title">Where to?</h2>
        <p class="muted" style="margin:0">Tap any room on the map, or search.</p>
        ${startPicker()}
        ${routeType()}
      </div>`;
  } else {
    const route = planRoute(state.start, state.dest);

    if (mode === "preview" || !route) {
      top = `
        <div class="search-box filled">${icon("search")}<span>${label(state.dest)}</span>
          <button class="clear" data-action="clear-dest" aria-label="Clear destination">${icon("x")}</button>
        </div>`;
      let meta;
      if (state.start === state.dest) meta = "You're already here.";
      else if (!route) meta = state.stepFree
        ? "No step-free route from here. Try another start point."
        : "No route found from here.";
      else meta = `${route.metres} m · about ${route.minutes} min · ${route.usesStairs ? "uses stairs" : "step-free"}`;
      sheet = `
        <div class="sheet">
          <div class="grabber"></div>
          ${state.stepFree ? outageBanner(route) : ""}
          <h2 class="sheet-title">${label(state.dest)}</h2>
          ${startPicker()}
          ${routeType()}
          <p class="meta muted">${meta}</p>
          <button class="btn btn-primary" data-action="start-nav" ${route ? "" : "disabled"}>Start</button>
        </div>`;
    } else {
      const steps = buildSteps(route, label(state.dest));
      state.navStep = Math.min(state.navStep, steps.length - 1);
      const s = steps[state.navStep];
      const left = steps.slice(state.navStep).reduce((sum, st) => sum + st.metres, 0);
      const last = state.navStep === steps.length - 1;
      top = `
        <div class="instruction" role="status" aria-live="polite">
          <span class="instr-icon">${icon(s.kind)}</span>
          <span>
            <strong>${s.title}</strong>
            <span class="muted">${s.sub}</span>
            <span class="step-count">Step ${state.navStep + 1} of ${steps.length}</span>
          </span>
        </div>`;
      sheet = `
        <div class="sheet">
          <div class="grabber"></div>
          <p class="big">${Math.max(1, Math.round(left / WALK_M_PER_MIN))} min · ${left} m</p>
          <p class="muted" style="margin:4px 0 0">Arriving at ${label(state.dest)}</p>
          <div class="btn-row">
            <button class="btn btn-tint" data-action="${state.navStep > 0 ? "prev-step" : "end-nav"}">${state.navStep > 0 ? "Back" : "End"}</button>
            <button class="btn btn-primary" data-action="${last ? "finish" : "next-step"}">${last ? "Finish" : "Next step"}</button>
          </div>
        </div>`;
    }
  }

  return `
    <section class="mapview">
      <svg id="map" role="img" aria-label="Block 10, Level 1 floor plan${state.dest ? ` with a route to ${label(state.dest)}` : ""}"></svg>
      <div class="map-top">${top}</div>
      ${sheet}
    </section>`;
}

function arrivedView() {
  const booking = state.bookings.find((b) => b.space === state.dest);
  return `
    <h1 class="hero">You have <b>arrived</b>.</h1>
    <div class="ticket ticket-tall">
      <span class="bar"><span class="small">arrived</span><span class="title">${label(state.dest)}</span></span>
      <span class="meta muted">Block 10 · Level 1</span>
      ${booking ? `<span class="meta muted">Your seat is reserved ${booking.from} to ${booking.to}.</span>` : ""}
      <button class="btn btn-primary" data-action="done" style="margin-top:28px">Done</button>
    </div>`;
}

/* ---- Study spaces (scenario 1) ---- */
function freeSeats(space) {
  return space.free - state.bookings.filter((b) => b.space === space.id).length;
}
function studyView() {
  const filters = ["Quiet", "Group", "Power", "Accessible"];
  const list = SPACES.filter((s) => !state.studyFilter || s.tags.includes(state.studyFilter));
  return `
    <h1 class="hero">Find a <b>seat</b>.</h1>
    <div class="card">
      <span class="icon-badge">${icon("book")}</span>
      <h2 class="card-title">Study spaces</h2>
      <div class="chips scroll" role="group" aria-label="Filter study spaces">
        ${filters.map((f) => `<button class="chip" aria-pressed="${state.studyFilter === f}" data-action="filter" data-id="${f}">${f}</button>`).join("")}
      </div>
      ${list.length === 0 ? `<p class="muted">No spaces match this filter.</p>` : list.map((s) => `
        <button class="row-item" data-action="space" data-id="${s.id}">
          <span class="bar"><span class="small muted">${freeSeats(s)} free</span><span class="title">${s.name}</span></span>
          <span class="round-btn">${icon("chevron")}</span>
          <span class="meta muted">Level 1 · ${s.tags.join(" · ")}</span>
        </button>`).join("")}
    </div>`;
}
function spaceView() {
  const s = SPACES.find((x) => x.id === state.params.id);
  const free = freeSeats(s);
  const mine = state.bookings.find((b) => b.space === s.id);
  return `
    <button class="link-btn" data-action="go" data-id="study">‹ Study spaces</button>
    <div class="card card-center">
      <span class="icon-badge">${icon("book")}</span>
      <h2>${s.name}</h2>
      <div class="bar" style="text-align:left;margin-bottom:28px">
        <span class="small muted">seats</span>
        <span class="title">${free} of ${s.seats} free</span>
        <span class="meta muted">${s.tags.join(" · ")}</span>
        ${mine ? `<span class="meta" style="color:var(--blue)">You're booked ${mine.from} to ${mine.to}</span>` : ""}
      </div>
      <button class="btn btn-primary" data-action="reserve" data-id="${s.id}" ${free > 0 ? "" : "disabled"}>${free > 0 ? "Reserve a seat" : "Fully booked"}</button>
      <button class="btn btn-tint" data-action="route" data-id="${s.id}">Take me there</button>
    </div>`;
}
function reserveView() {
  const s = SPACES.find((x) => x.id === state.params.id);
  const time = state.params.time || "10:00";
  const dur = state.params.dur || 1;
  return `
    <button class="link-btn" data-action="space" data-id="${s.id}">‹ ${s.name}</button>
    <div class="card card-center">
      <span class="icon-badge">${icon("book")}</span>
      <h2>Reserve</h2>
      <p class="muted" style="margin:-12px 0 16px">${s.name}</p>
      <div class="chips" role="group" aria-label="Start time" style="justify-content:flex-start">
        ${["10:00", "11:00", "12:00"].map((t) => `<button class="chip" aria-pressed="${t === time}" data-action="pick-time" data-id="${t}">${t}</button>`).join("")}
      </div>
      <div class="chips" role="group" aria-label="Duration" style="justify-content:flex-start;margin-bottom:24px">
        ${[1, 2].map((d) => `<button class="chip" aria-pressed="${d === dur}" data-action="pick-dur" data-id="${d}">${d} hour${d > 1 ? "s" : ""}</button>`).join("")}
      </div>
      <button class="btn btn-primary" data-action="confirm" data-id="${s.id}">Confirm reservation</button>
    </div>`;
}
function reservedView() {
  const b = state.bookings.find((x) => x.id === state.params.bookingId);
  return `
    <h1 class="hero">All <b>set</b>.</h1>
    <div class="ticket ticket-tall">
      <span class="bar"><span class="small">reserved</span><span class="title">${label(b.space)}</span></span>
      <span class="meta muted">${b.from} to ${b.to} · Block 10, Level 1</span>
      <div style="margin-top:40px">
        <button class="btn btn-primary" data-action="route" data-id="${b.space}">Take me there</button>
        <button class="btn btn-tint" data-action="done">Done</button>
      </div>
    </div>`;
}

/* ---- Alerts (scenario 2) ---- */
function alertsView() {
  return `
    <h1 class="hero">Your <b>rooms</b> moved.</h1>
    <div class="ticket">
      ${ROOM_CHANGES.map((c) => {
        const r = planRoute(state.start, c.to);
        return `
        <button class="row-item" data-action="route" data-id="${c.to}">
          <span class="bar"><span class="small">${c.course} · ${c.time}</span><span class="title">${label(c.to)}</span></span>
          <span class="round-btn">${icon("chevron")}</span>
          <span class="meta muted">Was ${c.was}${r ? ` · ${r.minutes} min walk` : ""}</span>
        </button>`;
      }).join("")}
      <button class="btn btn-primary" data-action="route" data-id="${ROOM_CHANGES[0].to}" style="margin-top:20px">Route to new room →</button>
    </div>
    <p style="text-align:center"><button class="link-btn" data-action="replay-notif">Replay the notification</button></p>`;
}

/* ---- Services: step-free + lifts (scenario 3) ---- */
function servicesView() {
  return `
    <h1 class="hero">Step-<b>free</b> routes.</h1>
    <div class="card">
      <span class="icon-badge">${icon("map")}</span>
      <h2 class="card-title">Step-free routing</h2>
      <button class="setting" role="switch" aria-checked="${state.stepFree}" data-action="toggle-a11y">
        <span class="bar"><span class="title">Step-free only</span></span>
        <span class="switch" aria-hidden="true"></span>
      </button>
      <p class="muted" style="font-size:14px;margin:4px 0 16px">Avoids stairs and lifts that are out of service. Applies to all routes.</p>
      <button class="btn btn-tint" data-action="example-route">See an example route</button>
    </div>
    <button class="card row-item" data-action="go" data-id="lifts" style="padding:20px">
      <span class="bar"><span class="small muted">Lift status</span><span class="title" style="font-size:20px">${state.outages.size ? `${state.outages.size} lift out of service` : "All lifts working"}</span></span>
      <span class="round-btn">${icon("chevron")}</span>
    </button>`;
}
function liftsView() {
  const lifts = graph.nodes.filter((n) => n.type === "lift");
  return `
    <h1 class="hero">Lift <b>status</b>.</h1>
    <div class="card">
      ${lifts.map((l) => {
        const down = state.outages.has(l.id);
        return `
        <div class="row-item">
          <span class="bar"><span class="title" style="font-size:20px">${l.label}</span>
            <span class="status ${down ? "down" : "ok"}" style="margin-top:6px">${down ? "Out of service" : "Working"}</span></span>
          <button class="setting" style="width:auto;margin:0" role="switch" aria-checked="${down}" aria-label="Mark ${l.label} out of service" data-action="toggle-outage" data-id="${l.id}">
            <span class="switch" aria-hidden="true"></span>
          </button>
        </div>`;
      }).join("")}
      <p class="muted" style="font-size:13px;margin:12px 0 0">Demo: switch a lift off to see step-free routes reroute around it.</p>
    </div>`;
}

/* =========================================================
   3. RENDERING
   ========================================================= */

function render() {
  const view = document.getElementById("view");
  view.innerHTML = VIEWS[state.view]();
  document.body.dataset.view = state.view;
  document.body.classList.toggle("navigating", state.view === "map" && state.mapMode === "navigate" && !!state.dest);

  const a11y = document.getElementById("a11y");
  a11y.setAttribute("aria-checked", state.stepFree);

  const active = TAB_OF[state.view];
  document.querySelector(".tabbar").innerHTML = TABS.map(([id, text, ic]) => `
    <button class="tab" data-action="tab" data-id="${id}" ${active === id ? 'aria-current="page"' : ""}>
      ${icon(ic)}<span>${text}</span>
      ${id === "alerts" && state.alertsUnread ? '<span class="dot" aria-label="new"></span>' : ""}
    </button>`).join("");

  measureDock();
  if (state.view === "map") drawMap();
  if (state.view === "search") {
    const q = document.getElementById("q");
    q.addEventListener("input", () => {
      state.params.q = q.value;
      document.getElementById("results").innerHTML = resultsHtml(q.value);
    });
    if (matchMedia("(pointer: fine)").matches) q.focus();
  }
}

function measureDock() {
  const root = document.documentElement.style;
  root.setProperty("--nav-h", document.querySelector(".tabbar").offsetHeight + "px");
  root.setProperty("--dock-h", document.querySelector(".dock").offsetHeight + "px");
}

/* ---------- Map drawing ---------- */
function drawMap() {
  const svg = document.getElementById("map");
  const W = graph.width, H = graph.height;
  let out = `<rect x="-6000" y="-6000" width="14000" height="14000" fill="#F3F4F6"/>
             <image href="assets/block10.png" width="${W}" height="${H}"/>`;

  // Lifts that are out of service get a red badge
  for (const id of state.outages) {
    const n = nodeById[id];
    out += `<g transform="translate(${n.x} ${n.y})"><circle r="30" fill="#E0322F" stroke="#fff" stroke-width="6"/>
            <path d="M-11 -11L11 11M11 -11L-11 11" stroke="#fff" stroke-width="7" stroke-linecap="round"/></g>`;
  }

  let focus = [{ x: 0, y: 0 }, { x: W, y: H }];
  let pad = 40;
  const route = state.dest ? planRoute(state.start, state.dest) : null;

  if (!route || state.mapMode === "browse") {
    // Browse: every room is tappable
    for (const n of places()) {
      out += `<circle class="hotspot" cx="${n.x}" cy="${n.y}" r="70" data-action="route" data-id="${n.id}"
               tabindex="0" role="button" aria-label="Route to ${n.label}"/>`;
    }
    if (state.dest) out += endMarker(nodeById[state.dest]);
  } else {
    const pts = route.onMap.map((n) => `${n.x},${n.y}`).join(" ");
    const end = route.onMap[route.onMap.length - 1];

    if (state.mapMode === "navigate") {
      const steps = buildSteps(route, label(state.dest));
      const s = steps[Math.min(state.navStep, steps.length - 1)];
      out += routeLine(pts, "#9AA6FF");
      if (s.leg) out += routeLine(s.leg.map((p) => `${p.x},${p.y}`).join(" "), "#2438FF");
      out += endMarker(end);
      const here = s.leg ? s.leg[0] : s.at;
      out += startMarker(here);
      focus = s.leg ? s.leg : [s.at];
      pad = 260;
    } else {
      out += routeLine(pts, "#2438FF");
      out += endMarker(end);
      out += startMarker(route.onMap[0]);
      focus = route.onMap;
      pad = 160;
    }
  }

  svg.innerHTML = out;
  fitTo(focus, pad);
}

function routeLine(points, color) {
  return `<polyline points="${points}" fill="none" stroke="#fff" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="${points}" fill="none" stroke="${color}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function startMarker(p) {
  return `<g transform="translate(${p.x} ${p.y})">
            <circle class="pulse" r="44" fill="#E0322F"/>
            <circle r="20" fill="#E0322F" stroke="#fff" stroke-width="7"/>
          </g>`;
}
function endMarker(p) {
  return `<g transform="translate(${p.x} ${p.y})">
            <circle r="42" fill="#fff" stroke="#2438FF" stroke-width="7"/>
            <g transform="translate(-21 -22) scale(1.75)" fill="none" stroke="#2438FF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICON.pin}</g>
          </g>`;
}

// Zoom the map so the route sits in the gap between the top card and the bottom sheet
function fitTo(points, pad) {
  const svg = document.getElementById("map");
  const box = svg.getBoundingClientRect();
  const W = box.width, H = box.height;
  if (!W || !H) return;

  const topEl = document.querySelector(".map-top");
  const sheetEl = document.querySelector(".sheet");
  const tabEl = document.querySelector(".tabbar");
  const wide = matchMedia("(min-width: 768px)").matches;

  // The free area of the map that isn't covered by cards
  let left = 0, top = 0, right = W, bottom = H;
  if (wide) {
    // Laptop/tablet: the cards float on the left, so the free area is to their right
    const panelRight = Math.max(
      topEl ? topEl.getBoundingClientRect().right : 0,
      sheetEl ? sheetEl.getBoundingClientRect().right : 0
    );
    left = panelRight - box.left + 24;
    top = 80;
    bottom = H - (tabEl && tabEl.offsetParent ? H - (tabEl.getBoundingClientRect().top - box.top) : 0) - 24;
  } else {
    // Phone: cards sit at the top and bottom, so the free area is between them
    if (topEl) top = topEl.getBoundingClientRect().bottom - box.top + 12;
    if (sheetEl) bottom = sheetEl.getBoundingClientRect().top - box.top - 12;
  }
  const availW = Math.max(120, right - left);
  const availH = Math.max(120, bottom - top);

  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad;
  const y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;

  let s = Math.min(availW / (x1 - x0), availH / (y1 - y0));
  s = Math.min(s, availW / 650); // don't zoom in too far
  const vw = W / s, vh = H / s;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const target = [cx - (left + availW / 2) / s, cy - (top + availH / 2) / s, vw, vh];

  animateViewBox(svg, state.viewBox, target);
  state.viewBox = target;
}

function animateViewBox(svg, from, to) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!from || reduce) { svg.setAttribute("viewBox", to.join(" ")); return; }
  const t0 = performance.now(), dur = 450;
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  function frame(now) {
    const t = Math.min(1, (now - t0) / dur);
    const k = ease(t);
    svg.setAttribute("viewBox", from.map((f, i) => f + (to[i] - f) * k).join(" "));
    if (t < 1) requestAnimationFrame(frame);
  }
  svg.setAttribute("viewBox", from.join(" "));
  requestAnimationFrame(frame);
}

/* ---------- Notification (scenario 2) ---------- */
function scheduleNotification() {
  let seen = false;
  try { seen = sessionStorage.getItem("nav:notif") === "1"; } catch {}
  if (!seen) setTimeout(showNotification, 2500);
}
function showNotification() {
  try { sessionStorage.setItem("nav:notif", "1"); } catch {}
  const c = ROOM_CHANGES[0];
  const el = document.getElementById("notif");
  el.innerHTML = `
    <div class="notif-card" role="alert">
      <div class="notif-head">${icon("alert")}<strong>ROOM CHANGE</strong><span class="muted">now</span>
        <button class="notif-close" data-action="notif-close" aria-label="Dismiss">${icon("x")}</button>
      </div>
      <p>Your ${c.course.split(" · ")[0]} class moved to ${label(c.to)} →</p>
      <div class="notif-actions">
        <button class="link-btn" data-action="notif-app">go to app →</button>
        <button class="pill" data-action="notif-go">take me there →</button>
      </div>
    </div>`;
  state.alertsUnread = true;
  render();
  requestAnimationFrame(() => el.classList.add("show"));
}
function hideNotification() {
  document.getElementById("notif").classList.remove("show");
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

/* ---------- Smooth screen changes (View Transitions API) ---------- */
// Wraps a DOM update so the browser cross-fades old → new instead of jumping.
// Browsers without support (or users who prefer reduced motion) just update instantly.
// kind = "page" for moving to another screen, "update" for changes on the same screen
function smoothly(update, kind = "page") {
  document.documentElement.dataset.transition = kind;
  document.body.classList.toggle("no-enter", kind === "update");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!document.startViewTransition || reduce) { update(); return; }
  document.startViewTransition(update);
}
const refresh = () => smoothly(render, "update");

/* =========================================================
   4. ACTIONS (every data-action="…" in the HTML)
   ========================================================= */

function go(view, params = {}) {
  state.view = view;
  state.params = params;
  if (view === "alerts") state.alertsUnread = false;
  smoothly(() => {
    render();
    window.scrollTo(0, 0);
  });
}

function openRoute(id) {
  state.dest = id;
  state.mapMode = "preview";
  state.navStep = 0;
  if (state.start === id) state.start = "entrance";
  go("map");
}

function setStepFree(on) {
  state.stepFree = on;
  store.set("stepFree", on);
  refresh();
  toast(on ? "Step-free routes on: stairs avoided" : "Step-free routes off");
}

const ACTIONS = {
  tab(id) {
    if (id === "map") {
      state.mapMode = state.dest ? (state.mapMode === "navigate" ? "navigate" : "preview") : "browse";
    }
    go(id);
  },
  go: (id) => go(id),
  search: () => go("search"),
  quick(q) { go("search", { q }); },
  route: (id) => openRoute(id),
  soon: (msg) => toast(msg),
  "toggle-a11y": () => setStepFree(!state.stepFree),
  "set-mode": (id) => setStepFree(id === "stepfree"),
  "clear-dest"() { state.dest = null; state.mapMode = "browse"; refresh(); },
  "start-nav"() { state.mapMode = "navigate"; state.navStep = 0; refresh(); },
  "next-step"() { state.navStep++; refresh(); },
  "prev-step"() { state.navStep = Math.max(0, state.navStep - 1); refresh(); },
  "end-nav"() { state.mapMode = "preview"; refresh(); },
  finish() {
    state.mapMode = "browse";
    state.start = state.dest;
    store.set("start", state.start);
    go("arrived");
  },
  done() { state.dest = null; state.mapMode = "browse"; go("home"); },

  filter(f) { state.studyFilter = state.studyFilter === f ? null : f; refresh(); },
  space: (id) => go("space", { id }),
  reserve: (id) => go("reserve", { id }),
  "pick-time"(t) { state.params.time = t; refresh(); },
  "pick-dur"(d) { state.params.dur = Number(d); refresh(); },
  confirm(id) {
    const from = state.params.time || "10:00";
    const dur = state.params.dur || 1;
    const to = `${String(Number(from.slice(0, 2)) + dur).padStart(2, "0")}:00`;
    const booking = { id: Date.now().toString(36), space: id, from, to };
    state.bookings = state.bookings.filter((b) => b.space !== id).concat(booking);
    store.set("bookings", state.bookings);
    go("reserved", { bookingId: booking.id });
  },

  "toggle-outage"(id) {
    if (state.outages.has(id)) state.outages.delete(id); else state.outages.add(id);
    store.set("outages", [...state.outages]);
    refresh();
  },
  "example-route"() {
    state.start = "entrance";
    state.stepFree = true;
    store.set("stepFree", true);
    openRoute("ff101");
  },

  "notif-close": hideNotification,
  "notif-app"() { hideNotification(); go("alerts"); },
  "notif-go"() { hideNotification(); state.alertsUnread = false; openRoute(ROOM_CHANGES[0].to); },
  "replay-notif"() { hideNotification(); setTimeout(showNotification, 400); },
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el || el.disabled) return;
  ACTIONS[el.dataset.action]?.(el.dataset.id, el);
});

// Enter / Space on the tappable rooms in the SVG map
document.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.classList?.contains("hotspot")) {
    e.preventDefault();
    e.target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }
});

document.addEventListener("change", (e) => {
  if (e.target.id === "startSel") {
    state.start = e.target.value;
    store.set("start", state.start);
    refresh();
  }
});

window.addEventListener("resize", () => {
  measureDock();
  if (state.view === "map") { state.viewBox = null; drawMap(); }
});

loadMap();
