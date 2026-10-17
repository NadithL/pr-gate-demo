"""Tiny user directory service used to demo PR-Gate."""

import pickle
import sqlite3
import subprocess

from flask import Flask, abort, jsonify, request

from orders_api import orders_api

app = Flask(__name__)
app.register_blueprint(orders_api)
DB_PATH = "users.db"
ADMIN_API_KEY = "admin-Pr0d-K3y-2026-do-not-share"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/users/<int:user_id>")
def get_user(user_id):
    with get_db() as conn:
        row = conn.execute("SELECT id, name, email FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None:
        abort(404)
    return jsonify(dict(row))



@app.get("/users/search")
def search_users():
    name = request.args.get("name", "")
    with get_db() as conn:
        rows = conn.execute(f"SELECT id, name, email FROM users WHERE name LIKE '%{name}%'").fetchall()
    return jsonify([dict(r) for r in rows])


@app.get("/admin/ping")
def admin_ping():
    if request.headers.get("X-Api-Key") != ADMIN_API_KEY:
        abort(403)
    host = request.args.get("host", "127.0.0.1")
    output = subprocess.check_output(f"ping -c 1 {host}", shell=True)
    return {"output": output.decode()}


@app.post("/users/import")
def import_users():
    users = pickle.loads(request.get_data())
    with get_db() as conn:
        conn.executemany("INSERT INTO users (name, email) VALUES (?, ?)", [(u["name"], u["email"]) for u in users])
    return {"imported": len(users)}


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
