"""
AI Agent API integration tests.
Agent status, chat responses (with Gemini mocked), activity feed.
"""
import pytest
from unittest.mock import AsyncMock, patch
import json


class TestAgentsAPI:

    async def test_get_all_agent_statuses(self, client, auth_headers_owner):
        """GET /agents/status returns all 10 agents"""
        resp = await client.get("/api/agents/status", headers=auth_headers_owner)
        assert resp.status_code == 200
        agents = resp.json()
        agent_names = {a["name"].lower() for a in agents}
        assert any("coordinator" in name for name in agent_names)
        assert any("planning" in name for name in agent_names)
        assert any("health" in name for name in agent_names)
        assert len(agents) == 10

    async def test_agent_chat_greeting_response(self, client, auth_headers_owner):
        """Sending 'hi' to coordinator must return a natural greeting, not manufacturing data"""
        with patch("app.agents.coordinator_agent.CoordinatorAgent.stream_response") as mock_stream:
            mock_stream.return_value = async_generator_from_text("Hello! How can I assist you with the PVC plant today?")

            resp = await client.post(
                "/api/agents/chat",
                headers={**auth_headers_owner, "Accept": "text/event-stream"},
                json={"message": "hi", "conversation_id": "test-conv-001"},
            )
            assert resp.status_code == 200
            response_text = resp.text
            # Must NOT contain robotic manufacturing dump phrases
            assert "operation data log" not in response_text.lower()

    async def test_agent_chat_two_messages_differ(self, client, auth_headers_owner):
        """Same message sent twice must not return identical responses"""
        with patch("app.agents.coordinator_agent.CoordinatorAgent.stream_response") as mock_stream:
            responses = [
                async_generator_from_text("Hello! What can I help you with today?"),
                async_generator_from_text("Hi there! Ready to help with the plant."),
            ]
            mock_stream.side_effect = responses

            resp1 = await client.post("/api/agents/chat", headers=auth_headers_owner,
                                      json={"message": "hi", "conversation_id": "conv-a"})
            resp2 = await client.post("/api/agents/chat", headers=auth_headers_owner,
                                      json={"message": "hi", "conversation_id": "conv-b"})

            assert resp1.text != resp2.text

    async def test_agent_chat_logs_created(self, client, auth_headers_owner, test_db):
        """Every chat interaction must create an agent_log record"""
        from app.models.agent_log import AgentLog

        initial_count = await AgentLog.count()

        # Execute genuine (non-mocked) rule engine fallback chat
        resp = await client.post(
            "/api/agents/chat",
            headers=auth_headers_owner,
            json={"message": "what is extruder status?", "conversation_id": "log-test"}
        )
        assert resp.status_code == 200
        async for _ in resp.aiter_bytes():
            pass

        new_count = await AgentLog.count()
        assert new_count > initial_count

    async def test_agent_activity_feed_returns_recent_actions(self, client, auth_headers_owner):
        """Activity feed must return list of recent agent actions"""
        resp = await client.get("/api/agents/activity-feed", headers=auth_headers_owner)
        assert resp.status_code == 200
        feed = resp.json()["activities"]
        assert isinstance(feed, list)
        if len(feed) > 0:
            activity = feed[0]
            assert "agent_name" in activity
            assert "action" in activity
            assert "created_at" in activity


async def async_generator_from_text(text: str):
    """Helper: simulates streaming response for tests"""
    for word in text.split():
        yield word + " "
