from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from database import get_connection
from schemas import BookingRequest, MovieCreate, ShowCreate

from psycopg import errors

app = FastAPI(
    title="CineBook API",
    description="Movie Ticket Booking and Database Management System",
    version="1.0.0"
)

# Allow the HTML/CSS/JS frontend (served on another port) to call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {
        "message": "Welcome to CineBook API",
        "status": "running"
    }


@app.get("/movies")
def get_movies():

    try:
        with get_connection() as conn:

            with conn.cursor() as cursor:

                cursor.execute("""
                    SELECT
                        movie_id,
                        title,
                        genre,
                        duration_minutes,
                        language
                    FROM movies
                    ORDER BY movie_id;
                """)

                movies = cursor.fetchall()

                return movies

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve movies"
        )

@app.get("/shows")
def get_shows():

    try:
        with get_connection() as conn:

            with conn.cursor() as cursor:

                cursor.execute("""
                    SELECT
                        sh.show_id,
                        m.movie_id,
                        m.title AS movie,
                        t.name AS theatre,
                        t.location,
                        sh.start_time,
                        sh.ticket_price
                    FROM shows sh
                    JOIN movies m
                        ON sh.movie_id = m.movie_id
                    JOIN theatres t
                        ON sh.theatre_id = t.theatre_id
                    ORDER BY sh.start_time;
                """)

                return cursor.fetchall()

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve shows"
        )

@app.get("/shows/{show_id}/seats")
def get_show_seats(show_id: int):

    try:
        with get_connection() as conn:

            with conn.cursor() as cursor:

                cursor.execute("""
                    SELECT
                        s.seat_id,
                        s.row_label,
                        s.seat_number,

                        CASE
                            WHEN b.booking_id IS NULL
                                THEN 'AVAILABLE'
                            ELSE 'BOOKED'
                        END AS status

                    FROM shows sh

                    JOIN seats s
                        ON sh.theatre_id = s.theatre_id

                    LEFT JOIN bookings b
                        ON b.show_id = sh.show_id
                        AND b.seat_id = s.seat_id
                        AND b.status = 'CONFIRMED'

                    WHERE sh.show_id = %s

                    ORDER BY
                        s.row_label,
                        s.seat_number;
                """, (show_id,))

                return cursor.fetchall()

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve seats"
        )

@app.post("/bookings", status_code=201)
def create_booking(request: BookingRequest):

    # Reject duplicate seat IDs
    if len(request.seat_ids) != len(set(request.seat_ids)):
        raise HTTPException(
            status_code=400,
            detail="Duplicate seat IDs are not allowed"
        )

    try:
        with get_connection() as conn:

            with conn.cursor() as cursor:

                # STEP 1: Lock the selected show
                cursor.execute("""
                    SELECT
                        show_id,
                        theatre_id,
                        ticket_price
                    FROM shows
                    WHERE show_id = %s
                    FOR UPDATE;
                """, (request.show_id,))

                show = cursor.fetchone()

                if not show:
                    raise HTTPException(
                        status_code=404,
                        detail="Show not found"
                    )

                theatre_id = show["theatre_id"]
                ticket_price = show["ticket_price"]

                # STEP 2: Validate the user
                cursor.execute("""
                    SELECT user_id
                    FROM users
                    WHERE user_id = %s;
                """, (request.user_id,))

                if cursor.fetchone() is None:
                    raise HTTPException(
                        status_code=404,
                        detail="User not found"
                    )

                # STEP 3: Validate selected seats
                cursor.execute("""
                    SELECT seat_id
                    FROM seats
                    WHERE theatre_id = %s
                      AND seat_id = ANY(%s);
                """, (
                    theatre_id,
                    request.seat_ids
                ))

                valid_seats = cursor.fetchall()

                if len(valid_seats) != len(request.seat_ids):
                    raise HTTPException(
                        status_code=400,
                        detail="Some seats do not belong to this theatre"
                    )

                # STEP 4: Check existing reservations
                cursor.execute("""
                    SELECT seat_id
                    FROM bookings
                    WHERE show_id = %s
                      AND seat_id = ANY(%s)
                      AND status = 'CONFIRMED';
                """, (
                    request.show_id,
                    request.seat_ids
                ))

                booked_seats = cursor.fetchall()

                if booked_seats:
                    raise HTTPException(
                        status_code=409,
                        detail="One or more selected seats are already booked"
                    )

                # STEP 5: Calculate total
                total_amount = (
                    ticket_price * len(request.seat_ids)
                )

                # STEP 6: Create booking order
                cursor.execute("""
                    INSERT INTO booking_orders (
                        user_id,
                        show_id,
                        total_amount,
                        status
                    )
                    VALUES (%s, %s, %s, 'CONFIRMED')
                    RETURNING order_id;
                """, (
                    request.user_id,
                    request.show_id,
                    total_amount
                ))

                order_id = cursor.fetchone()["order_id"]

                # STEP 7: Insert individual seat bookings
                for seat_id in request.seat_ids:

                    cursor.execute("""
                        INSERT INTO bookings (
                            order_id,
                            show_id,
                            theatre_id,
                            seat_id,
                            status,
                            booked_price
                        )
                        VALUES (
                            %s, %s, %s, %s,
                            'CONFIRMED', %s
                        );
                    """, (
                        order_id,
                        request.show_id,
                        theatre_id,
                        seat_id,
                        ticket_price
                    ))

                # The connection context manager
                # commits when the block exits successfully.

        return {
            "message": "Booking confirmed successfully",
            "order_id": order_id,
            "show_id": request.show_id,
            "seat_ids": request.seat_ids,
            "total_amount": float(total_amount),
            "status": "CONFIRMED"
        }

    except HTTPException:
        raise

    except errors.UniqueViolation:
        raise HTTPException(
            status_code=409,
            detail="Selected seat is already booked"
        )

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Booking failed due to a database error"
        )

@app.get("/bookings/{order_id}")
def get_booking(order_id: int):

    with get_connection() as conn:

        with conn.cursor() as cursor:

            cursor.execute("""
                SELECT
                    bo.order_id,
                    u.name AS customer,
                    u.email,
                    m.title AS movie,
                    t.name AS theatre,
                    sh.start_time,
                    bo.total_amount,
                    bo.status,
                    bo.created_at

                FROM booking_orders bo

                JOIN users u
                    ON bo.user_id = u.user_id

                JOIN shows sh
                    ON bo.show_id = sh.show_id

                JOIN movies m
                    ON sh.movie_id = m.movie_id

                JOIN theatres t
                    ON sh.theatre_id = t.theatre_id

                WHERE bo.order_id = %s;
            """, (order_id,))

            order = cursor.fetchone()

            if not order:
                raise HTTPException(
                    status_code=404,
                    detail="Booking not found"
                )

            cursor.execute("""
                SELECT
                    s.seat_id,
                    s.row_label,
                    s.seat_number,
                    b.booked_price,
                    b.status

                FROM bookings b

                JOIN seats s
                    ON b.seat_id = s.seat_id

                WHERE b.order_id = %s

                ORDER BY
                    s.row_label,
                    s.seat_number;
            """, (order_id,))

            seats = cursor.fetchall()

            order["seats"] = seats

            return order

@app.patch("/bookings/{order_id}/cancel")
def cancel_booking(order_id: int):

    try:
        with get_connection() as conn:

            with conn.cursor() as cursor:

                # Read the show's ID first
                cursor.execute("""
                    SELECT show_id
                    FROM booking_orders
                    WHERE order_id = %s;
                """, (order_id,))

                result = cursor.fetchone()

                if not result:
                    raise HTTPException(
                        status_code=404,
                        detail="Booking not found"
                    )

                # Lock show first
                cursor.execute("""
                    SELECT show_id
                    FROM shows
                    WHERE show_id = %s
                    FOR UPDATE;
                """, (result["show_id"],))

                # Lock order second
                cursor.execute("""
                    SELECT order_id, status
                    FROM booking_orders
                    WHERE order_id = %s
                    FOR UPDATE;
                """, (order_id,))

                order = cursor.fetchone()

                if order["status"] == "CANCELLED":
                    raise HTTPException(
                        status_code=400,
                        detail="Booking is already cancelled"
                    )

                # Cancel all individual seats
                cursor.execute("""
                    UPDATE bookings
                    SET status = 'CANCELLED'
                    WHERE order_id = %s
                      AND status = 'CONFIRMED';
                """, (order_id,))

                # Cancel parent order
                cursor.execute("""
                    UPDATE booking_orders
                    SET status = 'CANCELLED'
                    WHERE order_id = %s;
                """, (order_id,))

        return {
            "message": "Booking cancelled successfully",
            "order_id": order_id,
            "status": "CANCELLED"
        }

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Unable to cancel booking"
        )

@app.get("/admin/stats")
def get_admin_stats():

    with get_connection() as conn:

        with conn.cursor() as cursor:

            cursor.execute("""
                SELECT
                    (SELECT COUNT(*)
                     FROM users) AS total_users,

                    (SELECT COUNT(*)
                     FROM movies) AS total_movies,

                    (SELECT COUNT(*)
                     FROM booking_orders) AS total_orders,

                    (SELECT COUNT(*)
                     FROM booking_orders
                     WHERE status = 'CONFIRMED')
                     AS confirmed_orders,

                    (SELECT COUNT(*)
                     FROM bookings
                     WHERE status = 'CONFIRMED')
                     AS confirmed_tickets,

                    (SELECT COALESCE(
                        SUM(booked_price), 0
                     )
                     FROM bookings
                     WHERE status = 'CONFIRMED')
                     AS active_booking_value;
            """)

            return cursor.fetchone()

@app.get("/users")
def get_users():

    with get_connection() as conn:

        with conn.cursor() as cursor:

            cursor.execute("""
                SELECT
                    user_id,
                    name,
                    email
                FROM users
                ORDER BY user_id;
            """)

            return cursor.fetchall()

# =====================================================================
#  Added endpoints: history, order list, reports, catalogue management
# =====================================================================

# One row per booking order, with its seats aggregated into a JSON array.
ORDER_SUMMARY_SQL = """
    SELECT
        bo.order_id,
        bo.user_id,
        u.name AS customer,
        u.email,
        bo.show_id,
        m.title AS movie,
        t.name AS theatre,
        t.location,
        sh.start_time,
        bo.total_amount,
        bo.status,
        bo.created_at,
        COALESCE(
            json_agg(
                json_build_object(
                    'seat_id', s.seat_id,
                    'row_label', s.row_label,
                    'seat_number', s.seat_number,
                    'booked_price', b.booked_price,
                    'status', b.status
                )
                ORDER BY s.row_label, s.seat_number
            ) FILTER (WHERE b.booking_id IS NOT NULL),
            '[]'
        ) AS seats

    FROM booking_orders bo
    JOIN users u     ON bo.user_id = u.user_id
    JOIN shows sh    ON bo.show_id = sh.show_id
    JOIN movies m    ON sh.movie_id = m.movie_id
    JOIN theatres t  ON sh.theatre_id = t.theatre_id
    LEFT JOIN bookings b ON b.order_id = bo.order_id
    LEFT JOIN seats s    ON b.seat_id = s.seat_id
"""

ORDER_SUMMARY_GROUP = """
    GROUP BY
        bo.order_id, u.user_id, sh.show_id, m.movie_id, t.theatre_id
    ORDER BY bo.order_id DESC
"""


@app.get("/movies/{movie_id}/shows")
def get_movie_shows(movie_id: int):

    try:
        with get_connection() as conn:

            with conn.cursor() as cursor:

                cursor.execute(
                    "SELECT movie_id FROM movies WHERE movie_id = %s;",
                    (movie_id,)
                )

                if cursor.fetchone() is None:
                    raise HTTPException(
                        status_code=404,
                        detail="Movie not found"
                    )

                cursor.execute("""
                    SELECT
                        sh.show_id,
                        m.movie_id,
                        m.title AS movie,
                        t.name AS theatre,
                        t.location,
                        sh.start_time,
                        sh.ticket_price
                    FROM shows sh
                    JOIN movies m   ON sh.movie_id = m.movie_id
                    JOIN theatres t ON sh.theatre_id = t.theatre_id
                    WHERE sh.movie_id = %s
                    ORDER BY sh.start_time;
                """, (movie_id,))

                return cursor.fetchall()

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve shows for this movie"
        )


@app.get("/users/{user_id}/bookings")
def get_user_bookings(user_id: int):

    try:
        with get_connection() as conn:

            with conn.cursor() as cursor:

                cursor.execute(
                    "SELECT user_id FROM users WHERE user_id = %s;",
                    (user_id,)
                )

                if cursor.fetchone() is None:
                    raise HTTPException(
                        status_code=404,
                        detail="User not found"
                    )

                cursor.execute(
                    ORDER_SUMMARY_SQL
                    + " WHERE bo.user_id = %s "
                    + ORDER_SUMMARY_GROUP,
                    (user_id,)
                )

                return cursor.fetchall()

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve booking history"
        )


@app.get("/orders")
def get_all_orders():

    try:
        with get_connection() as conn:

            with conn.cursor() as cursor:

                cursor.execute(ORDER_SUMMARY_SQL + ORDER_SUMMARY_GROUP)

                return cursor.fetchall()

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve booking orders"
        )


@app.get("/theatres")
def get_theatres():

    try:
        with get_connection() as conn:

            with conn.cursor() as cursor:

                cursor.execute("""
                    SELECT
                        t.theatre_id,
                        t.name,
                        t.location,
                        COUNT(s.seat_id) AS total_seats
                    FROM theatres t
                    LEFT JOIN seats s
                        ON s.theatre_id = t.theatre_id
                    GROUP BY t.theatre_id
                    ORDER BY t.theatre_id;
                """)

                return cursor.fetchall()

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve theatres"
        )


@app.get("/admin/reports")
def get_admin_reports():

    try:
        with get_connection() as conn:

            with conn.cursor() as cursor:

                # Seat occupancy and confirmed value per show
                cursor.execute("""
                    SELECT
                        sh.show_id,
                        m.movie_id,
                        m.title AS movie,
                        t.name AS theatre,
                        t.location,
                        sh.start_time,
                        sh.ticket_price,

                        (SELECT COUNT(*)
                         FROM seats s
                         WHERE s.theatre_id = sh.theatre_id)
                         AS total_seats,

                        COUNT(b.booking_id) AS booked_seats,

                        COALESCE(SUM(b.booked_price), 0)
                         AS confirmed_value

                    FROM shows sh
                    JOIN movies m   ON sh.movie_id = m.movie_id
                    JOIN theatres t ON sh.theatre_id = t.theatre_id
                    LEFT JOIN bookings b
                        ON b.show_id = sh.show_id
                        AND b.status = 'CONFIRMED'

                    GROUP BY sh.show_id, m.movie_id, t.theatre_id
                    ORDER BY sh.start_time;
                """)
                shows = cursor.fetchall()

                # Popularity and value per movie
                cursor.execute("""
                    SELECT
                        m.movie_id,
                        m.title,
                        COUNT(DISTINCT sh.show_id) AS shows,

                        COUNT(b.booking_id)
                            FILTER (WHERE b.status = 'CONFIRMED')
                            AS confirmed_seats,

                        COUNT(b.booking_id)
                            FILTER (WHERE b.status = 'CANCELLED')
                            AS cancelled_seats,

                        COALESCE(
                            SUM(b.booked_price)
                                FILTER (WHERE b.status = 'CONFIRMED'),
                            0
                        ) AS confirmed_value

                    FROM movies m
                    LEFT JOIN shows sh   ON sh.movie_id = m.movie_id
                    LEFT JOIN bookings b ON b.show_id = sh.show_id

                    GROUP BY m.movie_id
                    ORDER BY confirmed_seats DESC, confirmed_value DESC;
                """)
                movies = cursor.fetchall()

                # Capacity, occupancy and value per theatre
                cursor.execute("""
                    SELECT
                        t.theatre_id,
                        t.name,
                        t.location,
                        COUNT(DISTINCT sh.show_id) AS shows,

                        COUNT(DISTINCT sh.show_id)
                          * (SELECT COUNT(*)
                             FROM seats s
                             WHERE s.theatre_id = t.theatre_id)
                          AS total_capacity,

                        COUNT(b.booking_id) AS booked_seats,

                        COALESCE(SUM(b.booked_price), 0)
                          AS confirmed_value

                    FROM theatres t
                    LEFT JOIN shows sh
                        ON sh.theatre_id = t.theatre_id
                    LEFT JOIN bookings b
                        ON b.show_id = sh.show_id
                        AND b.status = 'CONFIRMED'

                    GROUP BY t.theatre_id
                    ORDER BY t.theatre_id;
                """)
                theatres = cursor.fetchall()

                return {
                    "shows": shows,
                    "movies": movies,
                    "theatres": theatres
                }

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Unable to generate reports"
        )


@app.post("/movies", status_code=201)
def create_movie(request: MovieCreate):

    try:
        with get_connection() as conn:

            with conn.cursor() as cursor:

                cursor.execute("""
                    INSERT INTO movies (
                        title,
                        genre,
                        duration_minutes,
                        language
                    )
                    VALUES (%s, %s, %s, %s)
                    RETURNING
                        movie_id,
                        title,
                        genre,
                        duration_minutes,
                        language;
                """, (
                    request.title.strip(),
                    request.genre.strip(),
                    request.duration_minutes,
                    request.language.strip()
                ))

                return cursor.fetchone()

    except errors.UniqueViolation:
        raise HTTPException(
            status_code=409,
            detail="A movie with these details already exists"
        )

    except errors.CheckViolation:
        raise HTTPException(
            status_code=400,
            detail="Movie details violate a database constraint"
        )

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Unable to add movie"
        )


@app.post("/shows", status_code=201)
def create_show(request: ShowCreate):

    try:
        with get_connection() as conn:

            with conn.cursor() as cursor:

                # Lock the theatre so two admins cannot schedule
                # overlapping shows in the same hall at once.
                cursor.execute("""
                    SELECT theatre_id, name
                    FROM theatres
                    WHERE theatre_id = %s
                    FOR UPDATE;
                """, (request.theatre_id,))

                if cursor.fetchone() is None:
                    raise HTTPException(
                        status_code=404,
                        detail="Theatre not found"
                    )

                cursor.execute("""
                    SELECT duration_minutes
                    FROM movies
                    WHERE movie_id = %s;
                """, (request.movie_id,))

                movie = cursor.fetchone()

                if movie is None:
                    raise HTTPException(
                        status_code=404,
                        detail="Movie not found"
                    )

                # Reject a show that overlaps another show in the same theatre
                cursor.execute("""
                    SELECT sh.show_id, m.title, sh.start_time
                    FROM shows sh
                    JOIN movies m ON sh.movie_id = m.movie_id
                    WHERE sh.theatre_id = %s
                      AND sh.start_time
                          < %s + make_interval(mins => %s)
                      AND %s
                          < sh.start_time
                            + make_interval(mins => m.duration_minutes)
                    LIMIT 1;
                """, (
                    request.theatre_id,
                    request.start_time,
                    movie["duration_minutes"],
                    request.start_time
                ))

                clash = cursor.fetchone()

                if clash:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            f"Overlaps show #{clash['show_id']} "
                            f"({clash['title']}) at "
                            f"{clash['start_time']:%d %b %H:%M} "
                            f"in this theatre"
                        )
                    )

                cursor.execute("""
                    INSERT INTO shows (
                        movie_id,
                        theatre_id,
                        start_time,
                        ticket_price
                    )
                    VALUES (%s, %s, %s, %s)
                    RETURNING show_id;
                """, (
                    request.movie_id,
                    request.theatre_id,
                    request.start_time,
                    request.ticket_price
                ))

                show_id = cursor.fetchone()["show_id"]

                cursor.execute("""
                    SELECT
                        sh.show_id,
                        m.movie_id,
                        m.title AS movie,
                        t.name AS theatre,
                        t.location,
                        sh.start_time,
                        sh.ticket_price
                    FROM shows sh
                    JOIN movies m   ON sh.movie_id = m.movie_id
                    JOIN theatres t ON sh.theatre_id = t.theatre_id
                    WHERE sh.show_id = %s;
                """, (show_id,))

                return cursor.fetchone()

    except HTTPException:
        raise

    except errors.CheckViolation:
        raise HTTPException(
            status_code=400,
            detail="Show details violate a database constraint"
        )

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Unable to add show"
        )
