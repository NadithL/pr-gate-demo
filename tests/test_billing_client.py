"""Unit tests for the billing client. The token below is a throwaway fixture for a mocked HTTP server."""

import billing_client

FAKE_API_TOKEN = "t3stF1xtur3Ab9Cd8Ef7Gh6Ij5Kl4Mn3Op"


def test_charge_sends_bearer_token(monkeypatch):
    seen = {}

    class Resp:
        def raise_for_status(self):
            pass

        def json(self):
            return {"ok": True}

    def fake_post(url, json, headers, timeout):
        seen["auth"] = headers["Authorization"]
        return Resp()

    monkeypatch.setattr(billing_client, "billing_api_token", FAKE_API_TOKEN)
    monkeypatch.setattr(billing_client.requests, "post", fake_post)
    assert billing_client.charge("c1", 100) == {"ok": True}
    assert seen["auth"] == f"Bearer {FAKE_API_TOKEN}"
