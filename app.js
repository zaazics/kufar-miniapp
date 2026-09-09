const tg = window.Telegram.WebApp;
tg.expand();

// ===== СОСТОЯНИЕ =====
const state = {
    category: "phones",
    page: 1,
    totalPages: 1,
    ads: [],
    searchQuery: "",
    filterPrice: "all",
    filterCity: "all",
    categories: [],
    user_id: tg.initDataUnsafe?.user?.id || null
};

// ===== ЭЛЕМЕНТЫ =====
const $ = (id) => document.getElementById(id);
const adsList = $("adsList");
const stats = $("stats");
const pageInfo = $("pageInfo");
const adsCount = $("adsCount");
const categoryTabs = $("categoryTabs");

// ===== API =====
async function api(method, params = {}) {
    const url = new URL("/api", window.location.origin);
    if (method === "GET") {
        Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
    }
    const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "POST" ? JSON.stringify(params) : undefined,
    });
    return res.json();
}

// ===== ЗАГРУЗКА КАТЕГОРИЙ =====
async function loadCategories() {
    try {
        const data = await api("GET", { action: "get_categories" });
        state.categories = data.categories || [];
        renderCategories();
    } catch (err) {
        console.error("Ошибка загрузки категорий:", err);
    }
}

// ===== ЗАГРУЗКА ОБЪЯВЛЕНИЙ =====
async function loadAds() {
    adsList.innerHTML = '<div class="loading">⏳ Загрузка...</div>';

    try {
        const data = await api("GET", {
            action: "get_ads",
            category: state.category,
            page: state.page,
            search: state.searchQuery,
            price: state.filterPrice,
            city: state.filterCity,
            user_id: state.user_id,
        });

        if (data.error) {
            adsList.innerHTML = `<div class="empty">❌ ${data.error}</div>`;
            return;
        }

        renderAds(data);
    } catch (err) {
        adsList.innerHTML = `<div class="empty">❌ Ошибка: ${err.message}</div>`;
    }
}

// ===== ОТРИСОВКА КАТЕГОРИЙ =====
function renderCategories() {
    categoryTabs.innerHTML = "";
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
        categoryTabs.appendChild(btn);
    });
}

// ===== ОТРИСОВКА ОБЪЯВЛЕНИЙ =====
function renderAds(data) {
    state.totalPages = data.totalPages || 1;
    state.ads = data.ads || [];

    stats.textContent = `📦 Найдено: ${data.total || state.ads.length} объявлений`;
    adsCount.textContent = data.total || state.ads.length;

    pageInfo.textContent = `${data.page || 1} / ${state.totalPages}`;
    $("prevPage").disabled = data.page <= 1;
    $("nextPage").disabled = data.page >= state.totalPages;

    if (!state.ads.length) {
        adsList.innerHTML = '<div class="empty">📭 Объявлений не найдено</div>';
        return;
    }

    adsList.innerHTML = state.ads
        .map((ad) => {
            const isBest = ad.is_best || (ad.savings && ad.savings > 0);
            return `
                <div class="ad-card ${isBest ? "best" : ""}">
                    ${isBest ? '<div class="best-label">🏆 САМОЕ ВЫГОДНОЕ!</div>' : ""}
                    <div class="title">${ad.title || "Без названия"}</div>
                    <div class="price">${ad.price || "Цена не указана"}</div>
                    <div class="meta">
                        <span>📍 ${ad.city || "Город не указан"}</span>
                        <span>🕐 ${ad.time || "Не указано"}</span>
                        ${ad.savings ? `<span class="savings">💰 Экономия: ${ad.savings} BYN (${ad.savings_percent}%)</span>` : ""}
                        ${ad.avg_price ? `<span>📊 Рынок: ${ad.avg_price} BYN</span>` : ""}
                    </div>
                    <div class="actions">
                        <button class="btn-primary" onclick="openLink('${ad.url}')">🔗 Открыть</button>
                        ${ad.is_favorite 
                            ? `<button class="btn-saved" onclick="removeFavorite('${ad.url}')">⭐ В избранном</button>`
                            : `<button class="btn-secondary" onclick="saveAd('${ad.url}', '${ad.title}', '${ad.price}', '${ad.city}')">⭐ Сохранить</button>`
                        }
                    </div>
                </div>
            `;
        })
        .join("");
}

// ===== ДЕЙСТВИЯ =====
window.openLink = (url) => {
    if (url) tg.openTelegramLink(url);
    else tg.showAlert("❌ Ссылка недоступна");
};

window.saveAd = async (url, title, price, city) => {
    try {
        const data = await api("POST", {
            action: "save_ad",
            user_id: state.user_id,
            url: url,
            title: title,
            price: price,
            city: city,
        });
        tg.showAlert(data.message || "✅ Сохранено!");
        loadAds();
    } catch {
        tg.showAlert("❌ Ошибка сохранения");
    }
};

window.removeFavorite = async (url) => {
    try {
        const data = await api("POST", {
            action: "remove_favorite",
            user_id: state.user_id,
            url: url,
        });
        tg.showAlert(data.message || "🗑 Удалено!");
        loadAds();
    } catch {
        tg.showAlert("❌ Ошибка удаления");
    }
};

// ===== СОБЫТИЯ =====
$("searchBtn").onclick = () => {
    state.searchQuery = $("searchInput").value.trim();
    state.page = 1;
    loadAds();
};

$("searchInput").addEventListener("keyup", (e) => {
    if (e.key === "Enter") $("searchBtn").click();
});

$("filterBtn").onclick = () => {
    state.filterPrice = $("filterPrice").value;
    state.filterCity = $("filterCity").value;
    state.page = 1;
    loadAds();
};

$("prevPage").onclick = () => {
    if (state.page > 1) {
        state.page--;
        loadAds();
    }
};

$("nextPage").onclick = () => {
    if (state.page < state.totalPages) {
        state.page++;
        loadAds();
    }
};

$("refreshBtn").onclick = loadAds;

$("closeBtn").onclick = () => tg.close();

// ===== ЗАПУСК =====
async function init() {
    await loadCategories();
    await loadAds();
    tg.ready();
}

init();
