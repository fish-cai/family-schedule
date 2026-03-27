async def test_wechat_login_missing_code(client):
    response = await client.post("/api/users/login", json={})
    assert response.status_code == 422


async def test_wechat_login_invalid_code(client):
    response = await client.post("/api/users/login", json={"code": "invalid"})
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


async def test_get_current_user_no_token(client):
    response = await client.get("/api/users/me")
    assert response.status_code == 403
