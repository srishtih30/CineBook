/* My bookings — GET /users/{id}/bookings for the user picked in the header */
import { api } from "../api.js";
import { esc, money, fmtDateTime, seatLabel, statusBadge, loader, errorBox } from "../ui.js";
import { currentUser } from "../state.js";

export async function bookingsPage({ root, isStale }) {
  const user = currentUser();
  root.innerHTML = `
    <section class="hero slim">
      <p class="eyebrow">Booking history</p>
      <h1>${user ? esc(user.name) : "My bookings"}</h1>
      ${user ? `<p class="lede">${esc(user.email)}</p>` : ""}
    </section>
    <form class="lookup" id="lookup">
      <label for="oid">Find an order by number</label>
      <div class="lookup-row">
        <input id="oid" class="input" type="number" min="1" placeholder="e.g. 12" required />
        <button class="btn ghost">Open</button>
      </div>
    </form>
    <div id="list">${loader("Loading your orders…")}</div>`;

  root.querySelector("#lookup").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = root.querySelector("#oid").value;
    if (v) location.hash = `#/order/${v}`;
  });

  const list = root.querySelector("#list");
  if (!user) { list.innerHTML = `<div class="empty"><h3>No user selected</h3></div>`; return; }

  let mine;
  try { mine = await api.userBookings(user.user_id); }
  catch (e) { if (!isStale()) list.innerHTML = errorBox(e); return; }
  if (isStale()) return;

  let tab = "ALL";

  function draw() {
    const shown = mine.filter((o) => tab === "ALL" || o.status === tab);
    const count = (s) => mine.filter((o) => s === "ALL" || o.status === s).length;
    list.innerHTML = `
      <div class="chips" role="tablist">
        ${["ALL", "CONFIRMED", "CANCELLED"].map((s) => `
          <button class="chip ${tab === s ? "active" : ""}" data-tab="${s}">
            ${s[0] + s.slice(1).toLowerCase()} <span class="count">${count(s)}</span>
          </button>`).join("")}
      </div>
      ${shown.length ? `<div class="order-list">${shown.map(card).join("")}</div>`
        : `<div class="empty"><h3>No ${tab === "ALL" ? "" : tab.toLowerCase() + " "}bookings yet</h3>
           <p><a href="#/">Browse movies</a> to make one.</p></div>`}`;
  }

  list.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (b) { tab = b.dataset.tab; draw(); }
  });
  draw();
}

function card(o) {
  return `
    <a class="order-card ${o.status === "CANCELLED" ? "void" : ""}" href="#/order/${o.order_id}">
      <div class="oc-left">
        <span class="mono muted small">#${o.order_id}</span>
        <h3>${esc(o.movie)}</h3>
        <p class="muted">${esc(o.theatre)} · ${fmtDateTime(o.start_time)}</p>
        <div class="oc-seats">${o.seats.map((s) => `<span class="seat-tag sm">${seatLabel(s)}</span>`).join("")}</div>
      </div>
      <div class="oc-right">
        ${statusBadge(o.status)}
        <b>${money(o.total_amount)}</b>
      </div>
    </a>`;
}
