from unittest.mock import AsyncMock, patch


MOCK_LLM_RESPONSE_SIMPLE = """{
  "title": "开会",
  "start_time": "2026-04-01T14:00:00+08:00",
  "end_time": "2026-04-01T15:00:00+08:00",
  "is_all_day": false,
  "location": "会议室",
  "description": "",
  "repeat_rule": null
}"""

MOCK_LLM_RESPONSE_REPEAT = """{
  "title": "接小明放学",
  "start_time": "2026-04-02T15:00:00+08:00",
  "end_time": "2026-04-02T16:00:00+08:00",
  "is_all_day": false,
  "location": "学校门口",
  "description": "",
  "repeat_rule": {
    "freq": "weekly",
    "interval": 1,
    "byday": ["WE"]
  }
}"""

MOCK_LLM_RESPONSE_ALLDAY = """{
  "title": "小明生日",
  "start_time": "2026-05-01T00:00:00+08:00",
  "end_time": "2026-05-01T23:59:00+08:00",
  "is_all_day": true,
  "location": "",
  "description": "",
  "repeat_rule": null
}"""

MOCK_LLM_RESPONSE_CODEBLOCK = """```json
{
  "title": "瑜伽课",
  "start_time": "2026-04-01T19:00:00+08:00",
  "end_time": "2026-04-01T20:00:00+08:00",
  "is_all_day": false,
  "location": "健身房",
  "description": "",
  "repeat_rule": null
}
```"""


@patch("app.services.ai_service.get_llm_provider")
async def test_parse_simple_event(mock_provider, client, user_a):
    _, headers = user_a
    provider_instance = AsyncMock()
    provider_instance.chat.return_value = MOCK_LLM_RESPONSE_SIMPLE
    mock_provider.return_value = provider_instance

    resp = await client.post(
        "/api/ai/parse-event",
        json={"text": "明天下午2点在会议室开会"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "开会"
    assert data["location"] == "会议室"
    assert data["repeat_rule"] is None


@patch("app.services.ai_service.get_llm_provider")
async def test_parse_repeat_event(mock_provider, client, user_a):
    _, headers = user_a
    provider_instance = AsyncMock()
    provider_instance.chat.return_value = MOCK_LLM_RESPONSE_REPEAT
    mock_provider.return_value = provider_instance

    resp = await client.post(
        "/api/ai/parse-event",
        json={"text": "每周三下午3点在学校门口接小明放学"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "接小明放学"
    assert data["repeat_rule"]["freq"] == "weekly"
    assert "WE" in data["repeat_rule"]["byday"]


@patch("app.services.ai_service.get_llm_provider")
async def test_parse_allday_event(mock_provider, client, user_a):
    _, headers = user_a
    provider_instance = AsyncMock()
    provider_instance.chat.return_value = MOCK_LLM_RESPONSE_ALLDAY
    mock_provider.return_value = provider_instance

    resp = await client.post(
        "/api/ai/parse-event",
        json={"text": "5月1号小明生日"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_all_day"] is True
    assert data["title"] == "小明生日"


@patch("app.services.ai_service.get_llm_provider")
async def test_parse_codeblock_response(mock_provider, client, user_a):
    _, headers = user_a
    provider_instance = AsyncMock()
    provider_instance.chat.return_value = MOCK_LLM_RESPONSE_CODEBLOCK
    mock_provider.return_value = provider_instance

    resp = await client.post(
        "/api/ai/parse-event",
        json={"text": "今晚7点去健身房上瑜伽课"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "瑜伽课"


@patch("app.services.ai_service.get_llm_provider")
async def test_parse_llm_error(mock_provider, client, user_a):
    _, headers = user_a
    provider_instance = AsyncMock()
    provider_instance.chat.side_effect = Exception("API timeout")
    mock_provider.return_value = provider_instance

    resp = await client.post(
        "/api/ai/parse-event",
        json={"text": "明天开会"},
        headers=headers,
    )
    assert resp.status_code == 502


@patch("app.services.ai_service.get_llm_provider")
async def test_parse_invalid_response(mock_provider, client, user_a):
    _, headers = user_a
    provider_instance = AsyncMock()
    provider_instance.chat.return_value = "I cannot understand that request."
    mock_provider.return_value = provider_instance

    resp = await client.post(
        "/api/ai/parse-event",
        json={"text": "asdfghjkl"},
        headers=headers,
    )
    assert resp.status_code == 400


async def test_parse_event_no_auth(client):
    resp = await client.post(
        "/api/ai/parse-event",
        json={"text": "明天开会"},
    )
    assert resp.status_code == 403


async def test_parse_event_empty_text(client, user_a):
    _, headers = user_a
    resp = await client.post(
        "/api/ai/parse-event",
        json={"text": ""},
        headers=headers,
    )
    assert resp.status_code == 422
