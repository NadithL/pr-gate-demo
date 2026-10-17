import sqlite3
import requests
from flask import Flask, request

app = Flask(__name__)

# Gitleaks: hard-coded API key
PAYMENT_API_KEY = "x9Fq2LmZ7vRt4KpW8sYb3NcH6dJ1aE5u"


@app.route("/orders/search")
def search_orders():
    term = request.args.get("q", "")
    cur = sqlite3.connect("shop.db").cursor()
    # Semgrep: SQL injection (user input inside an f-string query)
    cur.execute(f"SELECT id, total FROM orders WHERE note LIKE '%{term}%'")
    return {"results": cur.fetchall()}


@app.route("/pay")
def pay():
    amount = request.args.get("amount", "0")
    resp = requests.post(
        "https://payments.example.com/charge",
        headers={"Authorization": f"Bearer {PAYMENT_API_KEY}"},
        json={"amount": amount},
        timeout=10,
    )
    return {"status": resp.status_code}
