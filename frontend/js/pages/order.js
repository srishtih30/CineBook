/* Order / ticket — GET /bookings/{order_id}, PATCH /bookings/{order_id}/cancel */
import { api } from "../api.js";
import { esc, money, fmtDate, fmtTime, fmtDateTime, seatLabel, statusBadge, toast, loader, confirmDialog } from "../ui.js";

export async function orderPage({ root, args, params, isStale }) {
  const orderId = Number(args[0]);
  root.innerHTML = loader("Loading booking…");

  let order;
  try {
    order = await api.order(orderId);
  } catch (e) {
    if (isStale()) return;
    root.innerHTML = `<div class="empty"><h3>${e.status === 404 ? "Booking not found" : "Could not load booking"}</h3>
      <p>${esc(e.message)}</p><p><a href="#/bookings">Back to my bookings</a></p></div>`;
    return;
  }
  if (isStale()) return;

  const isNew = params.get("new") === "1";
  const cancelled = order.status === "CANCELLED";

  root.innerHTML = `
    <a class="back" href="#/bookings">← My bookings</a>
    ${isNew && !cancelled ? `<div class="banner success">Booking confirmed. Your seats are reserved.</div>` : ""}

    <article class="ticket ${cancelled ? "void" : ""}">
      <div class="ticket-main">
        <div class="ticket-top">
          <span class="eyebrow">Order #${order.order_id}</span>
          ${statusBadge(order.status)}
        </div>
        <h1>${esc(order.movie)}</h1>
        <p class="lede">${esc(order.theatre)}</p>
        <div class="ticket-grid">
          <div><span>Date</span><b>${fmtDate(order.start_time)}</b></div>
          <div><span>Time</span><b>${fmtTime(order.start_time)}</b></div>
          <div><span>Seats</span><b>${order.seats.length}</b></div>
          <div><span>Total</span><b>${money(order.total_amount)}</b></div>
        </div>
        <div class="ticket-seats">
          ${order.seats.map((s) => `
            <span class="seat-tag ${s.status === "CANCELLED" ? "struck" : ""}" title="${money(s.booked_price)}">${seatLabel(s)}</span>`).join("")}
        </div>
      </div>
      <div class="ticket-stub">
        <span class="stub-label">Admit</span>
        <span class="stub-count">${order.seats.length}</span>
        <span class="stub-code mono">CB-${String(order.order_id).padStart(5, "0")}</span>
      </div>
    </article>

    <section class="panel two-col">
      <div>
        <h2 class="section-title">Customer</h2>
        <p><b>${esc(order.customer)}</b><br/><span class="muted">${esc(order.email)}</span></p>
        <p class="muted small">Booked ${fmtDateTime(order.created_at)}</p>
      </div>
      <div>
        <h2 class="section-title">Seat breakdown</h2>
        <table class="table compact">
          <thead><tr><th>Seat</th><th>Status</th><th class="num">Price paid</th></tr></thead>
          <tbody>
            ${order.seats.map((s) => `
              <tr><td class="mono">${seatLabel(s)}</td><td>${statusBadge(s.status)}</td><td class="num">${money(s.booked_price)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>

    <div class="actions">
      ${cancelled
        ? `<p class="muted">This order was cancelled. Its seats are free to book again.</p>`
        : `<button class="btn danger" id="cancelBtn">Cancel this booking</button>`}
      <a class="btn ghost" href="#/">Book another movie</a>
    </div>`;

  root.querySelector("#cancelBtn")?.addEventListener("click", async (e) => {
    const ok = await confirmDialog({
      title: `Cancel order #${order.order_id}?`,
      body: `All ${order.seats.length} seat(s) — ${esc(order.seats.map(seatLabel).join(", "))} — will be released.`,
      confirmText: "Cancel booking",
      danger: true,
    });
    if (!ok) return;
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = "Cancelling…";
    try {
      await api.cancel(order.order_id);
      toast(`Order #${order.order_id} cancelled`, "success");
      location.hash = `#/order/${order.order_id}`;
      if (!isNew) orderPage({ root, args, params: new URLSearchParams(), isStale });
    } catch (err) {
      toast(err.message, "error");
      btn.disabled = false;
      btn.textContent = "Cancel this booking";
    }
  });
}
