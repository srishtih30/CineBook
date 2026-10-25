# CineBook
CineBook is a compact BookMyShow-style system where demo users browse movies, choose showtimes and seats, make or cancel reservations, and inspect their booking history. 

# CineBook — Frontend

Plain **HTML + CSS + JavaScript** (no frameworks, no build step) for the CineBook
FastAPI backend. The backend is used exactly as it is — nothing in `backend/` was changed.

## How to run

**1. Start the backend**

```bash
cd backend
.venv\Scripts\activate          # Windows
uvicorn main:app --reload       # http://127.0.0.1:8000  (API docs: /docs)
```

**2. Serve the frontend** (second terminal; either command works)

```bash
cd frontend
python -m http.server 5500      # or:  node server.js
```

Open **http://localhost:5500**. The green dot next to the user picker means the API is reachable.

The page calls FastAPI directly at `http://127.0.0.1:8000` (CORS is enabled in `main.py`).
Don't open `index.html` by double-clicking — browsers block JS modules on `file://` pages,
so it must be served by one of the commands above.

## Admin panel

Click **Admin** in the top navigation, or go to **http://localhost:5500/#/admin**.
There is no admin login — the blueprint excludes passwords and sessions for this build.

| Tab | What it shows | Endpoint |
|---|---|---|
| Overview | popular movies, theatre occupancy, busiest shows | `GET /admin/reports` |
| Seat occupancy | booked / total seats and value for every show | `GET /admin/reports` |
| All bookings | every order, with a cancel button | `GET /orders`, `PATCH /bookings/{id}/cancel` |
| Manage catalogue | add a movie, schedule a show, list movies / theatres / users | `POST /movies`, `POST /shows`, `GET /theatres` |

The stat tiles at the top come from `GET /admin/stats`. You can jump straight to a tab with
`#/admin?tab=orders` or `#/admin?tab=manage`.

## Pages and endpoints

| Page | URL | Backend endpoints |
|---|---|---|
| Movies | `#/` | `GET /movies`, `GET /shows` |
| Movie → showtimes | `#/movie/{id}` | `GET /movies/{id}/shows` |
| All showtimes | `#/shows` | `GET /shows` |
| Seat selection + booking | `#/show/{id}` | `GET /shows/{id}/seats`, `POST /bookings` |
| Ticket / order | `#/order/{id}` | `GET /bookings/{id}`, `PATCH /bookings/{id}/cancel` |
| My bookings | `#/bookings` | `GET /users/{id}/bookings` |
| Admin | `#/admin` | see above |

The demo user is picked in the header ("Booking as") from `GET /users`.

## Backend endpoints added

Existing endpoints were not modified. Added to `main.py` / `schemas.py`:

* **CORS middleware** so the browser can call the API from another port.
* `GET /movies/{id}/shows` — shows for one movie (404 if the movie doesn't exist).
* `GET /users/{id}/bookings` — a user's order history, seats aggregated with `json_agg`.
* `GET /orders` — all booking orders (admin).
* `GET /theatres` — theatres with seat counts (`LEFT JOIN … GROUP BY`).
* `GET /admin/reports` — per-show occupancy, per-movie popularity (confirmed vs cancelled
  seats using `COUNT … FILTER`), per-theatre capacity and value.
* `POST /movies` — validated with `MovieCreate` (runtime 1–600 min).
* `POST /shows` — validated with `ShowCreate` (price > 0). Locks the theatre row
  (`SELECT … FOR UPDATE`) and rejects a show that overlaps another in the same theatre,
  using start time + movie runtime → **409**.

## Viva demo script (from the blueprint)

1. Book **A1 + A2** for a show → ticket page shows order, seats and total.
2. Open the same show again → A1, A2 are greyed out (booked).
3. Switch user in the header, select **A2 + A3**, confirm → **409**, nothing is booked
   (rollback), A3 is still free.
4. Open the first order → **Cancel this booking** → seats become available again.
5. **Admin** → stats, occupancy and the order list update.
6. **Admin → Manage catalogue** → add a movie, then schedule a show that overlaps an
   existing one in the same theatre → **409**; move it later → it appears on the Movies page.

## Files

```
frontend/
├── index.html          app shell (header, nav, user picker)
├── server.js           optional static server (Node, no dependencies)
├── css/style.css       all styles
└── js/
    ├── app.js          boot + hash router
    ├── api.js          every fetch() to the backend (API address set here)
    ├── state.js        shared users / movies / shows + selected user
    ├── ui.js           formatting, toasts, confirm dialog
    └── pages/          one file per screen
        ├── movies.js  movie-detail.js  showtimes.js
        ├── seats.js   order.js         bookings.js   admin.js
```
