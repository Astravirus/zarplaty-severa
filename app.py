import os
import sqlite3
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)
DB_NAME = os.path.join(os.path.dirname(__file__), "salaries_sever.db")

def get_db():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

@app.route("/")
def index():
    return render_template("index.html")

# API: Получить все регионы и нормативы Росстата
@app.route("/api/regions", methods=["GET"])
def api_regions():
    db = get_db()
    rows = db.execute("SELECT * FROM regions").fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])

# API: Обновить норматив Росстата (Форма 6)
@app.route("/api/regions/<region_id>", methods=["PUT", "POST"])
def update_region(region_id):
    data = request.json or request.form
    new_basket = float(data.get("basket_cost", 26000))
    source = data.get("source", "Росстат, бюллетень цен")
    
    db = get_db()
    db.execute("UPDATE regions SET basket_cost = ?, source = ? WHERE id = ?", (new_basket, source, region_id))
    db.commit()
    db.close()
    return jsonify({"status": "success", "message": "Норматив Росстата успешно обновлен"})

# API: Получить вакансии с фильтрацией (Форма 2)
@app.route("/api/vacancies", methods=["GET"])
def api_vacancies():
    city = request.args.get("city", "all")
    exp = request.args.get("exp", "all")
    q = request.args.get("q", "").lower().strip()
    
    query = "SELECT * FROM vacancies WHERE 1=1"
    params = []
    
    if city != "all":
        query += " AND city LIKE ?"
        params.append(f"%{city}%")
    if exp != "all":
        query += " AND experience = ?"
        params.append(exp)
    if q:
        query += " AND (LOWER(title) LIKE ? OR LOWER(company) LIKE ?)"
        params.extend([f"%{q}%", f"%{q}%"])
        
    query += " ORDER BY purchasing_ratio DESC"
    
    db = get_db()
    rows = db.execute(query, params).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])

# API: Добавить новую вакансию (Форма 5)
@app.route("/api/vacancies", methods=["POST"])
def api_add_vacancy():
    data = request.json or request.form
    title = data.get("title")
    company = data.get("company")
    city = data.get("city")
    salary_from = float(data.get("salary_from", 0))
    salary_to = float(data.get("salary_to")) if data.get("salary_to") else None
    exp = data.get("experience", "От 1 года до 3 лет")
    sched = data.get("schedule", "Полный день")
    pub_date = data.get("published_date", "2026-05-01")
    
    salary_avg = (salary_from + salary_to) / 2 if salary_to else salary_from
    
    # Расчет индекса относительно корзины города
    basket_map = {
        'Новый Уренгой': 28230, 'Салехард': 28350, 'Норильск': 28220,
        'Сургут': 26370, 'Ханты-Мансийск': 26180, 'Мурманск': 25870
    }
    basket = basket_map.get(city, 26370)
    ratio = round(salary_avg / basket, 2)
    
    db = get_db()
    cur = db.execute("""
        INSERT INTO vacancies (title, company, city, experience, schedule, salary_from, salary_to, salary_avg, purchasing_ratio, published_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (title, company, city, exp, sched, salary_from, salary_to, salary_avg, ratio, pub_date))
    new_id = cur.lastrowid
    db.commit()
    db.close()
    
    return jsonify({"status": "success", "id": new_id, "purchasing_ratio": ratio})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
