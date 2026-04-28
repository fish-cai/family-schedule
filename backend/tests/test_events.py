import pytest


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

async def _create_group(client, headers):
    resp = await client.post("/api/groups", json={"name": "测试组"}, headers=headers)
    assert resp.status_code == 201
    return resp.json()


def _event_payload(title="测试事件", start="2026-04-01T09:00:00+08:00",
                   end="2026-04-01T10:00:00+08:00", group_id=None,
                   visibility="public"):
    payload = {
        "title": title,
        "start_time": start,
        "end_time": end,
        "visibility": visibility,
    }
    if group_id is not None:
        payload["group_id"] = group_id
    return payload


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

async def test_create_personal_event(client, user_a):
    _, headers = user_a
    payload = _event_payload()
    resp = await client.post("/api/events", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "测试事件"
    assert data["group_id"] is None


async def test_create_group_event(client, user_a):
    _, headers = user_a
    group = await _create_group(client, headers)
    group_id = group["id"]

    payload = _event_payload(group_id=group_id)
    resp = await client.post("/api/events", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["group_id"] == group_id


async def test_create_shared_personal_event_with_multiple_visible_groups(client, user_a):
    _, headers = user_a
    group_a = await _create_group(client, headers)
    group_b = await _create_group(client, headers)

    payload = _event_payload()
    payload["visible_group_ids"] = [group_a["id"], group_b["id"]]

    resp = await client.post("/api/events", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["group_id"] is None
    assert data["visible_group_ids"] == [group_a["id"], group_b["id"]]

    group_resp = await client.get(
        "/api/events",
        params={
            "start": "2026-04-01T00:00:00+08:00",
            "end": "2026-04-30T23:59:59+08:00",
            "group_id": group_b["id"],
        },
        headers=headers,
    )
    assert group_resp.status_code == 200
    group_events = group_resp.json()
    assert len(group_events) == 1
    assert group_events[0]["title"] == "测试事件"


async def test_create_shared_personal_event_requires_membership(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b
    group = await _create_group(client, headers_a)

    payload = _event_payload()
    payload["visible_group_ids"] = [group["id"]]

    resp = await client.post("/api/events", json=payload, headers=headers_b)
    assert resp.status_code == 403


async def test_create_event_not_member(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b

    group = await _create_group(client, headers_a)
    group_id = group["id"]

    # user_b is not a member — should get 403
    payload = _event_payload(group_id=group_id)
    resp = await client.post("/api/events", json=payload, headers=headers_b)
    assert resp.status_code == 403


async def test_query_events_date_range(client, user_a):
    _, headers = user_a

    # April event
    await client.post("/api/events", json=_event_payload(
        title="April Event",
        start="2026-04-01T09:00:00+08:00",
        end="2026-04-01T10:00:00+08:00",
    ), headers=headers)

    # May event
    await client.post("/api/events", json=_event_payload(
        title="May Event",
        start="2026-05-01T09:00:00+08:00",
        end="2026-05-01T10:00:00+08:00",
    ), headers=headers)

    # Query only April
    resp = await client.get(
        "/api/events",
        params={
            "start": "2026-04-01T00:00:00+08:00",
            "end": "2026-04-30T23:59:59+08:00",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "April Event"


async def test_query_events_group_filter(client, user_a):
    _, headers = user_a

    group = await _create_group(client, headers)
    group_id = group["id"]

    # Group event
    await client.post("/api/events", json=_event_payload(
        title="Group Event",
        group_id=group_id,
    ), headers=headers)

    # Personal event (no group)
    await client.post("/api/events", json=_event_payload(
        title="Personal Event",
    ), headers=headers)

    # Query with group_id filter
    resp = await client.get(
        "/api/events",
        params={
            "start": "2026-04-01T00:00:00+08:00",
            "end": "2026-04-30T23:59:59+08:00",
            "group_id": group_id,
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "Group Event"


async def test_query_events_visibility_public(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b

    group = await _create_group(client, headers_a)
    group_id = group["id"]
    invite_code = group["invite_code"]

    # user_b joins
    await client.post(
        f"/api/groups/{group_id}/join",
        json={"invite_code": invite_code},
        headers=headers_b,
    )

    # user_a creates PUBLIC event
    await client.post("/api/events", json=_event_payload(
        title="Public Event",
        group_id=group_id,
        visibility="public",
    ), headers=headers_a)

    # user_b queries — should see full event
    resp = await client.get(
        "/api/events",
        params={
            "start": "2026-04-01T00:00:00+08:00",
            "end": "2026-04-30T23:59:59+08:00",
            "group_id": group_id,
        },
        headers=headers_b,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "Public Event"


async def test_query_events_visibility_busy(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b

    group = await _create_group(client, headers_a)
    group_id = group["id"]
    invite_code = group["invite_code"]

    # user_b joins
    await client.post(
        f"/api/groups/{group_id}/join",
        json={"invite_code": invite_code},
        headers=headers_b,
    )

    # user_a creates BUSY event
    await client.post("/api/events", json=_event_payload(
        title="Busy Event",
        group_id=group_id,
        visibility="busy",
    ), headers=headers_a)

    # user_b queries — should see masked event
    resp = await client.get(
        "/api/events",
        params={
            "start": "2026-04-01T00:00:00+08:00",
            "end": "2026-04-30T23:59:59+08:00",
            "group_id": group_id,
        },
        headers=headers_b,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "有安排"
    assert data[0]["location"] == ""


async def test_query_events_visibility_private(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b

    group = await _create_group(client, headers_a)
    group_id = group["id"]
    invite_code = group["invite_code"]

    # user_b joins
    await client.post(
        f"/api/groups/{group_id}/join",
        json={"invite_code": invite_code},
        headers=headers_b,
    )

    # user_a creates PRIVATE event
    await client.post("/api/events", json=_event_payload(
        title="Private Event",
        group_id=group_id,
        visibility="private",
    ), headers=headers_a)

    # user_b queries — should see 0 results
    resp = await client.get(
        "/api/events",
        params={
            "start": "2026-04-01T00:00:00+08:00",
            "end": "2026-04-30T23:59:59+08:00",
            "group_id": group_id,
        },
        headers=headers_b,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 0


async def test_get_event_detail(client, user_a):
    _, headers = user_a

    create_resp = await client.post("/api/events", json=_event_payload(title="Detail Test"), headers=headers)
    assert create_resp.status_code == 201
    event_id = create_resp.json()["id"]

    resp = await client.get(f"/api/events/{event_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["title"] == "Detail Test"


async def test_update_event_creator(client, user_a):
    _, headers = user_a

    create_resp = await client.post("/api/events", json=_event_payload(title="Original"), headers=headers)
    assert create_resp.status_code == 201
    event_id = create_resp.json()["id"]

    update_resp = await client.put(
        f"/api/events/{event_id}",
        json={"title": "Updated"},
        headers=headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["title"] == "Updated"


async def test_update_event_group_admin(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b

    group = await _create_group(client, headers_a)
    group_id = group["id"]
    invite_code = group["invite_code"]

    # user_b joins as member
    await client.post(
        f"/api/groups/{group_id}/join",
        json={"invite_code": invite_code},
        headers=headers_b,
    )

    # user_b creates event in group
    create_resp = await client.post("/api/events", json=_event_payload(
        title="Member Event",
        group_id=group_id,
    ), headers=headers_b)
    assert create_resp.status_code == 201
    event_id = create_resp.json()["id"]

    # user_a (group creator/admin) can update
    update_resp = await client.put(
        f"/api/events/{event_id}",
        json={"title": "Admin Updated"},
        headers=headers_a,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["title"] == "Admin Updated"


async def test_update_event_no_permission(client, user_a, user_b):
    _, headers_a = user_a
    _, headers_b = user_b

    group = await _create_group(client, headers_a)
    group_id = group["id"]
    invite_code = group["invite_code"]

    # user_b joins as member
    await client.post(
        f"/api/groups/{group_id}/join",
        json={"invite_code": invite_code},
        headers=headers_b,
    )

    # user_a creates event in group
    create_resp = await client.post("/api/events", json=_event_payload(
        title="Creator Event",
        group_id=group_id,
    ), headers=headers_a)
    assert create_resp.status_code == 201
    event_id = create_resp.json()["id"]

    # user_b (member, not creator) tries to update — should get 403
    update_resp = await client.put(
        f"/api/events/{event_id}",
        json={"title": "Hacked"},
        headers=headers_b,
    )
    assert update_resp.status_code == 403


async def test_delete_event(client, user_a):
    _, headers = user_a

    create_resp = await client.post("/api/events", json=_event_payload(title="To Delete"), headers=headers)
    assert create_resp.status_code == 201
    event_id = create_resp.json()["id"]

    delete_resp = await client.delete(f"/api/events/{event_id}", headers=headers)
    assert delete_resp.status_code == 204

    get_resp = await client.get(f"/api/events/{event_id}", headers=headers)
    assert get_resp.status_code == 404
