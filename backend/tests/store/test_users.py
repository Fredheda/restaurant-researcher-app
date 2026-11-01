from datetime import UTC, datetime, timedelta

from app.store.users import InMemoryUserStore, Principal

T0 = datetime(2026, 11, 1, 9, 0, tzinfo=UTC)
ALICE = Principal(id="alice-oid", name="Alice", idp="aad")
BOB = Principal(id="bob-oid", name=None, idp="aad")


class Clock:
    def __init__(self) -> None:
        self.now = T0

    def __call__(self) -> datetime:
        return self.now


async def test_touch_writes_once_per_day() -> None:
    clock = Clock()
    store = InMemoryUserStore(clock=clock)
    await store.touch(ALICE)
    clock.now = T0 + timedelta(hours=5)
    await store.touch(ALICE)
    assert store.writes == 1
    assert store.rows["alice-oid"].last_seen_at == T0

    clock.now = T0 + timedelta(days=1, minutes=1)
    await store.touch(ALICE)
    assert store.writes == 2
    assert store.rows["alice-oid"].last_seen_at == clock.now
    assert store.rows["alice-oid"].created_at == T0


async def test_second_user_is_a_separate_row() -> None:
    store = InMemoryUserStore(clock=Clock())
    await store.touch(ALICE)
    await store.touch(BOB)
    assert set(store.rows) == {"alice-oid", "bob-oid"}
    assert store.rows["alice-oid"].display_name == "Alice"
    assert store.rows["bob-oid"].display_name is None
    assert store.rows["bob-oid"].is_admin is False
