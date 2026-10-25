/* Showtimes — every show from GET /shows, filterable by theatre and date */
import { esc, money, fmtDate, fmtTime, dayKey, loader } from "../ui.js";
import { getShows } from "../state.js";

export async function showtimesPage({ root, isStale }) {
  root.innerHTML = loader("Fetching shows…");
  const shows = await getShows(true);
  if (isStale()) return;

  const theatres = [...new Set(shows.map((s) => s.theatre))].sort();
  const days = [...new Set(shows.map((s) => dayKey(s.start_time)))];
  const f = { theatre: "", day: "" };

  root.innerHTML = `
    <section class="hero slim">
      <p class="eyebrow">Showtimes</p>
      <h1>Every show, in order.</h1>
    </section>
    <div class="toolbar">
      <select id="th" class="input select" aria-label="Theatre">
        <option value="">All theatres</option>
        ${theatres.map((t) => `<option>${esc(t)}</option>`).join("")}
      </select>
      <select id="dy" class="input select" aria-label="Date">
        <option value="">All dates</option>
        ${days.map((d) => {
          const s = shows.find((x) => dayKey(x.start_time) === d);
          return `<option value="${d}">${fmtDate(s.start_time)}</option>`;
        }).join("")}
      </select>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Date</th><th>Time</th><th>Movie</th><th>Theatre</th><th class="num">Price</th><th></th></tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </div>`;

  const tbody = root.querySelector("#rows");
  function draw() {
    const list = shows.filter((s) =>
      (!f.theatre || s.theatre === f.theatre) && (!f.day || dayKey(s.start_time) === f.day));
    tbody.innerHTML = list.length
      ? list.map((s) => `
        <tr>
          <td>${fmtDate(s.start_time)}</td>
          <td class="mono">${fmtTime(s.start_time)}</td>
          <td><a href="#/movie/${s.movie_id}">${esc(s.movie)}</a></td>
          <td>${esc(s.theatre)} <span class="muted">· ${esc(s.location)}</span></td>
          <td class="num">${money(s.ticket_price)}</td>
          <td class="num"><a class="btn sm primary" href="#/show/${s.show_id}">Select seats</a></td>
        </tr>`).join("")
      : `<tr><td colspan="6" class="muted center">No shows match.</td></tr>`;
  }
  root.querySelector("#th").onchange = (e) => { f.theatre = e.target.value; draw(); };
  root.querySelector("#dy").onchange = (e) => { f.day = e.target.value; draw(); };
  draw();
}
