import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.database import get_db
from app.main import app as fastapi_app
from app.models.calendar_group import CalendarGroup

TEST_DATABASE_URL = settings.DATABASE_URL.replace("family_schedule", "family_schedule_test")


async def _get_test_db_session() -> AsyncSession:
    """Get a fresh session for direct DB manipulation in tests."""
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return session_maker(), engine


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

async def _create_group(client, headers, name="Test Group"):
    resp = await client.post(
        "/api/groups",
        json={"name": name},
        headers=headers,
    )
    return resp


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

async def test_create_group(client, user_a):
    _, headers = user_a
    resp = await _create_group(client, headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Group"
    assert data["my_role"] == "creator"
    assert data["member_count"] == 1
    assert data["invite_code"] != ""


async def test_create_group_limit(client, user_a):
    _, headers = user_a
    for i in range(3):
        r = await _create_group(client, headers, name=f"Group {i}")
        assert r.status_code == 201

    resp = await _create_group(client, headers, name="Group 4")
    assert resp.status_code == 403
    assert "上限" in resp.json()["detail"]


async def test_list_groups(client, user_a):
    _, headers = user_a
    await _create_group(client, headers, name="Group A")
    await _create_group(client, headers, name="Group B")

    resp = await client.get("/api/groups", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


async def test_get_group_detail(client, user_a):
    _, headers = user_a
    create_resp = await _create_group(client, headers)
    group_id = create_resp.json()["id"]

    resp = await client.get(f"/api/groups/{group_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Test Group"
    assert len(data["members"]) == 1
    assert data["members"][0]["role"] == "creator"


async def test_get_group_not_member(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b

    create_resp = await _create_group(client, headers_a)
    group_id = create_resp.json()["id"]

    resp = await client.get(f"/api/groups/{group_id}", headers=headers_b)
    assert resp.status_code == 403


async def test_update_group(client, user_a):
    _, headers = user_a
    create_resp = await _create_group(client, headers)
    group_id = create_resp.json()["id"]

    resp = await client.put(
        f"/api/groups/{group_id}",
        json={"name": "Updated Name"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Name"


async def test_update_group_no_permission(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b

    create_resp = await _create_group(client, headers_a)
    group_id = create_resp.json()["id"]
    invite_code = create_resp.json()["invite_code"]

    # user_b joins as member
    await client.post(
        f"/api/groups/{group_id}/join",
        json={"invite_code": invite_code},
        headers=headers_b,
    )

    resp = await client.put(
        f"/api/groups/{group_id}",
        json={"name": "Hacked Name"},
        headers=headers_b,
    )
    assert resp.status_code == 403


async def test_delete_group(client, user_a):
    _, headers = user_a
    create_resp = await _create_group(client, headers)
    group_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/groups/{group_id}", headers=headers)
    assert resp.status_code == 204

    list_resp = await client.get("/api/groups", headers=headers)
    assert len(list_resp.json()) == 0


async def test_delete_group_not_creator(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b

    create_resp = await _create_group(client, headers_a)
    group_id = create_resp.json()["id"]
    invite_code = create_resp.json()["invite_code"]

    # user_b joins
    await client.post(
        f"/api/groups/{group_id}/join",
        json={"invite_code": invite_code},
        headers=headers_b,
    )

    resp = await client.delete(f"/api/groups/{group_id}", headers=headers_b)
    assert resp.status_code == 403


async def test_join_group(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b

    create_resp = await _create_group(client, headers_a)
    group_id = create_resp.json()["id"]
    invite_code = create_resp.json()["invite_code"]

    resp = await client.post(
        f"/api/groups/{group_id}/join",
        json={"invite_code": invite_code},
        headers=headers_b,
    )
    assert resp.status_code == 200

    detail_resp = await client.get(f"/api/groups/{group_id}", headers=headers_a)
    assert detail_resp.json()["member_count"] == 2


async def test_join_group_wrong_code(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b

    create_resp = await _create_group(client, headers_a)
    group_id = create_resp.json()["id"]

    resp = await client.post(
        f"/api/groups/{group_id}/join",
        json={"invite_code": "WRONGCODE"},
        headers=headers_b,
    )
    assert resp.status_code == 400


async def test_join_group_already_member(client, user_a):
    _, headers = user_a
    create_resp = await _create_group(client, headers)
    group_id = create_resp.json()["id"]
    invite_code = create_resp.json()["invite_code"]

    resp = await client.post(
        f"/api/groups/{group_id}/join",
        json={"invite_code": invite_code},
        headers=headers,
    )
    assert resp.status_code == 409


async def test_join_group_full(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b

    create_resp = await _create_group(client, headers_a)
    group_id = create_resp.json()["id"]
    invite_code = create_resp.json()["invite_code"]

    # Directly manipulate the DB to set max_members=1
    async for db in fastapi_app.dependency_overrides[get_db]():
        result = await db.execute(
            select(CalendarGroup).where(CalendarGroup.id == group_id)
        )
        group = result.scalar_one()
        group.max_members = 1
        await db.commit()

    resp = await client.post(
        f"/api/groups/{group_id}/join",
        json={"invite_code": invite_code},
        headers=headers_b,
    )
    assert resp.status_code == 403
    assert "已满" in resp.json()["detail"]


async def test_remove_member(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b

    create_resp = await _create_group(client, headers_a)
    group_id = create_resp.json()["id"]
    invite_code = create_resp.json()["invite_code"]

    await client.post(
        f"/api/groups/{group_id}/join",
        json={"invite_code": invite_code},
        headers=headers_b,
    )

    # Get user_b's UUID
    me_resp = await client.get("/api/users/me", headers=headers_b)
    user_b_id = me_resp.json()["id"]

    resp = await client.delete(
        f"/api/groups/{group_id}/members/{user_b_id}",
        headers=headers_a,
    )
    assert resp.status_code == 204


async def test_remove_self(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b

    create_resp = await _create_group(client, headers_a)
    group_id = create_resp.json()["id"]
    invite_code = create_resp.json()["invite_code"]

    await client.post(
        f"/api/groups/{group_id}/join",
        json={"invite_code": invite_code},
        headers=headers_b,
    )

    # Get user_b's UUID
    me_resp = await client.get("/api/users/me", headers=headers_b)
    user_b_id = me_resp.json()["id"]

    # user_b removes themselves
    resp = await client.delete(
        f"/api/groups/{group_id}/members/{user_b_id}",
        headers=headers_b,
    )
    assert resp.status_code == 204


async def test_remove_creator(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b

    create_resp = await _create_group(client, headers_a)
    group_id = create_resp.json()["id"]
    invite_code = create_resp.json()["invite_code"]

    await client.post(
        f"/api/groups/{group_id}/join",
        json={"invite_code": invite_code},
        headers=headers_b,
    )

    # Get user_a's UUID (creator)
    me_resp = await client.get("/api/users/me", headers=headers_a)
    user_a_id = me_resp.json()["id"]

    # user_b tries to remove creator
    resp = await client.delete(
        f"/api/groups/{group_id}/members/{user_a_id}",
        headers=headers_b,
    )
    assert resp.status_code == 403


async def test_join_group_by_code(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b
    create_resp = await client.post(
        "/api/groups", json={"name": "邀请码组"}, headers=headers_a
    )
    invite_code = create_resp.json()["invite_code"]
    resp = await client.post(
        "/api/groups/join",
        json={"invite_code": invite_code},
        headers=headers_b,
    )
    assert resp.status_code == 200
    assert "group_id" in resp.json()


async def test_join_group_by_code_invalid(client, user_a):
    _, headers = user_a
    resp = await client.post(
        "/api/groups/join",
        json={"invite_code": "INVALID"},
        headers=headers,
    )
    assert resp.status_code == 400
