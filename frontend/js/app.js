/* app.js — boots the app and routes between pages using the URL hash */
import { api } from "./api.js";
import { $, $$, esc, toast } from "./ui.js";
import { state, loadUsers, setUser } from "./state.js";

import { moviesPage } from "./pages/movies.js";
import { movieDetailPage } from "./pages/movie-detail.js";
import { showtimesPage } from "./pages/showtimes.js";
import { seatsPage } from "./pages/seats.js";
import { orderPage } from "./pages/order.js";
import { bookingsPage } from "./pages/bookings.js";
import { adminPage } from "./pages/admin.js";

// pattern → [page function, nav key]
const routes = [
  [/^\/?$/, moviesPage, "movies"],
  [/^\/movie\/(\d+)$/, movieDetailPage, "movies"],
  [/^\/shows$/, showtimesPage, "shows"],
  [/^\/show\/(\d+)$/, seatsPage, "shows"],
  [/^\/order\/(\d+)$/, orderPage, "bookings"],
  [/^\/bookings$/, bookingsPage, "bookings"],
  [/^\/admin$/, adminPage, "admin"],
];

let renderToken = 0;

async function router() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [path, query] = raw.split("?");
  const params = new URLSearchParams(query || "");
  const app = $("#app");

  let match = null;
  for (const [re, page, nav] of routes) {
    const m = path.match(re);
    if (m) { match = { page, nav, args: m.slice(1) }; break; }
  }

  $$("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === match?.nav));

  if (!match) {
    app.innerHTML = `<div class="empty"><h3>Page not found</h3><p><a href="#/">Back to movies</a></p></div>`;
    return;
  }

  const token = ++renderToken;
  // pages receive: root element, route args, query params, and a "stale" check
  const ctx = { root: app, args: match.args, params, isStale: () => token !== renderToken };
  try {
    await match.page(ctx);
  } catch (err) {
    if (ctx.isStale()) return;
    console.error(err);
    app.innerHTML = `<div class="empty error"><h3>Something went wrong</h3><p>${esc(err.message)}</p></div>`;
  }
  if (!ctx.isStale()) window.scrollTo({ top: 0, behavior: "instant" });
}

function renderUserSelect() {
  const sel = $("#userSelect");
  if (!state.users.length) {
    sel.innerHTML = `<option>No users</option>`;
    sel.disabled = true;
    return;
  }
  sel.innerHTML = state.users
    .map((u) => `<option value="${u.user_id}" ${u.user_id === state.userId ? "selected" : ""}>${esc(u.name)}</option>`)
    .join("");
  sel.onchange = () => {
    setUser(sel.value);
    const u = state.users.find((x) => x.user_id === Number(sel.value));
    toast(`Now booking as ${u.name}`);
    window.dispatchEvent(new CustomEvent("cinebook:user"));
  };
}

async function checkApi() {
  const dot = $("#apiDot");
  try {
    const r = await api.health();
    dot.className = "api-dot up";
    dot.title = `API: ${r?.status || "running"}`;
  } catch (e) {
    dot.className = "api-dot down";
    dot.title = e.message;
  }
}

async function boot() {
  checkApi();
  try {
    await loadUsers();
  } catch (e) {
    toast(`Could not load users: ${e.message}`, "error");
  }
  renderUserSelect();

  // re-render user-dependent pages when the user switches
  window.addEventListener("cinebook:user", () => {
    if (/^#\/bookings/.test(location.hash)) router();
  });

  window.addEventListener("hashchange", router);
  router();
}

boot();
