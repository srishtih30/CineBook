/* Movie detail — shows for one movie, grouped by date and theatre.
 * Uses GET /movies/{id}/shows. */
import { esc, money, fmtDate, fmtTime, dayKey, runtime, loader } from "../ui.js";
import { api } from "../api.js";
import { getMovies } from "../state.js";
import { posterHTML } from "./movies.js";

export function groupShows(shows) {
  // date → theatre → [shows]
  const days = new Map();
  for (const s of shows) {
    const k = dayKey(s.start_time);
    if (!days.has(k)) days.set(k, new Map());
    const theatres = days.get(k);
    const tk = `${s.theatre}|${s.location}`;
    if (!theatres.has(tk)) theatres.set(tk, []);
    theatres.get(tk).push(s);
  }
  return days;
}

export function showtimeButtons(list) {
  return list.map((s) => `
    <a class="time-pill" href="#/show/${s.show_id}">
      <span class="t">${fmtTime(s.start_time)}</span>
      <span class="p">${money(s.ticket_price)}</span>
    </a>`).join("");
}

export async function movieDetailPage({ root, args, isStale }) {
  const id = Number(args[0]);
  root.innerHTML = loader();
  const movies = await getMovies();
  if (isStale()) return;

  const movie = movies.find((m) => m.movie_id === id);
  const mine = movie ? await api.movieShows(id) : [];
  if (isStale()) return;
  if (!movie) {
    root.innerHTML = `<div class="empty"><h3>Movie not found</h3><p><a href="#/">Back to movies</a></p></div>`;
    return;
  }

  const days = groupShows(mine);
  const dayKeys = [...days.keys()];
  let activeDay = dayKeys[0];

  root.innerHTML = `
    <a class="back" href="#/">← All movies</a>
    <section class="movie-hero">
      ${posterHTML(movie, "lg")}
      <div>
        <p class="eyebrow">${esc(movie.genre)}</p>
        <h1>${esc(movie.title)}</h1>
        <ul class="facts">
          <li><span>Runtime</span>${runtime(movie.duration_minutes)}</li>
          <li><span>Language</span>${esc(movie.language)}</li>
          <li><span>Shows</span>${mine.length}</li>
        </ul>
      </div>
    </section>

    <section class="panel">
      <h2 class="section-title">Choose a showtime</h2>
      ${mine.length ? `
        <div class="day-tabs" role="tablist">
          ${dayKeys.map((k) => {
            const sample = [...days.get(k).values()][0][0];
            return `<button role="tab" class="day-tab" data-day="${k}">${fmtDate(sample.start_time)}</button>`;
          }).join("")}
        </div>
        <div id="dayShows"></div>`
      : `<div class="empty"><h3>No shows yet</h3><p>Nothing is scheduled for this movie.</p></div>`}
    </section>`;

  if (!mine.length) return;

  const box = root.querySelector("#dayShows");
  function draw() {
    root.querySelectorAll(".day-tab").forEach((b) => {
      const on = b.dataset.day === activeDay;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on);
    });
    const theatres = days.get(activeDay);
    box.innerHTML = [...theatres.entries()].map(([tk, list]) => {
      const [name, loc] = tk.split("|");
      return `
        <div class="theatre-row">
          <div class="theatre-name"><b>${esc(name)}</b><span class="muted">${esc(loc)}</span></div>
          <div class="times">${showtimeButtons(list)}</div>
        </div>`;
    }).join("");
  }
  root.querySelector(".day-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-day]");
    if (b) { activeDay = b.dataset.day; draw(); }
  });
  draw();
}
