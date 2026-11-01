let citiesData = Object.fromEntries(initialRegions.map(region => [region.id, region]));
let sampleVacancies = initialVacancies;
let currentSelectedVacancy = null;
let reportRows = [];
let charts = [];
let vacancyPage = 1;
let displayedVacancies = [];

const byId = id => document.getElementById(id);
const number = value => value == null ? 'Не указано' : Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

const EXP_MAP = {
    'all': 'all',
    'none': 'Нет опыта',
    'Без опыта': 'Нет опыта',
    'Нет опыта': 'Нет опыта',
    '1-3': 'От 1 года до 3 лет',
    'От 1 года до 3 лет': 'От 1 года до 3 лет',
    '3-6': 'От 3 до 6 лет',
    'От 3 до 6 лет': 'От 3 до 6 лет',
    '6+': 'Более 6 лет',
    'Более 6 лет': 'Более 6 лет'
};

function normalizeExp(val) {
    return EXP_MAP[val] || val;
}

function cityRegion(city) {
    return Object.values(citiesData).find(region => region.name === city);
}

function purchasingIndex(vacancy) {
    if (vacancy.from == null) return -1;
    const region = cityRegion(vacancy.city);
    return region && region.basket_cost ? vacancy.from / region.basket_cost : -1;
}

function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarize(items) {
    return Object.values(citiesData).map(region => {
        const records = items.filter(vacancy => vacancy.city === region.name);
        const values = records.map(vacancy => vacancy.from).filter(value => typeof value === 'number');
        const medSal = median(values);
        return {
            ...region,
            count: records.length,
            salaryCount: values.length,
            medSal,
            avgSal: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
            index: medSal == null ? null : medSal / region.basket_cost
        };
    }).filter(region => region.count > 0);
}

function periodRows(period) {
    const months = { mar: '2023-03', apr: '2023-04', may: '2023-05', jun: '2023-06', empty: '2024' };
    return period === 'all' ? sampleVacancies : sampleVacancies.filter(vacancy => vacancy.date.startsWith(months[period]));
}

function showScreen(screenId) {
    document.querySelectorAll('.screen-view').forEach(screen => screen.classList.toggle('active', screen.id === 'screen-' + screenId));
    document.querySelectorAll('.navbar .nav-link').forEach(link => link.classList.toggle('active', link.id === 'tab-' + screenId));
    window.scrollTo(0, 0);
    if (screenId === 'dashboard') updateDashboard();
}

function runHomeCompare() {
    const keys = ['home-city-1', 'home-city-2', 'home-city-3'].map(id => byId(id).value).filter(value => value !== 'none');
    const invalid = keys.length < 2 || new Set(keys).size !== keys.length;
    byId('home-error').classList.toggle('d-none', !invalid);
    if (invalid) return;
    const summary = summarize(periodRows(byId('home-period').value));
    const selected = keys.map(key => summary.find(region => region.id === key) || { ...citiesData[key], count: 0, medSal: null, index: null });
    byId('home-compare-head').innerHTML = '<th>Показатель</th>' + selected.map(region => `<th>${escapeText(region.name)}</th>`).join('');
    byId('home-compare-body').innerHTML = [
        ['Записей', 'count'],
        ['Медиана нижней границы, руб.', 'medSal'],
        ['Учебная стоимость набора, руб.', 'basket_cost'],
        ['Условный индекс, наборов', 'index']
    ].map(([label, field]) => `<tr><th>${label}</th>${selected.map(region => `<td>${region.count ? number(region[field]) : 'Нет данных'}</td>`).join('')}</tr>`).join('');
}

function resetHomeCompare() {
    byId('home-city-1').value = 'Surgut';
    byId('home-city-2').value = 'Murmansk';
    byId('home-city-3').value = 'Urengoy';
    byId('home-period').value = 'all';
    runHomeCompare();
}

function renderVacanciesTable(items) {
    if (items !== displayedVacancies) vacancyPage = 1;
    displayedVacancies = items;
    const pages = Math.max(1, Math.ceil(items.length / 100));
    vacancyPage = Math.max(1, Math.min(vacancyPage, pages));
    byId('vac-count-badge').textContent = `${items.length} ед. · страница ${vacancyPage} из ${pages}`;
    byId('vac-prev').disabled = vacancyPage === 1;
    byId('vac-next').disabled = vacancyPage === pages;
    byId('vacancies-tbody').innerHTML = items.length ? items.slice((vacancyPage - 1) * 100, vacancyPage * 100).map(vacancy => {
        const region = cityRegion(vacancy.city);
        const ratio = vacancy.from == null || !region ? null : vacancy.from / region.basket_cost;
        return `<tr>
      <td><b>${escapeText(vacancy.title)}</b><div class="small text-secondary">${escapeText(vacancy.company)}</div></td>
      <td>${escapeText(vacancy.city)}</td>
      <td>${escapeText(vacancy.exp)}</td>
      <td>${vacancy.from == null ? 'Не указана' : `от ${number(vacancy.from)}${vacancy.to == null ? '' : ' до ' + number(vacancy.to)} руб.`}</td>
      <td>${ratio == null ? '—' : `<span class="badge-index">${number(ratio)} наб.</span>`}</td>
      <td class="text-center"><button class="btn btn-sm btn-primary" onclick="openVacancyCard(${vacancy.id})">Открыть</button></td>
    </tr>`;
    }).join('') : '<tr><td colspan="6" class="text-center py-3 text-secondary">По вашему запросу вакансий не найдено. Измените запрос или сбросьте фильтры.</td></tr>';
}

function changeVacancyPage(direction) {
    vacancyPage += direction;
    renderVacanciesTable(displayedVacancies);
    window.scrollTo(0, 0);
}

function filterVacancies() {
    const query = byId('vac-query').value.trim().toLocaleLowerCase('ru');
    const city = byId('vac-city').value;
    const exp = normalizeExp(byId('vac-exp').value);
    const filtered = sampleVacancies.filter(vacancy =>
        (!query || (vacancy.title + ' ' + vacancy.company).toLocaleLowerCase('ru').includes(query)) &&
        (city === 'all' || vacancy.city === (citiesData[city]?.name || city)) &&
        (exp === 'all' || vacancy.exp === exp) &&
        (!byId('vac-only-salary').checked || vacancy.from != null)
    );
    filtered.sort((a, b) => purchasingIndex(b) - purchasingIndex(a));
    renderVacanciesTable(filtered);
}

function resetVacancyFilters() {
    byId('vac-query').value = '';
    byId('vac-city').value = 'all';
    byId('vac-exp').value = 'all';
    byId('vac-only-salary').checked = true;
    filterVacancies();
}

function openVacancyCard(id) {
    const vacancy = sampleVacancies.find(item => item.id === id);
    if (!vacancy) return;
    currentSelectedVacancy = vacancy;
    const region = cityRegion(vacancy.city);
    const summary = summarize(sampleVacancies).find(item => item.name === vacancy.city);
    const diffVal = vacancy.from != null && summary?.medSal ? (vacancy.from / summary.medSal - 1) * 100 : null;
    const fields = {
        'card-id': `ID: ${vacancy.id}`,
        'card-title': vacancy.title,
        'card-company': vacancy.company,
        'card-city': vacancy.city,
        'card-date': vacancy.date,
        'card-exp': vacancy.exp,
        'card-schedule': vacancy.sched,
        'card-from': number(vacancy.from),
        'card-to': number(vacancy.to),
        'card-avg': vacancy.from != null ? number(vacancy.from) + ' руб. (нижняя граница)' : 'Не указано',
        'card-reg-basket': number(region?.basket_cost),
        'card-reg-med': number(summary?.medSal),
        'card-reg-index': number(summary?.index),
        'card-vac-index': region && vacancy.from != null ? number(vacancy.from / region.basket_cost) : 'Нет данных',
        'card-diff': diffVal != null ? `${diffVal > 0 ? '+' : ''}${number(diffVal)} % к медиане нижних границ выборки` : 'Нет данных'
    };
    Object.entries(fields).forEach(([key, value]) => byId(key).textContent = value);
    ['card-from', 'card-to', 'card-reg-basket', 'card-reg-med'].forEach(key => {
        if (byId(key).textContent !== 'Не указано') byId(key).textContent += ' руб.';
    });
    ['card-reg-index', 'card-vac-index'].forEach(key => {
        if (byId(key).textContent !== 'Нет данных' && byId(key).textContent !== 'Не указано') byId(key).textContent += ' наб.';
    });
    byId('card-diff').className = 'fw-bold ' + (diffVal == null ? 'text-secondary' : diffVal >= 0 ? 'text-success' : 'text-danger');
    showScreen('card');
}

function openCalcFromCard() {
    if (!currentSelectedVacancy || currentSelectedVacancy.from == null) {
        alert('У вакансии нет числовой нижней границы оплаты.');
        return;
    }
    byId('calc-salary').value = currentSelectedVacancy.from;
    byId('calc-city').value = cityRegion(currentSelectedVacancy.city).id;
    showScreen('calculator');
    runCalculator();
}

function updateCalcCityOptions() {
    const select = byId('calc-city');
    if (!select) return;
    Array.from(select.options).forEach(opt => {
        const reg = citiesData[opt.value];
        if (reg) {
            opt.textContent = `г. ${reg.name} (набор: ${number(reg.basket_cost)} ₽)`;
        }
    });
}

function runCalculator() {
    const salary = Number(byId('calc-salary').value);
    const rentText = byId('calc-rent').value;
    const rent = Number(rentText);
    const error = !Number.isFinite(salary) || salary <= 0 || rentText === '' || !Number.isFinite(rent) || rent < 0;
    byId('calc-error').textContent = 'Укажите положительную сумму зарплатного предложения и неотрицательную аренду.';
    byId('calc-error').classList.toggle('d-none', !error);
    if (error) {
        ['index', 'equiv', 'expenses', 'free'].forEach(id => byId('calc-res-' + id).textContent = '—');
        return;
    }
    const basket = citiesData[byId('calc-city').value].basket_cost;
    const baseCosts = { Tyumen: 23410, Moscow: 32150, SPb: 27800, Omsk: 21300 };
    byId('calc-res-index').textContent = number(salary / basket) + ' набора';
    byId('calc-res-equiv').textContent = number(salary / basket * baseCosts[byId('calc-base-city').value]) + ' руб. (учебная оценка)';
    byId('calc-res-expenses').textContent = number(basket + rent) + ' руб. (набор + аренда)';
    byId('calc-res-free').textContent = number(salary - basket - rent) + ' руб. (условный остаток)';
    byId('calc-res-free').className = 'fs-3 fw-bold ' + (salary - basket - rent < 0 ? 'text-danger' : 'text-dark');
}

function resetCalculator() {
    byId('calc-salary').value = '';
    byId('calc-rent').value = 0;
    ['index', 'equiv', 'expenses', 'free'].forEach(id => byId('calc-res-' + id).textContent = '—');
    byId('calc-error').classList.add('d-none');
}

function switchAdminTab(tab) {
    byId('admin-sec-vac').classList.toggle('d-none', tab !== 'vac');
    byId('admin-sec-basket').classList.toggle('d-none', tab !== 'basket');
    byId('adm-tab-vac').classList.toggle('active', tab === 'vac');
    byId('adm-tab-basket').classList.toggle('active', tab === 'basket');
}

async function api(path, method, data) {
    const response = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: data ? JSON.stringify(data) : undefined
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Не удалось выполнить запрос.');
    return result;
}

async function adminAddVacancy() {
    const data = {
        title: byId('adm-title').value.trim(),
        company: byId('adm-comp').value.trim(),
        city: citiesData[byId('adm-city').value]?.name || byId('adm-city').value,
        salary_from: Number(byId('adm-from').value),
        salary_to: byId('adm-to').value === '' ? null : Number(byId('adm-to').value),
        experience: normalizeExp(byId('adm-exp').value),
        schedule: byId('adm-sched').value,
        published_date: byId('adm-date').value
    };
    if (!data.title || !data.company || data.published_date < '2023-03-23' || data.published_date > '2023-06-18' || !data.published_date || !Number.isFinite(data.salary_from) || data.salary_from <= 0 || (data.salary_to != null && (!Number.isFinite(data.salary_to) || data.salary_to < data.salary_from))) {
        alert('Заполните должность, компанию и дату 23.03–18.06.2023. Нижняя граница должна быть положительной, верхняя — не меньше нижней.');
        return;
    }
    try {
        if (location.protocol === 'file:') {
            const vacancy = {
                id: Math.max(...sampleVacancies.map(item => item.id)) + 1,
                title: data.title,
                company: data.company,
                city: data.city,
                from: data.salary_from,
                to: data.salary_to,
                exp: data.experience,
                sched: data.schedule,
                date: data.published_date
            };
            sampleVacancies.unshift(vacancy);
        } else {
            await api('/api/vacancies', 'POST', data);
            sampleVacancies = await api('/api/vacancies', 'GET');
        }
        byId('adm-vac-alert').textContent = location.protocol === 'file:' ? 'Учебная запись добавлена на время этой сессии браузера.' : 'Учебная запись сохранена в базе SQLite и синхронизирована.';
        byId('adm-vac-alert').classList.remove('d-none');
        filterVacancies();
        runHomeCompare();
        updateDashboard();
        generateReport();
    } catch (error) {
        alert(error.message);
    }
}

function adminClearForm() {
    ['adm-title', 'adm-comp', 'adm-from', 'adm-to'].forEach(id => byId(id).value = '');
    byId('adm-vac-alert').classList.add('d-none');
}

async function adminUpdateBasket() {
    const id = byId('adm-b-city').value;
    const cost = Number(byId('adm-b-val').value);
    if (!Number.isFinite(cost) || cost <= 0 || !byId('adm-b-src').value.trim()) {
        alert('Укажите положительную стоимость и описание источника.');
        return;
    }
    try {
        if (location.protocol !== 'file:') {
            await api('/api/regions/' + id, 'PUT', { basket_cost: cost, source: byId('adm-b-src').value.trim() });
        }
        citiesData[id].basket_cost = cost;
        updateCalcCityOptions();
        byId('adm-basket-alert').textContent = 'Учебная стоимость набора обновлена! Индексы покупательной способности пересчитаны.';
        byId('adm-basket-alert').classList.remove('d-none');
        runHomeCompare();
        filterVacancies();
        runCalculator();
        updateDashboard();
        generateReport();
    } catch (error) {
        alert(error.message);
    }
}

function adminClearBasket() {
    byId('adm-b-val').value = citiesData[byId('adm-b-city').value].basket_cost;
    byId('adm-basket-alert').classList.add('d-none');
}

function generateReport() {
    const start = byId('rep-date-from').value;
    const end = byId('rep-date-to').value;
    const keys = ['c-ur', 'c-sal', 'c-nor', 'c-sur', 'c-kh', 'c-mur', 'c-yak'];
    const regions = ['Urengoy', 'Salekhard', 'Norilsk', 'Surgut', 'Khanty', 'Murmansk', 'Yakutsk'];
    const selected = regions.filter((region, index) => byId(keys[index]).checked).map(key => citiesData[key].name);
    reportRows = [];
    if (!start || !end || end < start || !selected.length) {
        byId('report-summary').textContent = 'Выберите хотя бы один город и корректный период: окончание не раньше начала.';
        byId('report-body').innerHTML = '';
        return;
    }
    const exp = normalizeExp(byId('rep-exp').value);
    const items = sampleVacancies.filter(vacancy => vacancy.date >= start && vacancy.date <= end && selected.includes(vacancy.city) && (exp === 'all' || vacancy.exp === exp));
    reportRows = summarize(items).sort((a, b) => (b.medSal || 0) - (a.medSal || 0));
    byId('report-body').innerHTML = reportRows.map(region => `<tr><td>${escapeText(region.name)}</td><td>${region.count}</td><td>${number(region.count / items.length * 100)}</td><td>${number(region.medSal)}</td><td>${number(region.avgSal)}</td><td>${number(region.basket_cost)}</td><td>${number(region.index)}</td></tr>`).join('');
    if (items.length) {
        byId('report-body').innerHTML += `<tr><th>Итого</th><td>${items.length}</td><td>100</td><td>${number(median(items.map(item => item.from).filter(value => value != null)))}</td><td colspan="3">Зарплатных сумм: ${items.filter(item => item.from != null).length}. Стоимости набора учебные.</td></tr>`;
    }
    byId('report-summary').textContent = items.length ? `Сформировано ${items.length} записей за ${start} — ${end}. Сортировка: медиана нижней границы по убыванию. Источник вакансий: переданная SQLite; цены учебные. Пропуски оплаты исключены только из зарплатных показателей.` : 'Нет данных для выбранных условий. Измените период, опыт или города.';
}

function resetReport() {
    byId('rep-date-from').value = '2023-03-23';
    byId('rep-date-to').value = '2023-06-18';
    byId('rep-exp').value = 'all';
    ['c-ur', 'c-sal', 'c-nor', 'c-sur', 'c-kh', 'c-mur', 'c-yak'].forEach(id => byId(id).checked = true);
    generateReport();
}

function exportDataCSV() {
    const rows = byId('screen-reports').classList.contains('active') ? reportRows : summarize(dashboardRows());
    if (!rows.length) {
        alert('Нет данных для выгрузки. Сначала сформируйте непустой результат.');
        return;
    }
    const lines = [
        ['Учебный отчёт: стоимости набора условные, вакансии 2023 года'],
        ['Город', 'Записей', 'Число сумм', 'Медиана нижней границы, руб.', 'Средняя нижняя граница, руб.', 'Учебная стоимость набора, руб.', 'Условный индекс'],
        ...rows.map(region => [region.name, region.count, region.salaryCount, region.medSal, region.avgSal, region.basket_cost, region.index])
    ];
    const csv = '\uFEFF' + lines.map(row => row.map(value => '"' + String(value ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Зарплаты_Севера_отчёт.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dashboardRows() {
    const city = byId('dash-city').value;
    const exp = normalizeExp(byId('dash-exp').value);
    return periodRows(byId('dash-period').value).filter(vacancy =>
        (city === 'all' || vacancy.city === (citiesData[city]?.name || city)) &&
        (exp === 'all' || vacancy.exp === exp)
    );
}

function updateDashboard() {
    const items = dashboardRows();
    const summary = summarize(items);
    const salaries = items.map(vacancy => vacancy.from).filter(value => value != null);
    const basket = summary.length ? summary.reduce((sum, region) => sum + region.basket_cost, 0) / summary.length : null;
    const salary = median(salaries);
    byId('kpi-count').textContent = number(items.length) + ' ед.';
    byId('kpi-salary').textContent = number(salary) + (salary == null ? '' : ' руб.');
    byId('kpi-basket').textContent = number(basket) + (basket == null ? '' : ' руб.');
    byId('kpi-index').textContent = salary != null && basket ? number(salary / basket) + ' наб.' : 'Нет данных';
    byId('dashboard-empty').textContent = 'Нет данных для выбранных фильтров. Измените параметры.';
    byId('dashboard-empty').classList.toggle('d-none', items.length > 0);
    charts.forEach(chart => chart.destroy());
    charts = [];
    const months = ['2023-03', '2023-04', '2023-05', '2023-06'];
    const experience = ['Нет опыта', 'От 1 года до 3 лет', 'От 3 до 6 лет', 'Более 6 лет'];
    const configs = [
        ['chartSalaries', 'bar', summary.map(region => region.name), [{ label: 'Медиана нижней границы, руб.', data: summary.map(region => region.medSal), backgroundColor: '#2563eb' }, { label: 'Учебный набор, руб.', data: summary.map(region => region.basket_cost), backgroundColor: '#f59e0b' }], 'Рубли'],
        ['chartPurchasing', 'bar', summary.map(region => region.name), [{ label: 'Учебный индекс, наборов', data: summary.map(region => region.index), backgroundColor: '#0d9488' }], 'Наборов'],
        ['chartTimeline', 'line', months, [{ label: 'Записей в выбранном срезе', data: months.map(month => items.filter(item => item.date.startsWith(month)).length), borderColor: '#2563eb', tension: 0.2 }], 'Записей'],
        ['chartExperience', 'doughnut', experience, [{ label: 'Число записей', data: experience.map(exp => items.filter(item => item.exp === exp).length), backgroundColor: ['#2563eb', '#0d9488', '#f59e0b', '#64748b'] }], 'Записей']
    ];
    configs.forEach(([id, type, labels, datasets, unit]) => charts.push(new Chart(byId(id), {
        type,
        data: { labels, datasets },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { font: { size: 11 } } } },
            scales: type === 'doughnut' ? {} : { y: { beginAtZero: true, title: { display: true, text: unit } } }
        }
    })));
}

function resetDashboardFilters() {
    ['dash-period', 'dash-city', 'dash-exp'].forEach(id => byId(id).value = 'all');
    updateDashboard();
}

async function initialize() {
    if (location.protocol !== 'file:') {
        try {
            sampleVacancies = await api('/api/vacancies', 'GET');
            citiesData = Object.fromEntries((await api('/api/regions', 'GET')).map(region => [region.id, region]));
        } catch (error) {
            document.querySelector('.status-note').textContent += ' API недоступен: показан локальный снимок, сохранение в SQLite недоступно.';
        }
    }
    byId('vac-query').addEventListener('keydown', event => { if (event.key === 'Enter') filterVacancies(); });
    byId('vac-only-salary').addEventListener('change', filterVacancies);
    byId('adm-b-city').addEventListener('change', adminClearBasket);
    updateCalcCityOptions();
    resetHomeCompare();
    filterVacancies();
    resetReport();
    adminClearBasket();
    runCalculator();
}

initialize();