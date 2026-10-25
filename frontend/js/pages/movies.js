/* Movies page — GET /movies + GET /shows (to show next showtime per movie) */
import { esc, money, fmtDateTime, runtime, posterStyle, loader } from "../ui.js";
import { getMovies, getShows } from "../state.js";

export function posterHTML(movie, size = "") {
  // longest word decides the title size so words never break mid-way
  const longest = Math.max(4, ...String(movie.title).split(/\s+/).map((w) => w.length));
  return `
    <div class="poster ${size}" style="${posterStyle(movie)};--len:${longest}" aria-hidden="true">
      <span class="poster-genre">${esc(movie.genre || "Film")}</span>
      <span class="poster-title">${esc(movie.title)}</span>
      <span class="poster-lang">${esc(movie.language || "")}</span>
    </div>`;
}

export async function moviesPage({ root, isStale }) {
  root.innerHTML = loader("Fetching movies…");
  const [movies, shows] = await Promise.all([getMovies(true), getShows(true)]);
  if (isStale()) return;

  const byMovie = new Map();
  for (const s of shows) {
    if (!byMovie.has(s.movie_id)) byMovie.set(s.movie_id, []);
    byMovie.get(s.movie_id).push(s);
  }

  const languages = [...new Set(movies.map((m) => m.language).filter(Boolean))].sort();
  const genres = [...new Set(movies.map((m) => m.genre).filter(Boolean))].sort();
  const filter = { q: "", lang: "", genre: "" };

  root.innerHTML = `
    <section class="hero">
      <p class="eyebrow">Now showing</p>
      <h1>Pick a film.<br/>Pick your seat.</h1>
      <p class="lede">${movies.length} movies · ${shows.length} shows across ${new Set(shows.map((s) => s.theatre)).size} theatres</p>
    </section>

    <div class="toolbar">
      <input type="search" id="q" class="input" placeholder="Search by title…" aria-label="Search movies" />
      <div class="chips" id="langChips" role="group" aria-label="Language">
        <button class="chip active" data-lang="">All languages</button>
        ${languages.map((l) => `<button class="chip" data-lang="${esc(l)}">${esc(l)}</button>`).join("")}
      </div>
      <select id="genre" class="input select" aria-label="Genre">
        <option value="">All genres</option>
        ${genres.map((g) => `<option>${esc(g)}</option>`).join("")}
      </select>
    </div>

    <div class="movie-grid" id="grid"></div>`;

  const grid = root.querySelector("#grid");

  function draw() {
    const list = movies.filter((m) =>
      (!filter.q || m.title.toLowerCase().includes(filter.q)) &&
      (!filter.lang || m.language === filter.lang) &&
      (!filter.genre || m.genre === filter.genre)
    );
    if (!list.length) {
      grid.innerHTML = `<div class="empty"><h3>No movies match</h3><p>Try clearing the filters.</p></div>`;
      return;
    }
    grid.innerHTML = list.map((m) => {
      const ms = byMovie.get(m.movie_id) || [];
      const next = ms[0]; // /shows is ordered by start_time
      const minPrice = ms.length ? Math.min(...ms.map((s) => Number(s.ticket_price))) : null;
      return `
        <a class="movie-card" href="#/movie/${m.movie_id}">
          ${posterHTML(m)}
          <div class="movie-meta">
            <h3>${esc(m.title)}</h3>
            <p class="muted">${esc(m.genre)} · ${runtime(m.duration_minutes)} · ${esc(m.language)}</p>
            ${ms.length
              ? `<p class="next">Next: ${fmtDateTime(next.start_time)}</p>
                 <p class="from">${ms.length} show${ms.length > 1 ? "s" : ""} · from <b>${money(minPrice)}</b></p>`
              : `<p class="next muted">No shows scheduled</p>`}
          </div>
        </a>`;
    }).join("");
  }

  root.querySelector("#q").addEventListener("input", (e) => { filter.q = e.target.value.trim().toLowerCase(); draw(); });
  root.querySelector("#genre").addEventListener("change", (e) => { filter.genre = e.target.value; draw(); });
  root.querySelector("#langChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-lang]");
    if (!b) return;
    filter.lang = b.dataset.lang;
    root.querySelectorAll("#langChips .chip").forEach((c) => c.classList.toggle("active", c === b));
    draw();
  });

  draw();
}
