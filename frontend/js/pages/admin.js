/* Admin panel — open it from the "Admin" link in the header (#/admin)
 *   GET  /admin/stats     headline numbers
 *   GET  /admin/reports   per-show / per-movie / per-theatre SQL reports
 *   GET  /orders          every booking order
 *   GET  /theatres, /movies, /users
 *   POST /movies, POST /shows
 *   PATCH /bookings/{id}/cancel
 */
import { api } from "../api.js";
import { esc, money, fmtDate, fmtTime, fmtDateTime, seatLabel, statusBadge, runtime, loader, errorBox, toast, confirmDialog } from "../ui.js";
import { getMovies, getShows, state } from "../state.js";

const TABS = [
  ["overview", "Overview"],
  ["occupancy", "Seat occupancy"],
  ["orders", "All bookings"],
  ["manage", "Manage catalogue"],
];

export async function adminPage({ root, params, isStale }) {
  let tab = params.get("tab") || "overview";
  if (!TABS.some(([k]) => k === tab)) tab = "overview";

  root.innerHTML = `
    <section class="hero slim">
      <p class="eyebrow">Admin</p>
      <h1>Admin panel</h1>
      <p class="lede">Reports, bookings and catalogue — live from PostgreSQL via the CineBook API.</p>
    </section>
    <div class="tabs" role="tablist">
      ${TABS.map(([k, l]) => `<button role="tab" class="tab" data-tab="${k}">${l}</button>`).join("")}
      <button class="btn ghost sm refresh" id="refresh" title="Reload data">↻ Refresh</button>
    </div>
    <div id="stats"></div>
    <div id="pane">${loader()}</div>`;

  const pane = root.querySelector("#pane");
  const statsBox = root.querySelector("#stats");
  let data = null;

  async function load() {
    const [stats, reports, orders, theatres, movies] = await Promise.all([
      api.stats(), api.reports(), api.orders(), api.theatres(), getMovies(true),
    ]);
    getShows(true).catch(() => {}); // refresh the shared cache for other pages
    data = { stats, reports, orders, theatres, movies };
  }

  function drawStats() {
    const s = data.stats;
    const tiles = [
      ["Active booking value", money(s.active_booking_value), "Sum of booked_price for confirmed seats"],
      ["Confirmed tickets", s.confirmed_tickets, "Seat rows with status CONFIRMED"],
      ["Confirmed orders", `${s.confirmed_orders}<small> / ${s.total_orders}</small>`, "Orders not cancelled / all orders"],
      ["Movies", s.total_movies, ""],
      ["Users", s.total_users, ""],
      ["Shows", data.reports.shows.length, ""],
    ];
    statsBox.innerHTML = `<div class="stat-grid">${tiles.map(([l, v, h]) => `
      <div class="stat" title="${esc(h)}"><span class="stat-label">${l}</span><span class="stat-value">${v}</span></div>`).join("")}</div>`;
  }

  function drawPane() {
    root.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    if (tab === "overview") pane.innerHTML = overview(data.reports);
    if (tab === "occupancy") pane.innerHTML = occupancyTable(data.reports.shows);
    if (tab === "orders") pane.innerHTML = ordersTable(data.orders);
    if (tab === "manage") { pane.innerHTML = manage(data); wireForms(); }
  }

  async function reload(message) {
    await load();
    if (isStale()) return;
    drawStats();
    drawPane();
    if (message) toast(message, "success");
  }

  function wireForms() {
    const movieForm = pane.querySelector("#movieForm");
    const showForm = pane.querySelector("#showForm");

    movieForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(movieForm);
      const btn = movieForm.querySelector("button");
      btn.disabled = true;
      try {
        const m = await api.addMovie({
          title: f.get("title"),
          genre: f.get("genre"),
          duration_minutes: Number(f.get("duration")),
          language: f.get("language"),
        });
        await reload(`Added movie #${m.movie_id}: ${m.title}`);
      } catch (err) {
        toast(err.message, "error");
        btn.disabled = false;
      }
    });

    showForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(showForm);
      const btn = showForm.querySelector("button");
      btn.disabled = true;
      try {
        const s = await api.addShow({
          movie_id: Number(f.get("movie")),
          theatre_id: Number(f.get("theatre")),
          start_time: f.get("start"),            // "2026-10-23T18:00"
          ticket_price: Number(f.get("price")),
        });
        await reload(`Scheduled show #${s.show_id}: ${s.movie}, ${fmtDateTime(s.start_time)}`);
      } catch (err) {
        toast(err.message, "error");
        btn.disabled = false;
      }
    });
  }

  root.querySelector(".tabs").addEventListener("click", async (e) => {
    if (e.target.id === "refresh") return reload("Reports refreshed").catch((err) => toast(err.message, "error"));
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    tab = b.dataset.tab;
    history.replaceState(null, "", `#/admin?tab=${tab}`);
    drawPane();
  });

  pane.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-cancel]");
    if (!b) return;
    const id = Number(b.dataset.cancel);
    const ok = await confirmDialog({ title: `Cancel order #${id}?`, body: "Its seats will be released for new bookings.", confirmText: "Cancel order", danger: true });
    if (!ok) return;
    try {
      await api.cancel(id);
      await reload(`Order #${id} cancelled`);
    } catch (err) { toast(err.message, "error"); }
  });

  try {
    await load();
  } catch (e) {
    if (!isStale()) pane.innerHTML = errorBox(e);
    return;
  }
  if (isStale()) return;
  drawStats();
  drawPane();
}

/* ---------- views ---------- */

const pct = (a, b) => (Number(b) ? Math.round((Number(a) / Number(b)) * 100) : 0);

function overview({ shows, movies, theatres }) {
  const maxSeats = Math.max(1, ...movies.map((m) => Number(m.confirmed_seats)));
  const busiest = [...shows]
    .sort((a, b) => pct(b.booked_seats, b.total_seats) - pct(a.booked_seats, a.total_seats))
    .slice(0, 5);

  return `
    <div class="admin-grid">
      <section class="panel">
        <h2 class="section-title">Popular movies <span class="muted small">confirmed seats</span></h2>
        <div class="hbars">
          ${movies.map((m) => `
            <div class="hbar" title="${m.cancelled_seats} cancelled · ${money(m.confirmed_value)}">
              <span class="hbar-label">${esc(m.title)}</span>
              <span class="hbar-track"><span style="width:${(m.confirmed_seats / maxSeats) * 100}%"></span></span>
              <span class="hbar-val">${m.confirmed_seats}</span>
            </div>`).join("")}
        </div>
      </section>

      <section class="panel">
        <h2 class="section-title">Theatres</h2>
        <table class="table compact">
          <thead><tr><th>Theatre</th><th class="num">Shows</th><th class="num">Occupancy</th><th class="num">Value</th></tr></thead>
          <tbody>${theatres.map((t) => `
            <tr><td>${esc(t.name)} <span class="muted">· ${esc(t.location)}</span></td>
              <td class="num">${t.shows}</td>
              <td class="num">${pct(t.booked_seats, t.total_capacity)}%</td>
              <td class="num">${money(t.confirmed_value)}</td></tr>`).join("")}
          </tbody>
        </table>
      </section>

      <section class="panel span-2">
        <h2 class="section-title">Busiest shows</h2>
        <div class="table-wrap">
          <table class="table compact">
            <thead><tr><th>Show</th><th>When</th><th>Theatre</th><th class="num">Booked</th><th class="occ-col">Occupancy</th></tr></thead>
            <tbody>${busiest.map((o) => `
              <tr>
                <td><a href="#/show/${o.show_id}">${esc(o.movie)}</a> <span class="muted mono small">#${o.show_id}</span></td>
                <td>${fmtDate(o.start_time)} · ${fmtTime(o.start_time)}</td>
                <td>${esc(o.theatre)}</td>
                <td class="num">${o.booked_seats}/${o.total_seats}</td>
                <td class="occ-col">${occBar(o)}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </section>
    </div>`;
}

function occBar(o) {
  const p = pct(o.booked_seats, o.total_seats);
  return `<div class="bar thin"><span style="width:${p}%"></span></div><span class="small muted">${p}%</span>`;
}

function occupancyTable(shows) {
  return `
    <section class="panel">
      <h2 class="section-title">Seat occupancy by show</h2>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Show</th><th>When</th><th>Theatre</th><th class="num">Price</th><th class="num">Booked</th><th class="occ-col">Occupancy</th><th class="num">Confirmed value</th></tr></thead>
          <tbody>
            ${shows.map((o) => `<tr>
                <td><a href="#/show/${o.show_id}">${esc(o.movie)}</a> <span class="muted mono small">#${o.show_id}</span></td>
                <td>${fmtDate(o.start_time)} · ${fmtTime(o.start_time)}</td>
                <td>${esc(o.theatre)}</td>
                <td class="num">${money(o.ticket_price)}</td>
                <td class="num">${o.booked_seats}/${o.total_seats}</td>
                <td class="occ-col">${occBar(o)}</td>
                <td class="num">${money(o.confirmed_value)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <p class="fine">Computed in SQL: LEFT JOIN bookings (status = 'CONFIRMED') … GROUP BY show. Value sums the price each seat was booked at.</p>
    </section>`;
}

function ordersTable(orders) {
  if (!orders.length) return `<div class="empty"><h3>No bookings yet</h3></div>`;
  return `
    <section class="panel">
      <h2 class="section-title">All booking orders <span class="muted small">${orders.length}</span></h2>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>#</th><th>Customer</th><th>Movie</th><th>Show</th><th>Seats</th><th class="num">Total</th><th>Status</th><th>Booked at</th><th></th></tr></thead>
          <tbody>
            ${orders.map((o) => `
              <tr>
                <td class="mono"><a href="#/order/${o.order_id}">${o.order_id}</a></td>
                <td>${esc(o.customer)}<br/><span class="muted small">${esc(o.email)}</span></td>
                <td>${esc(o.movie)}</td>
                <td>${esc(o.theatre)}<br/><span class="muted small">${fmtDateTime(o.start_time)}</span></td>
                <td class="mono small">${o.seats.map(seatLabel).join(", ")}</td>
                <td class="num">${money(o.total_amount)}</td>
                <td>${statusBadge(o.status)}</td>
                <td class="small muted">${fmtDateTime(o.created_at)}</td>
                <td>${o.status === "CONFIRMED" ? `<button class="btn sm ghost danger-text" data-cancel="${o.order_id}">Cancel</button>` : ""}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>`;
}

function manage({ movies, theatres }) {
  // default the show form to tomorrow 18:00
  const d = new Date(Date.now() + 86400000);
  const pad = (n) => String(n).padStart(2, "0");
  const defaultStart = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T18:00`;

  return `
    <div class="admin-grid">
      <section class="panel">
        <h2 class="section-title">Add a movie <span class="muted small">POST /movies</span></h2>
        <form id="movieForm" class="form">
          <label>Title<input class="input" name="title" required maxlength="200" placeholder="e.g. Dune: Part Two" /></label>
          <div class="form-row">
            <label>Genre<input class="input" name="genre" required maxlength="50" placeholder="Sci-Fi" list="genreList" /></label>
            <label>Language<input class="input" name="language" required maxlength="50" placeholder="English" list="langList" /></label>
          </div>
          <label>Runtime (minutes)<input class="input" name="duration" type="number" min="1" max="600" required placeholder="166" /></label>
          <datalist id="genreList">${[...new Set(movies.map((m) => m.genre))].map((g) => `<option value="${esc(g)}">`).join("")}</datalist>
          <datalist id="langList">${[...new Set(movies.map((m) => m.language))].map((l) => `<option value="${esc(l)}">`).join("")}</datalist>
          <button class="btn primary">Add movie</button>
        </form>
      </section>

      <section class="panel">
        <h2 class="section-title">Schedule a show <span class="muted small">POST /shows</span></h2>
        <form id="showForm" class="form">
          <label>Movie
            <select class="input select" name="movie" required>
              ${movies.map((m) => `<option value="${m.movie_id}">${esc(m.title)} (${runtime(m.duration_minutes)})</option>`).join("")}
            </select>
          </label>
          <label>Theatre
            <select class="input select" name="theatre" required>
              ${theatres.map((t) => `<option value="${t.theatre_id}">${esc(t.name)} · ${esc(t.location)} (${t.total_seats} seats)</option>`).join("")}
            </select>
          </label>
          <div class="form-row">
            <label>Start time<input class="input" name="start" type="datetime-local" required value="${defaultStart}" /></label>
            <label>Ticket price (₹)<input class="input" name="price" type="number" min="1" step="0.01" required value="250" /></label>
          </div>
          <button class="btn primary">Schedule show</button>
          <p class="fine">Rejected if it overlaps another show in the same theatre (start time + movie runtime).</p>
        </form>
      </section>

      <section class="panel">
        <h2 class="section-title">Movies <span class="muted small">${movies.length}</span></h2>
        <div class="table-wrap">
          <table class="table compact">
            <thead><tr><th>ID</th><th>Title</th><th>Genre</th><th>Runtime</th><th>Language</th></tr></thead>
            <tbody>${movies.map((m) => `
              <tr><td class="mono">${m.movie_id}</td><td><a href="#/movie/${m.movie_id}">${esc(m.title)}</a></td>
              <td>${esc(m.genre)}</td><td>${runtime(m.duration_minutes)}</td><td>${esc(m.language)}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <h2 class="section-title">Theatres & users</h2>
        <table class="table compact">
          <thead><tr><th>ID</th><th>Theatre</th><th class="num">Seats</th></tr></thead>
          <tbody>${theatres.map((t) => `
            <tr><td class="mono">${t.theatre_id}</td><td>${esc(t.name)} <span class="muted">· ${esc(t.location)}</span></td><td class="num">${t.total_seats}</td></tr>`).join("")}
          </tbody>
        </table>
        <table class="table compact" style="margin-top:18px">
          <thead><tr><th>ID</th><th>User</th><th>Email</th></tr></thead>
          <tbody>${state.users.map((u) => `
            <tr><td class="mono">${u.user_id}</td><td>${esc(u.name)}</td><td class="muted">${esc(u.email)}</td></tr>`).join("")}
          </tbody>
        </table>
      </section>
    </div>`;
}
