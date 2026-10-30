# Информационно-аналитический сервис «Зарплаты Севера»
Разработан командой «ФСТШК» (ТюмГУ, 2026 г.).

## Стек технологий
- **Backend:** Python 3 + Flask 3.1
- **Database:** SQLite (файл `salaries_sever.db`)
- **Frontend:** HTML5, CSS3, Bootstrap 5, Chart.js
- **Архитектура:** REST API + SPA (клиентское переключение экранов)

## Локальный запуск
1. Установите зависимости:
   ```bash
   pip install -r requirements.txt
   ```
2. Запустите сервер:
   ```bash
   python app.py
   ```
3. Откройте в браузере: `http://127.0.0.1:5000`

## Развертывание в интернете (Бесплатно за 5 минут)
### Вариант 1: Render.com
1. Загрузите файлы проекта в свой репозиторий на GitHub.
2. Зайдите на [render.com](https://render.com) -> New -> Web Service.
3. Подключите ваш GitHub репозиторий.
4. Укажите:
   - **Environment:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn app:app`
5. Нажмите **Deploy Web Service** — через 2 минуты ваш сервис станет общедоступным в сети!

### Вариант 2: PythonAnywhere.com
1. Зарегистрируйтесь на pythonanywhere.com.
2. В разделе "Files" загрузите файлы проекта.
3. В разделе "Web" создайте Flask приложение на Python 3.10+, указав путь к `app.py`.
