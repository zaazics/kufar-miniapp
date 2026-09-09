const tg = window.Telegram.WebApp;
tg.expand();

// ============================================================
// КОНФИГУРАЦИЯ
// ============================================================

// Укажите URL вашего API на Render после деплоя
const API_URL = "https://kufar-miniapp-api.onrender.com";

// ============================================================
// СОСТОЯНИЕ
// ============================================================

const state = {
    category: "phones",
    page: 1,
    totalPages: 1,
    ads: [],
    searchQuery: "",
    filterPrice: "all",
    filterCity: "all",
    categories: [],
    user_id: tg.initDataUnsafe?.user?.id || null,
    isLoading: false
};

// ============================================================
// ЭЛЕМЕНТЫ DOM
// ============================================================

const $ = (id) => document.getElementById(id);

const elements = {
    adsList: $("adsList"),
    stats: $("stats"),
    pageInfo: $("pageInfo"),
    adsCount: $("adsCount"),
    categoryTabs: $("categoryTabs"),
    searchInput: $("searchInput"),
    searchBtn: $("searchBtn"),
    filterPrice: $("filterPrice"),
    filterCity: $("filterCity"),
    filterBtn: $("filterBtn"),
    prevPage: $("prevPage"),
    nextPage: $("nextPage"),
    refreshBtn: $("refreshBtn"),
    closeBtn: $("closeBtn")
};

// ============================================================
// API
// ============================================================

async function api(method, params = {}) {
    try {
        const url = new URL("/api", API_URL);
        
        if (method === "GET") {
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null && v !== "") {
                    url.searchParams.append(k, v);
                }
            });
        }
        
        const options = {
            method: method,
            headers: {
                "Content-Type": "application/json"
            }
        };
        
        if (method === "POST") {
            options.body = JSON.stringify(params);
        }
        
        const response = await fetch(url.toString(), options);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error("API Error:", error);
        throw error;
    }
}

// ============================================================
// ЗАГРУЗКА КАТЕГОРИЙ
// ============================================================

async function loadCategories() {
    try {
        const data = await api("GET", { action: "get_categories" });
        state.categories = data.categories || [];
        renderCategories();
    } catch (err) {
        console.error("Ошибка загрузки категорий:", err);
        // Используем категории по умолчанию, если API недоступен
        state.categories = [
            { key: "phones", name: "📱 Телефоны" },
            { key: "consoles", name: "🎮 Приставки" },
            { key: "gpu", name: "🖥 Видеокарты" },
            { key: "cpu", name: "⚡ Процессоры" },
            { key: "laptops", name: "💻 Ноутбуки" },
            { key: "monitors", name: "🖥 Мониторы" }
        ];
        renderCategories();
    }
}

// ============================================================
// ЗАГРУЗКА ОБЪЯВЛЕНИЙ
// ============================================================

async function loadAds() {
    if (state.isLoading) return;
    
    state.isLoading = true;
    elements.adsList.innerHTML = '<div class="loading">⏳ Загрузка...</div>';

    try {
        const data = await api("GET", {
            action: "get_ads",
            category: state.category,
            page: state.page,
            search: state.searchQuery,
            price: state.filterPrice,
            city: state.filterCity,
            user_id: state.user_id
        });

        if (data.error) {
            elements.adsList.innerHTML = `<div class="empty">❌ ${data.error}</div>`;
            return;
        }

        renderAds(data);
    } catch (err) {
        elements.adsList.innerHTML = `<div class="empty">❌ Ошибка загрузки: ${err.message}</div>`;
    } finally {
        state.isLoading = false;
    }
}

// ============================================================
// ОТРИСОВКА
// ============================================================

function renderCategories() {
    elements.categoryTabs.innerHTML = "";
    
    state.categories.forEach((cat) => {
        const btn = document.createElement("button");
        btn.textContent = cat.name;
        btn.className = cat.key === state.category ? "active" : "";
        btn.onclick = () => {
            state.category = cat.key;
            state.page = 1;
            renderCategories();
            loadAds();
        };
        elements.categoryTabs.appendChild(btn);
    });
}

function renderAds(data) {
    state.totalPages = data.totalPages || 1;
    state.ads = data.ads || [];

    // Статистика
    const total = data.total || state.ads.length;
    elements.stats.textContent = `📦 Найдено: ${total} объявлений`;
    elements.adsCount.textContent = total;

    // Пагинация
    elements.pageInfo.textContent = `${data.page || 1} / ${state.totalPages}`;
    elements.prevPage.disabled = data.page <= 1;
    elements.nextPage.disabled = data.page >= state.totalPages;

    // Список объявлений
    if (!state.ads.length) {
        elements.adsList.innerHTML = '<div class="empty">📭 Объявлений не найдено</div>';
        return;
    }

    elements.adsList.innerHTML = state.ads.map((ad) => {
        const isBest = ad.is_best || (ad.savings && ad.savings > 0);
        const priceDisplay = ad.price || "Цена не указана";
        const titleDisplay = ad.title || "Без названия";
        const cityDisplay = ad.city || "Город не указан";
        const timeDisplay = ad.time || "Не указано";
        const memoryDisplay = ad.memory ? `💾 ${ad.memory}ГБ` : "";
        const conditionDisplay = ad.condition || "";
        
        // Формируем характеристики
        let specs = [];
        if (memoryDisplay) specs.push(memoryDisplay);
        if (conditionDisplay) specs.push(conditionDisplay);
        const specsText = specs.length ? ` 📌 ${specs.join(' | ')}` : "";

        return `
            <div class="ad-card ${isBest ? 'best' : ''}">
                ${isBest ? '<div class="best-label">🏆 САМОЕ ВЫГОДНОЕ!</div>' : ''}
                <div class="title">${titleDisplay}</div>
                ${specsText}
                <div class="price">${priceDisplay}</div>
                <div class="meta">
                    <span>📍 ${cityDisplay}</span>
                    <span>🕐 ${timeDisplay}</span>
                    ${ad.savings ? `<span class="savings">💰 Экономия: ${ad.savings} BYN (${ad.savings_percent}%)</span>` : ''}
                    ${ad.avg_price ? `<span>📊 Рынок: ${ad.avg_price} BYN</span>` : ''}
                </div>
                <div class="actions">
                    <button class="btn-primary" onclick="openLink('${ad.url}')">🔗 Открыть</button>
                    ${ad.is_favorite 
                        ? `<button class="btn-saved" onclick="removeFavorite('${ad.url}')">⭐ В избранном</button>`
                        : `<button class="btn-secondary" onclick="saveAd('${ad.url}', '${escapeString(titleDisplay)}', '${escapeString(priceDisplay)}', '${escapeString(cityDisplay)}')">⭐ Сохранить</button>`
                    }
                </div>
            </div>
        `;
    }).join('');
}

// Вспомогательная функция для экранирования кавычек
function escapeString(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// ============================================================
// ДЕЙСТВИЯ
// ============================================================

window.openLink = (url) => {
    if (url) {
        tg.openTelegramLink(url);
    } else {
        tg.showAlert("❌ Ссылка недоступна");
    }
};

window.saveAd = async (url, title, price, city) => {
    try {
        const data = await api("POST", {
            action: "save_ad",
            user_id: state.user_id,
            url: url,
            title: title,
            price: price,
            city: city
        });
        tg.showAlert(data.message || "✅ Сохранено в избранное!");
        loadAds();
    } catch (error) {
        tg.showAlert(`❌ Ошибка сохранения: ${error.message}`);
    }
};

window.removeFavorite = async (url) => {
    try {
        const data = await api("POST", {
            action: "remove_favorite",
            user_id: state.user_id,
            url: url
        });
        tg.showAlert(data.message || "🗑 Удалено из избранного");
        loadAds();
    } catch (error) {
        tg.showAlert(`❌ Ошибка удаления: ${error.message}`);
    }
};

// ============================================================
// СОБЫТИЯ
// ============================================================

// Поиск
elements.searchBtn.onclick = () => {
    state.searchQuery = elements.searchInput.value.trim();
    state.page = 1;
    loadAds();
};

elements.searchInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter") {
        elements.searchBtn.click();
    }
});

// Фильтры
elements.filterBtn.onclick = () => {
    state.filterPrice = elements.filterPrice.value;
    state.filterCity = elements.filterCity.value;
    state.page = 1;
    loadAds();
};

// Пагинация
elements.prevPage.onclick = () => {
    if (state.page > 1) {
        state.page--;
        loadAds();
    }
};

elements.nextPage.onclick = () => {
    if (state.page < state.totalPages) {
        state.page++;
        loadAds();
    }
};

// Обновление
elements.refreshBtn.onclick = () => {
    loadAds();
    tg.showAlert("🔄 Обновлено!");
};

// Закрытие
elements.closeBtn.onclick = () => {
    tg.close();
};

// ============================================================
// ЗАПУСК
// ============================================================

async function init() {
    // Показываем загрузку
    elements.adsList.innerHTML = '<div class="loading">⏳ Загрузка...</div>';
    
    // Загружаем категории
    await loadCategories();
    
    // Загружаем объявления
    await loadAds();
    
    // Отмечаем, что мини-апп готов
    tg.ready();
    
    console.log("📱 Мини-апп загружен!");
    console.log(`👤 Пользователь: ${state.user_id || "Не авторизован"}`);
    console.log(`📂 Категория: ${state.category}`);
    console.log(`🌐 API: ${API_URL}`);
}

// Запускаем приложение
init().catch((error) => {
    console.error("❌ Ошибка инициализации:", error);
    elements.adsList.innerHTML = `<div class="empty">❌ Ошибка загрузки приложения: ${error.message}</div>`;
});
