from database import get_connection


try:
    with get_connection() as conn:

        with conn.cursor() as cursor:
            cursor.execute("SELECT current_database(), version();")

            result = cursor.fetchone()

            print("Connected successfully!")
            print("Database:", result["current_database"])
            print("PostgreSQL:", result["version"])

except Exception as error:
    print("Connection failed:")
    print(error)