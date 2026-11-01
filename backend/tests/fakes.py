"""Counting fakes for the Places and hygiene clients, shared by the tests."""

import asyncio
from dataclasses import replace

from app.places.google import PlacesError
from app.places.models import GooglePlace, LatLng


def gplace(
    pid: str,
    rating: float | None = 4.5,
    reviews: int | None = 100,
    photo: str | None = None,
    open_now: bool | None = True,
    postcode: str | None = "W1D 4SQ",
) -> GooglePlace:
    return GooglePlace(
        id=pid,
        name=f"Place {pid}",
        address=f"1 Street, London {postcode or ''}".strip(),
        postcode=postcode,
        neighbourhood="Soho",
        lat=51.5,
        lng=-0.13,
        rating=rating,
        review_count=reviews,
        price_tier="££",
        open_now=open_now,
        photo_ref=photo,
        type_label="Ramen restaurant",
        types=("ramen_restaurant", "restaurant"),
    )


class FakePlaces:
    def __init__(self, places: list[GooglePlace] | None = None) -> None:
        self.places = places if places is not None else [gplace("p1")]
        self.search_calls: list[tuple[str, LatLng | None]] = []
        self.photo_calls: list[str] = []
        self.fail = False
        self.delay = 0.0

    async def search_text(self, query: str, origin: LatLng | None):
        self.search_calls.append((query, origin))
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.fail:
            raise PlacesError("text search returned HTTP 500")
        return [replace(p) for p in self.places]

    async def photo_url(self, photo_ref: str, max_width: int = 800) -> str | None:
        self.photo_calls.append(photo_ref)
        return f"https://photos.example/{photo_ref.rsplit('/', 1)[-1]}"


class FakeFhrs:
    def __init__(self, rating: int | None = 5, fail: bool = False) -> None:
        self.rating = rating
        self.fail = fail
        self.calls: list[str] = []

    async def rating_for(self, name: str, postcode: str | None) -> int | None:
        self.calls.append(name)
        if self.fail:
            raise RuntimeError("fhrs down")
        return self.rating
