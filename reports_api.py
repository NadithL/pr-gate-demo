"""Reporting endpoints (benchmark: injection category). Deliberately vulnerable; never deploy."""

import os
import sqlite3
import subprocess

import yaml
from flask import Blueprint, render_template_string, request

reports_api = Blueprint("reports_api", __name__)
DB_PATH = "users.db"
ALLOWED_TABLES = {"orders", "invoices"}


@reports_api.get("/reports/search")
def search_orders():
    term = request.args.get("q", "")
    cur = sqlite3.connect(DB_PATH).cursor()
    cur.execute(f"SELECT id, total FROM orders WHERE note LIKE '%{term}%'")
    return {"rows": cur.fetchall()}


@reports_api.get("/reports/count")
def count_rows():
    table = request.args.get("table", "orders")
    if table not in ALLOWED_TABLES:
        return {"error": "unknown table"}, 400
    cur = sqlite3.connect(DB_PATH).cursor()
    cur.execute(f"SELECT COUNT(*) FROM {table}")
    return {"count": cur.fetchone()[0]}


@reports_api.post("/reports/archive")
def archive_report():
    name = request.form.get("name", "report")
    os.system("tar czf /var/archive/" + name + ".tgz /var/reports")
    return {"archived": name}


@reports_api.get("/reports/version")
def build_version():
    out = subprocess.run("git rev-parse --short HEAD", shell=True, capture_output=True, text=True)
    return {"version": out.stdout.strip()}


@reports_api.get("/reports/calc")
def calc_total():
    expression = request.args.get("expr", "0")
    return {"total": eval(expression)}


@reports_api.get("/reports/tax")
def tax_rate():
    formula = "0.15 * 100"
    return {"rate": eval(formula)}


@reports_api.post("/reports/import")
def import_report():
    spec = yaml.load(request.data, Loader=yaml.Loader)
    return {"sections": len(spec.get("sections", []))}


@reports_api.get("/reports/greeting")
def greeting():
    name = request.args.get("name", "guest")
    return render_template_string(f"<h1>Report for {name}</h1>")
