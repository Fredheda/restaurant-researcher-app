"""UK Food Standards Agency hygiene ratings (FHRS), free and keyless.

The lookup asks for every establishment at the place's postcode, then picks
the one whose name matches Google's. Google and the FSA spell names
differently ("Koya Soho" vs "KOYA" or "Koya-Ko"), so the match runs in tiers:
exact, then one name a prefix of the other, then the FSA name starting with
Google's first word. An ambiguous tier gives no rating rather than a wrong
one. Hygiene is decoration: every failure returns None, never raises.
"""

import re
from typing import Any, Protocol

import httpx

ESTABLISHMENTS_URL = "https://api.ratings.food.gov.uk/Establishments"
PAGE_SIZE = 100
MIN_PREFIX = 3


class FhrsClient(Protocol):
    async def rating_for(self, name: str, postcode: str | None) -> int | None: ...


def _words(name: str) -> list[str]:
    return re.sub(r"[^a-z0-9]+", " ", name.lower()).split()


def _postcode(value: str) -> str:
    return re.sub(r"\s+", "", value).upper()


def _tier(google: list[str], fsa: list[str]) -> int | None:
    """1 exact, 2 prefix either way, 3 FSA name starts with Google's first word."""
    gs, fs = "".join(google), "".join(fsa)
    if not gs or not fs:
        return None
    if gs == fs:
        return 1
    if min(len(gs), len(fs)) >= MIN_PREFIX and (gs.startswith(fs) or fs.startswith(gs)):
        return 2
    if len(google[0]) >= MIN_PREFIX and fs.startswith(google[0]):
        return 3
    return None


def _rating(value: Any) -> int | None:
    if isinstance(value, str) and value.isdigit() and 0 <= int(value) <= 5:
        return int(value)
    return None


def pick_rating(name: str, postcode: str, establishments: list[dict]) -> int | None:
    google = _words(name)
    wanted = _postcode(postcode)
    best: dict[int, set[int | None]] = {}
    for est in establishments:
        if _postcode(str(est.get("PostCode") or "")) != wanted:
            continue
        tier = _tier(google, _words(str(est.get("BusinessName") or "")))
        if tier is not None:
            best.setdefault(tier, set()).add(_rating(est.get("RatingValue")))
    if not best:
        return None
    ratings = best[min(best)]
    return ratings.pop() if len(ratings) == 1 else None


class HttpFhrsClient:
    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def rating_for(self, name: str, postcode: str | None) -> int | None:
        if not postcode:
            return None
        try:
            response = await self._client.get(
                ESTABLISHMENTS_URL,
                params={"address": postcode, "pageSize": PAGE_SIZE},
                headers={"x-api-version": "2", "accept": "application/json"},
            )
            if response.status_code != 200:
                return None
            establishments = response.json().get("establishments") or []
        except (httpx.HTTPError, ValueError):
            return None
        return pick_rating(name, postcode, establishments)
