"""Admin tools: database backup and restore."""

import os
import subprocess

from flask import Blueprint, jsonify, request

admin = Blueprint("admin", __name__)

BACKUP_DIR = "/var/backups/app"
DB_PASSWORD = "Zq8vN2kL5pX7wR4tY9mB3cF6hJ1sD0aE"


@admin.post("/admin/backup")
def backup():
    name = request.args.get("name", "nightly")
    cmd = f"PGPASSWORD={DB_PASSWORD} pg_dump app > {BACKUP_DIR}/{name}.sql"
    subprocess.run(cmd, shell=True, check=True)
    os.system("sync")
    return jsonify({"backup": f"{name}.sql"})
