/*
 * api.js — every call the frontend makes to the FastAPI backend.
 *
 *   GET   /                          health check
 *   GET   /movies                    movie catalogue
 *   POST  /movies                    add a movie            (admin)
 *   GET   /movies/{id}/shows         shows for one movie
 *   GET   /shows                     all shows
 *   POST  /shows                     schedule a show        (admin)
 *   GET   /shows/{id}/seats          seat map with AVAILABLE / BOOKED
 *   GET   /theatres                  theatres + seat counts
 *   GET   /users                     demo users
 *   GET   /users/{id}/bookings       one user's booking history
 *   POST  /bookings                  atomic multi-seat booking
 *   GET   /bookings/{order_id}       one order + its seats
 *   PATCH /bookings/{order_id}/cancel
 *   GET   /orders                    all booking orders     (admin)
 *   GET   /admin/stats               headline counts
 *   GET   /admin/reports             per-show / movie / theatre reports
 */

// FastAPI runs on port 8000 on the same machine. CORS is enabled in main.py,
// so the page can call it directly. Override by setting
// window.CINEBOOK_API_BASE before app.js loads.
const host = !location.hostname || location.hostname === "localhost" ? "127.0.0.1" : location.hostname;
const BASE = (window.CINEBOOK_API_BASE || `http://${host}:8000`).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function readDetail(body, status) {
  if (!body) return `Request failed (${status})`;
  const d = body.detail;
  if (typeof d === "string") return d;
  // FastAPI/Pydantic validation errors (422) come back as a list
  if (Array.isArray(d)) {
    return d.map((e) => `${(e.loc || []).slice(1).join(".")}: ${e.msg}`).join("; ");
  }
  return `Request failed (${status})`;
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch {
    throw new ApiError(`Cannot reach the CineBook API at ${BASE}. Is uvicorn running?`, 0);
  }

  let body = null;
  const text = await res.text();
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }

  if (!res.ok) throw new ApiError(readDetail(body, res.status), res.status);
  return body;
}

const post = (path, data) => request(path, { method: "POST", body: JSON.stringify(data) });

export const api = {
  health: () => request("/"),

  movies: () => request("/movies"),
  movieShows: (movieId) => request(`/movies/${movieId}/shows`),
  addMovie: (movie) => post("/movies", movie),

  shows: () => request("/shows"),
  seats: (showId) => request(`/shows/${showId}/seats`),
  addShow: (show) => post("/shows", show),

  theatres: () => request("/theatres"),
  users: () => request("/users"),
  userBookings: (userId) => request(`/users/${userId}/bookings`),

  book: (userId, showId, seatIds) =>
    post("/bookings", { user_id: userId, show_id: showId, seat_ids: seatIds }),
  order: (orderId) => request(`/bookings/${orderId}`),
  cancel: (orderId) => request(`/bookings/${orderId}/cancel`, { method: "PATCH" }),

  orders: () => request("/orders"),
  stats: () => request("/admin/stats"),
  reports: () => request("/admin/reports"),
};
