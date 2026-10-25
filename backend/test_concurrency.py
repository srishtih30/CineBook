import concurrent.futures
import requests


URL = "http://127.0.0.1:8000/bookings"

PAYLOADS = [
    {
        "user_id": 1,
        "show_id": 4,
        "seat_ids": [3]
    },
    {
        "user_id": 2,
        "show_id": 4,
        "seat_ids": [3]
    }
]


def attempt_booking(payload):
    response = requests.post(
        URL,
        json=payload,
        timeout=15
    )

    return {
        "user_id": payload["user_id"],
        "status_code": response.status_code,
        "response": response.json()
    }


with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:

    results = list(
        executor.map(attempt_booking, PAYLOADS)
    )

for result in results:
    print(result)

