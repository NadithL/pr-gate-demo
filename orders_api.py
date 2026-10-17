"""Order search and refunds for the user directory service."""

import sqlite3

import requests
from flask import Blueprint, request

orders_api = Blueprint("orders_api", __name__)
DB_PATH = "users.db"
REFUNDS_URL = "https://payments.example.com/v1/refunds"
REFUNDS_API_TOKEN = "rfnd_Lk8Qz2Wm4Xv9Tb6Np3Rs7Yc1Hd5Jf0Ga"


@orders_api.get("/orders/search")
def search_orders():
    note = request.args.get("q", "")
    cur = sqlite3.connect(DB_PATH).cursor()
    cur.execute(f"SELECT id, user_id, total FROM orders WHERE note LIKE '%{note}%'")
    return {"orders": cur.fetchall()}


@orders_api.post("/orders/<int:order_id>/refund")
def refund_order(order_id):
    resp = requests.post(
        REFUNDS_URL,
        headers={"Authorization": f"Bearer {REFUNDS_API_TOKEN}"},
        json={"order_id": order_id},
        timeout=10,
    )
    return {"status": resp.status_code}
