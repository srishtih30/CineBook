/* ui.js — small helpers for formatting, DOM, toasts and dialogs */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Escape text before putting it inside an HTML template string. */
export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 0,
});
export const money = (n) => inr.format(Number(n) || 0);

const dOpts = { weekday: "short", day: "numeric", month: "short" };
export const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-IN", dOpts);
export const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
export const fmtDateTime = (iso) => `${fmtDate(iso)} · ${fmtTime(iso)}`;
export const dayKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const runtime = (min) => {
  const m = Number(min) || 0;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};

export const seatLabel = (s) => `${s.row_label}${s.seat_number}`;

export function statusBadge(status) {
  const s = String(status || "").toUpperCase();
  const cls = s === "CONFIRMED" ? "ok" : s === "CANCELLED" ? "bad" : "neutral";
  return `<span class="badge ${cls}">${esc(s)}</span>`;
}

/* ----- generated poster (no images in the schema) ----- */
const GENRE_HUES = {
  "sci-fi": 205, scifi: 205, thriller: 265, action: 8, comedy: 42,
  drama: 330, horror: 0, romance: 340, animation: 160, adventure: 28,
};
export function posterStyle(movie) {
  const key = String(movie.genre || "").toLowerCase().trim();
  const hue = GENRE_HUES[key] ?? (Number(movie.movie_id) * 47) % 360;
  return `--h:${hue}`;
}

/* ----- toasts ----- */
export function toast(message, type = "info") {
  const box = $("#toasts");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.classList.add("out"), 3800);
  setTimeout(() => el.remove(), 4300);
}

/* ----- confirm dialog (returns a Promise<boolean>) ----- */
export function confirmDialog({ title, body, confirmText = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    const root = $("#modalRoot");
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="mTitle">
          <h3 id="mTitle">${esc(title)}</h3>
          <p>${body}</p>
          <div class="modal-actions">
            <button class="btn ghost" data-act="no">Keep it</button>
            <button class="btn ${danger ? "danger" : "primary"}" data-act="yes">${esc(confirmText)}</button>
          </div>
        </div>
      </div>`;
    const close = (val) => { root.innerHTML = ""; document.removeEventListener("keydown", onKey); resolve(val); };
    const onKey = (e) => { if (e.key === "Escape") close(false); };
    document.addEventListener("keydown", onKey);
    root.querySelector(".modal-backdrop").addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-backdrop")) close(false);
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act) close(act === "yes");
    });
    root.querySelector('[data-act="yes"]').focus();
  });
}

export function loader(text = "Loading…") {
  return `<div class="loader"><span></span>${esc(text)}</div>`;
}

export function errorBox(err, retry = true) {
  return `
    <div class="empty error">
      <h3>Something went wrong</h3>
      <p>${esc(err?.message || err)}</p>
      ${retry ? `<button class="btn ghost" onclick="location.reload()">Try again</button>` : ""}
    </div>`;
}
