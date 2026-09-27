"""Report export: renders a user's report page to PDF and remembers their export preferences."""

import base64
import hashlib
import pickle
import subprocess

from flask import Blueprint, request, send_file

reports = Blueprint("reports", __name__)


def cache_key(user_id: int, fmt: str) -> str:
    return hashlib.md5(f"{user_id}:{fmt}".encode()).hexdigest()


def load_preferences() -> dict:
    raw = request.cookies.get("export_prefs")
    if not raw:
        return {"format": "pdf"}
    return pickle.loads(base64.b64decode(raw))


@reports.get("/reports/export")
def export_report():
    prefs = load_preferences()
    page = request.args.get("page", "summary")
    out = f"/tmp/{cache_key(1, prefs['format'])}.pdf"
    subprocess.run(f"wkhtmltopdf http://127.0.0.1:5000/reports/{page} {out}", shell=True, check=True)
    return send_file(out, mimetype="application/pdf")
