"""
Mi Día — backend (Flask)
Guarda todo en backend/data/planner.json. Sin base de datos, sin complicaciones.
"""
import json
import os
import threading
from datetime import date, timedelta

from flask import Flask, jsonify, request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "data", "planner.json")
PORT = int(os.environ.get("BACKEND_PORT", 5050))

app = Flask(__name__)
_lock = threading.Lock()


# ---------- almacenamiento ----------
def _load():
    if not os.path.exists(DATA_FILE):
        return {"days": {}, "backlog": [], "projects": []}
    with open(DATA_FILE, encoding="utf-8") as f:
        data = json.load(f)
    data.setdefault("days", {})
    data.setdefault("backlog", [])
    data.setdefault("projects", [])
    return data


def _save(data):
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    tmp = DATA_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, DATA_FILE)


def _empty_day():
    return {"blocks": [], "tasks": [], "note": "", "meetings": [], "rolledOut": 0}


def _valid_date(d):
    try:
        date.fromisoformat(d)
        return True
    except ValueError:
        return False


def _rollover(data, today):
    """Mueve las tareas NO tachadas de días anteriores al día de hoy."""
    today_day = data["days"].setdefault(today, _empty_day())
    moved = 0
    for d in sorted(data["days"]):
        if d >= today:
            continue
        day = data["days"][d]
        pending = [t for t in day.get("tasks", []) if not t.get("done")]
        if not pending:
            continue
        day["tasks"] = [t for t in day["tasks"] if t.get("done")]
        day["rolledOut"] = day.get("rolledOut", 0) + len(pending)
        for t in pending:
            t["carried"] = True
            t.setdefault("since", d)
            today_day["tasks"].append(t)
        moved += len(pending)
    return moved


# ---------- API ----------
@app.get("/api/health")
def health():
    return {"ok": True, "today": date.today().isoformat()}


@app.get("/api/day/<d>")
def get_day(d):
    if not _valid_date(d):
        return {"error": "fecha no válida"}, 400
    with _lock:
        data = _load()
        rolled = 0
        if d == date.today().isoformat():
            rolled = _rollover(data, d)
            if rolled:
                _save(data)
        day = data["days"].get(d, _empty_day())
    return jsonify({**day, "date": d, "rolled": rolled})


@app.put("/api/day/<d>")
def put_day(d):
    if not _valid_date(d):
        return {"error": "fecha no válida"}, 400
    body = request.get_json(force=True) or {}
    with _lock:
        data = _load()
        day = data["days"].setdefault(d, _empty_day())
        # solo actualizamos lo que maneja el cliente; rolledOut lo gestiona el servidor
        for key in ("blocks", "tasks", "note", "meetings"):
            if key in body:
                day[key] = body[key]
        _save(data)
    return {"ok": True}


@app.get("/api/backlog")
def get_backlog():
    with _lock:
        return jsonify(_load()["backlog"])


@app.put("/api/backlog")
def put_backlog():
    items = (request.get_json(force=True) or {}).get("items", [])
    with _lock:
        data = _load()
        data["backlog"] = items
        _save(data)
    return {"ok": True}


@app.get("/api/projects")
def get_projects():
    with _lock:
        return jsonify(_load()["projects"])


@app.put("/api/projects")
def put_projects():
    items = (request.get_json(force=True) or {}).get("items", [])
    with _lock:
        data = _load()
        data["projects"] = items
        _save(data)
    return {"ok": True}


@app.get("/api/summary")
def summary():
    """Progreso de los últimos N días (para la mini-gráfica semanal)."""
    end = request.args.get("end", date.today().isoformat())
    n = min(int(request.args.get("days", 7)), 31)
    if not _valid_date(end):
        return {"error": "fecha no válida"}, 400
    end_d = date.fromisoformat(end)
    with _lock:
        data = _load()
    out = []
    for i in range(n - 1, -1, -1):
        d = (end_d - timedelta(days=i)).isoformat()
        day = data["days"].get(d, _empty_day())
        tasks = day.get("tasks", [])
        done = sum(1 for t in tasks if t.get("done"))
        total = len(tasks) + day.get("rolledOut", 0)
        out.append({"date": d, "done": done, "total": total, "blocks": len(day.get("blocks", [])),
                    "meetings": len(day.get("meetings", []))})
    return jsonify(out)


if __name__ == "__main__":
    print(f"Backend Mi Día en http://127.0.0.1:{PORT}")
    app.run(host="127.0.0.1", port=PORT, debug=os.environ.get("FLASK_DEBUG") == "1")
