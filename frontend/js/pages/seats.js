/* Seat selection — GET /shows/{id}/seats, then POST /bookings
 * Availability is per show and is derived by the backend from CONFIRMED
 * bookings, so we always re-fetch the seat map after any booking attempt. */
import { api } from "../api.js";
import { esc, money, fmtDateTime, seatLabel, toast, loader, confirmDialog } from "../ui.js";
import { getShows, currentUser } from "../state.js";

const MAX_SEATS = 10; // matches BookingRequest.seat_ids max_length in schemas.py

export async function seatsPage({ root, args, isStale }) {
  const showId = Number(args[0]);
  root.innerHTML = loader("Loading seat map…");

  const [shows, initialSeats] = await Promise.all([getShows(), api.seats(showId)]);
  if (isStale()) return;

  const show = shows.find((s) => s.show_id === showId);
  if (!show || !initialSeats.length) {
    root.innerHTML = `<div class="empty"><h3>Show not found</h3><p><a href="#/shows">See all showtimes</a></p></div>`;
    return;
  }

  let seats = initialSeats;
  const selected = new Set(); // seat_ids
  const price = Number(show.ticket_price);
  let busy = false;

  root.innerHTML = `
    <a class="back" href="#/movie/${show.movie_id}">← ${esc(show.movie)}</a>
    <section class="show-head">
      <div>
        <p class="eyebrow">${esc(show.theatre)} · ${esc(show.location)}</p>
        <h1>${esc(show.movie)}</h1>
        <p class="lede">${fmtDateTime(show.start_time)} · ${money(price)} per seat</p>
      </div>
      <div class="occupancy" id="occ"></div>
    </section>

    <div class="booking-layout">
      <section class="panel hall">
        <div class="screen"><span>Screen this way</span></div>
        <div class="seat-map" id="map" role="grid" aria-label="Seat map"></div>
        <div class="legend">
          <span><i class="seat-demo available"></i>Available</span>
          <span><i class="seat-demo selected"></i>Selected</span>
          <span><i class="seat-demo booked"></i>Booked</span>
        </div>
      </section>

      <aside class="panel summary" id="summary"></aside>
    </div>`;

  const map = root.querySelector("#map");
  const summary = root.querySelector("#summary");
  const occ = root.querySelector("#occ");

  function rows() {
    const r = new Map();
    for (const s of seats) {
      if (!r.has(s.row_label)) r.set(s.row_label, []);
      r.get(s.row_label).push(s);
    }
    for (const list of r.values()) list.sort((a, b) => a.seat_number - b.seat_number);
    return r;
  }

  function drawMap() {
    const r = rows();
    map.innerHTML = [...r.entries()].map(([row, list]) => {
      const aisle = list.length >= 6 ? Math.ceil(list.length / 2) : -1;
      return `
        <div class="seat-row" role="row">
          <span class="row-label">${esc(row)}</span>
          <div class="seats">
            ${list.map((s, i) => {
              const booked = s.status === "BOOKED";
              const sel = selected.has(s.seat_id);
              const cls = booked ? "booked" : sel ? "selected" : "available";
              return `${i === aisle ? `<span class="aisle"></span>` : ""}
                <button class="seat ${cls}" data-id="${s.seat_id}" role="gridcell"
                  ${booked ? "disabled" : ""} aria-pressed="${sel}"
                  aria-label="Seat ${seatLabel(s)} ${booked ? "booked" : sel ? "selected" : "available"}"
                  title="${seatLabel(s)}">${s.seat_number}</button>`;
            }).join("")}
          </div>
          <span class="row-label">${esc(row)}</span>
        </div>`;
    }).join("");

    const booked = seats.filter((s) => s.status === "BOOKED").length;
    const pct = Math.round((booked / seats.length) * 100);
    occ.innerHTML = `
      <div class="occ-num"><b>${seats.length - booked}</b> of ${seats.length} seats free</div>
      <div class="bar"><span style="width:${pct}%"></span></div>
      <div class="muted small">${pct}% occupied</div>`;
  }

  function drawSummary() {
    const user = currentUser();
    const picked = seats.filter((s) => selected.has(s.seat_id));
    const total = picked.length * price;
    summary.innerHTML = `
      <h2 class="section-title">Your selection</h2>
      <div class="sel-seats">
        ${picked.length
          ? picked.map((s) => `<span class="seat-tag">${seatLabel(s)}</span>`).join("")
          : `<p class="muted">Tap seats on the map. Up to ${MAX_SEATS} per order.</p>`}
      </div>
      <dl class="totals">
        <div><dt>Seats</dt><dd>${picked.length} × ${money(price)}</dd></div>
        <div class="grand"><dt>Total</dt><dd>${money(total)}</dd></div>
      </dl>
      <p class="muted small">Booking for <b>${esc(user?.name || "—")}</b>${user ? ` · ${esc(user.email)}` : ""}</p>
      <button class="btn primary block" id="bookBtn" ${!picked.length || !user || busy ? "disabled" : ""}>
        ${busy ? "Booking…" : picked.length ? `Confirm ${picked.length} seat${picked.length > 1 ? "s" : ""}` : "Select seats"}
      </button>
      ${picked.length ? `<button class="btn ghost block" id="clearBtn">Clear selection</button>` : ""}
      <p class="fine">All selected seats are booked in a single database transaction — either every seat is reserved or none is.</p>`;

    summary.querySelector("#bookBtn")?.addEventListener("click", book);
    summary.querySelector("#clearBtn")?.addEventListener("click", () => { selected.clear(); drawMap(); drawSummary(); });
  }

  async function refreshSeats() {
    seats = await api.seats(showId);
    // drop any selected seat that someone else took meanwhile
    for (const s of seats) if (s.status === "BOOKED") selected.delete(s.seat_id);
    drawMap();
    drawSummary();
  }

  async function book() {
    const user = currentUser();
    if (!user || !selected.size || busy) return;
    const picked = seats.filter((s) => selected.has(s.seat_id));
    const ok = await confirmDialog({
      title: "Confirm booking",
      body: `${esc(picked.map(seatLabel).join(", "))} for <b>${esc(show.movie)}</b><br/>
             ${fmtDateTime(show.start_time)} · ${esc(show.theatre)}<br/>
             Total <b>${money(picked.length * price)}</b> · booked for ${esc(user.name)}`,
      confirmText: "Book now",
    });
    if (!ok) return;

    busy = true; drawSummary();
    try {
      const res = await api.book(user.user_id, showId, [...selected]);
      toast(`Booking #${res.order_id} confirmed`, "success");
      location.hash = `#/order/${res.order_id}?new=1`;
    } catch (e) {
      busy = false;
      toast(e.message, "error");
      if (e.status === 409) {
        // someone else got there first — the whole order was rolled back
        await refreshSeats().catch(() => {});
      } else {
        drawSummary();
      }
    }
  }

  map.addEventListener("click", (e) => {
    const btn = e.target.closest(".seat");
    if (!btn || btn.disabled) return;
    const id = Number(btn.dataset.id);
    if (selected.has(id)) selected.delete(id);
    else if (selected.size >= MAX_SEATS) return toast(`You can book up to ${MAX_SEATS} seats per order`, "error");
    else selected.add(id);
    drawMap();
    drawSummary();
  });

  // keep the summary in sync when the user is switched in the header
  const onUser = () => { if (!isStale()) drawSummary(); };
  window.addEventListener("cinebook:user", onUser);
  window.addEventListener("hashchange", () => window.removeEventListener("cinebook:user", onUser), { once: true });

  drawMap();
  drawSummary();
}
