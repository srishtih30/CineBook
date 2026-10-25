from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class BookingRequest(BaseModel):
    user_id: int = Field(gt=0)
    show_id: int = Field(gt=0)

    seat_ids: list[int] = Field(min_length=1, max_length=10)

class MovieCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    genre: str = Field(min_length=1, max_length=50)
    duration_minutes: int = Field(gt=0, le=600)
    language: str = Field(min_length=1, max_length=50)


class ShowCreate(BaseModel):
    movie_id: int = Field(gt=0)
    theatre_id: int = Field(gt=0)
    start_time: datetime
    ticket_price: Decimal = Field(gt=0, max_digits=8, decimal_places=2)
