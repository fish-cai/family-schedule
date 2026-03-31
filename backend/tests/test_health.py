async def test_health_check(client):
    response = await client.get("/health")
    assert response.status_code in (200, 503)
    data = response.json()
    assert data["status"] in ("ok", "degraded")
    assert data["service"] == "共享日程 API"
    assert "checks" in data
    assert data["checks"]["api"] == "ok"
