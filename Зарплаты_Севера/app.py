import json
import math
import sqlite3
from datetime import date
from pathlib import Path
from statistics import median
from flask import Flask, jsonify, request, send_from_directory, redirect

ROOT = Path(__file__).resolve().parent
app = Flask(__name__, static_folder=str(ROOT / "static"), static_url_path="/static")


def connect():
    db = sqlite3.connect(ROOT / "salaries_sever.db")
    db.row_factory = sqlite3.Row
    return db


def sync_database_and_snapshot():
    """Пересчитывает витрину regions в SQLite и синхронизирует локальный static/data.js."""
    with connect() as db:
        regions = [dict(r) for r in db.execute("SELECT * FROM regions").fetchall()]
        for reg in regions:
            rows = db.execute(
                "SELECT salary_from FROM vacancies WHERE city = ? AND salary_from IS NOT NULL",
                (reg["name"],)
            ).fetchall()
            vals = [float(r["salary_from"]) for r in rows]
            med_val = round(median(vals), 2) if vals else 0.0
            avg_val = round(sum(vals) / len(vals), 2) if vals else 0.0
            db.execute(
                "UPDATE regions SET median_salary = ?, avg_salary = ? WHERE id = ?",
                (med_val, avg_val, reg["id"])
            )
            db.execute(
                """UPDATE vacancies
                   SET salary_avg = CASE
                       WHEN salary_from IS NULL THEN NULL
                       WHEN salary_to IS NOT NULL THEN (salary_from + salary_to) / 2.0
                       ELSE salary_from END,
                   purchasing_ratio = CASE
                       WHEN salary_from IS NULL THEN NULL
                       ELSE ROUND(salary_from / ?, 2) END
                   WHERE city = ?""",
                (reg["basket_cost"], reg["name"])
            )
        db.commit()

        updated_regions = [
            {
                "id": r["id"],
                "name": r["name"],
                "basket_cost": r["basket_cost"],
                "source": r["source"]
            }
            for r in db.execute("SELECT * FROM regions").fetchall()
        ]
        updated_vacancies = []
        for row in db.execute(
            """SELECT vacancy_id AS id, title, company, city, experience AS exp,
                      schedule AS sched, salary_from AS [from], salary_to AS [to],
                      published_date AS date
               FROM vacancies ORDER BY pk DESC"""
        ).fetchall():
            item = dict(row)
            if item["sched"] in ("open", "close", "anonymous", "direct"):
                item["sched"] = "Не указан"
            updated_vacancies.append(item)

    data_js_path = ROOT / "static" / "data.js"
    content = (
        "const initialRegions = "
        + json.dumps(updated_regions, ensure_ascii=False, indent=2)
        + ";\nconst initialVacancies = "
        + json.dumps(updated_vacancies, ensure_ascii=False, indent=2)
        + ";\n"
    )
    data_js_path.write_text(content, encoding="utf-8")


@app.route("/")
@app.route("/index.html")
def index():
    return send_from_directory(ROOT, "index.html")


@app.route("/favicon.ico")
def favicon():
    return "", 204


@app.route("/materials/<path:filename>")
def materials(filename):
    return send_from_directory(ROOT / "materials", filename)


@app.errorhandler(404)
def handle_404(error):
    if request.path.startswith("/api/"):
        return jsonify(message="Запрошенный API-маршрут не найден."), 404
    return redirect("/")


@app.route("/api/regions")
def regions():
    with connect() as db:
        return jsonify([dict(row) for row in db.execute("SELECT * FROM regions")])


@app.route("/api/vacancies")
def vacancies():
    with connect() as db:
        rows = [
            dict(row)
            for row in db.execute(
                """SELECT vacancy_id AS id, title, company, city, experience AS exp,
                          schedule AS sched, salary_from AS [from], salary_to AS [to],
                          published_date AS date
                   FROM vacancies ORDER BY pk DESC"""
            )
        ]
    for row in rows:
        if row["sched"] in ("open", "close", "anonymous", "direct"):
            row["sched"] = "Не указан"
    city = request.args.get("city", "all")
    experience = request.args.get("exp", "all")
    query = request.args.get("q", "").casefold().strip()
    return jsonify([
        row for row in rows
        if (city == "all" or row["city"] == city)
        and (experience == "all" or row["exp"] == experience)
        and (not query or query in (row["title"] + " " + row["company"]).casefold())
    ])


def positive(value):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise ValueError("Укажите положительное конечное число.")
    return number


@app.route("/api/vacancies", methods=["POST"])
def add_vacancy():
    data = request.get_json(silent=True) or {}
    try:
        title = str(data.get("title", "")).strip()
        company = str(data.get("company", "")).strip()
        lower = positive(data.get("salary_from"))
        upper = positive(data["salary_to"]) if data.get("salary_to") not in (None, "") else None
        published = date.fromisoformat(data.get("published_date", "")).isoformat()
        if not "2023-03-23" <= published <= "2023-06-18":
            raise ValueError("Для этого набора данных выберите дату в периоде 23.03–18.06.2023.")
        if not title or not company or len(title) > 160 or len(company) > 160 or (upper is not None and upper < lower):
            raise ValueError("Проверьте должность, компанию и границы зарплаты (ДО не меньше ОТ).")
        exp_val = str(data.get("experience", "Нет опыта")).strip()
        if exp_val == "Без опыта":
            exp_val = "Нет опыта"
        with connect() as db:
            region = db.execute("SELECT * FROM regions WHERE name = ?", (data.get("city"),)).fetchone()
            if region is None:
                raise ValueError("Выберите северный город из справочника.")
            identifier = (db.execute("SELECT MAX(vacancy_id) FROM vacancies").fetchone()[0] or 0) + 1
            db.execute(
                """INSERT INTO vacancies
                   (vacancy_id, title, company, city, experience, schedule,
                    salary_from, salary_to, salary_avg, purchasing_ratio, published_date)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    identifier, title, company, region["name"],
                    exp_val, data.get("schedule", "Полный день"),
                    lower, upper,
                    (lower + upper) / 2.0 if upper else lower,
                    round(lower / region["basket_cost"], 2),
                    published
                )
            )
            db.commit()
        sync_database_and_snapshot()
        return jsonify(status="success", id=identifier), 201
    except (ValueError, TypeError, KeyError) as error:
        return jsonify(message=str(error)), 400


@app.route("/api/regions/<region_id>", methods=["PUT", "POST"])
def update_region(region_id):
    data = request.get_json(silent=True) or {}
    try:
        cost = positive(data.get("basket_cost"))
        source = str(data.get("source", "")).strip()
        if not source:
            raise ValueError("Укажите описание источника значения.")
        with connect() as db:
            region = db.execute("SELECT name FROM regions WHERE id = ?", (region_id,)).fetchone()
            if region is None:
                return jsonify(message="Город не найден."), 404
            db.execute("UPDATE regions SET basket_cost = ?, source = ? WHERE id = ?", (cost, source, region_id))
            db.commit()
        sync_database_and_snapshot()
        return jsonify(status="success")
    except (ValueError, TypeError) as error:
        return jsonify(message=str(error)), 400


if __name__ == "__main__":
    sync_database_and_snapshot()
    print("Сервер «Зарплаты Севера» запущен: http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=False)