import httpx
import pytest

from app.places.fhrs import HttpFhrsClient


def _est(name: str, postcode: str = "W1D 4SQ", rating: str = "5") -> dict:
    return {
        "BusinessName": name,
        "PostCode": postcode,
        "RatingValue": rating,
        "SchemeType": "FHRS",
    }


def _client(establishments: list[dict], seen: list[httpx.Request] | None = None):
    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        return httpx.Response(200, json={"establishments": establishments})

    return HttpFhrsClient(httpx.AsyncClient(transport=httpx.MockTransport(handler)))


async def test_request_queries_by_postcode_with_api_version_header() -> None:
    seen: list[httpx.Request] = []
    await _client([], seen).rating_for("Koya", "W1D 4SQ")
    request = seen[0]
    assert request.url.host == "api.ratings.food.gov.uk"
    assert request.url.path == "/Establishments"
    assert request.url.params["address"] == "W1D 4SQ"
    assert request.headers["x-api-version"] == "2"
    assert request.headers["accept"] == "application/json"


async def test_exact_name_and_postcode_match_returns_rating() -> None:
    client = _client([_est("Other Place", rating="3"), _est("Koya", rating="4")])
    assert await client.rating_for("Koya", "W1D 4SQ") == 4


async def test_name_match_ignores_case_and_punctuation() -> None:
    client = _client([_est("KOYA", rating="5")])
    assert await client.rating_for("Koya Soho", "w1d 4sq") == 5


async def test_branch_suffix_still_matches() -> None:
    client = _client([_est("Koya-Ko", rating="5")])
    assert await client.rating_for("Koya Soho", "W1D 4SQ") == 5


async def test_exact_match_wins_over_prefix_match() -> None:
    client = _client([_est("Koya Bar", rating="2"), _est("Koya Soho", rating="5")])
    assert await client.rating_for("Koya Soho", "W1D 4SQ") == 5


async def test_other_postcode_does_not_match() -> None:
    client = _client([_est("Koya", postcode="E14 5AB")])
    assert await client.rating_for("Koya", "W1D 4SQ") is None


async def test_no_match_returns_none() -> None:
    client = _client([_est("Bao Soho")])
    assert await client.rating_for("Koya", "W1D 4SQ") is None


async def test_ambiguous_match_returns_none() -> None:
    client = _client([_est("Koya One", rating="5"), _est("Koya Two", rating="2")])
    assert await client.rating_for("Koya", "W1D 4SQ") is None


@pytest.mark.parametrize("value", ["Exempt", "AwaitingInspection", "Pass"])
async def test_non_numeric_rating_returns_none(value: str) -> None:
    client = _client([_est("Koya", rating=value)])
    assert await client.rating_for("Koya", "W1D 4SQ") is None


async def test_missing_postcode_makes_no_call() -> None:
    seen: list[httpx.Request] = []
    assert await _client([_est("Koya")], seen).rating_for("Koya", None) is None
    assert seen == []


@pytest.mark.parametrize(
    "response", [httpx.Response(500), httpx.Response(200, text="not json")]
)
async def test_http_error_returns_none(response: httpx.Response) -> None:
    client = HttpFhrsClient(
        httpx.AsyncClient(transport=httpx.MockTransport(lambda r: response))
    )
    assert await client.rating_for("Koya", "W1D 4SQ") is None


async def test_network_error_returns_none() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("slow")

    client = HttpFhrsClient(httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    assert await client.rating_for("Koya", "W1D 4SQ") is None
