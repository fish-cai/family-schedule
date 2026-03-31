import pytest


async def test_create_event_with_reminder(client, user_a):
    """Creating an event with remind_minutes creates reminder records."""
    _, headers = user_a
    resp = await client.post(
        "/api/events",
        json={
            "title": "提醒测试",
            "start_time": "2026-05-01T10:00:00+08:00",
            "end_time": "2026-05-01T11:00:00+08:00",
            "remind_minutes": [15, 60],
        },
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert sorted(data["remind_minutes"]) == [15, 60]


async def test_create_event_without_reminder(client, user_a):
    """Creating an event without remind_minutes returns empty list."""
    _, headers = user_a
    resp = await client.post(
        "/api/events",
        json={
            "title": "无提醒",
            "start_time": "2026-05-01T10:00:00+08:00",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    assert resp.json()["remind_minutes"] == []


async def test_get_event_shows_reminders(client, user_a):
    """GET event detail includes remind_minutes."""
    _, headers = user_a
    create_resp = await client.post(
        "/api/events",
        json={
            "title": "查看提醒",
            "start_time": "2026-05-01T10:00:00+08:00",
            "remind_minutes": [30],
        },
        headers=headers,
    )
    event_id = create_resp.json()["id"]
    resp = await client.get(f"/api/events/{event_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["remind_minutes"] == [30]


async def test_update_event_reminders(client, user_a):
    """Updating remind_minutes replaces old reminders."""
    _, headers = user_a
    create_resp = await client.post(
        "/api/events",
        json={
            "title": "更新提醒",
            "start_time": "2026-05-01T10:00:00+08:00",
            "remind_minutes": [15],
        },
        headers=headers,
    )
    event_id = create_resp.json()["id"]
    # Update to different reminder
    resp = await client.put(
        f"/api/events/{event_id}",
        json={"remind_minutes": [5, 30]},
        headers=headers,
    )
    assert resp.status_code == 200
    assert sorted(resp.json()["remind_minutes"]) == [5, 30]


async def test_delete_event_removes_reminders(client, user_a):
    """Deleting an event also removes its reminders (no orphan records)."""
    _, headers = user_a
    create_resp = await client.post(
        "/api/events",
        json={
            "title": "删除提醒",
            "start_time": "2026-05-01T10:00:00+08:00",
            "remind_minutes": [15, 30],
        },
        headers=headers,
    )
    event_id = create_resp.json()["id"]
    resp = await client.delete(f"/api/events/{event_id}", headers=headers)
    assert resp.status_code == 204
    # Verify event is gone
    resp = await client.get(f"/api/events/{event_id}", headers=headers)
    assert resp.status_code == 404


async def test_query_events_includes_reminders(client, user_a):
    """Query events endpoint includes remind_minutes in response."""
    _, headers = user_a
    await client.post(
        "/api/events",
        json={
            "title": "查询提醒",
            "start_time": "2026-05-01T10:00:00+08:00",
            "end_time": "2026-05-01T11:00:00+08:00",
            "remind_minutes": [15],
        },
        headers=headers,
    )
    resp = await client.get(
        "/api/events",
        params={"start": "2026-05-01T00:00:00+08:00", "end": "2026-05-31T23:59:59+08:00"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    event = [e for e in data if e["title"] == "查询提醒"][0]
    assert event["remind_minutes"] == [15]
