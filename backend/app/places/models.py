"""Value types shared by the Places, hygiene and cache layers."""

from dataclasses import dataclass


@dataclass(frozen=True)
class LatLng:
    lat: float
    lng: float


@dataclass(frozen=True)
class GooglePlace:
    """One place from Text Search (New), reduced to what the card needs."""

    id: str
    name: str
    address: str
    postcode: str | None
    neighbourhood: str | None
    lat: float | None
    lng: float | None
    rating: float | None
    review_count: int | None
    price_tier: str | None
    open_now: bool | None
    photo_ref: str | None
    type_label: str | None
    types: tuple[str, ...]
