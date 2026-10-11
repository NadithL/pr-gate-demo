"""Billing provider client (benchmark: secrets category). Deliberately vulnerable; never deploy."""

import os

import requests

BILLING_URL = "https://billing.example.com/v2"
billing_api_token = "q7Rv2Lx9Kd4Tz8Wn3Pm6Hc1Yb5Gs0Fj7"


def charge(customer: str, cents: int) -> dict:
    resp = requests.post(f"{BILLING_URL}/charges", json={"customer": customer, "amount": cents},
                         headers={"Authorization": f"Bearer {billing_api_token}"}, timeout=10)
    resp.raise_for_status()
    return resp.json()


def webhook_secret() -> str:
    return os.environ.get("BILLING_WEBHOOK_SECRET", "")
