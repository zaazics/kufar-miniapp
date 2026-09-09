import json
import asyncio
from aiohttp import web
from parser.fetcher import fetch_page
from parser.extractor import extract_ads, analyze_prices, format_ads_message_with_analysis
from parser.categories import CATEGORIES, build_search_url
from parser.analyzer import analyze_market
from storage.db import add_favorite, get_favorites, get_user_categories


async def handle_api(request):
    """Обработчик API для мини-аппа"""
    try:
        if request.method == 'GET':
            return await handle_get(request)
        elif request.method == 'POST':
            return await handle_post(request)
        return web.json_response({"error": "Метод не поддерживается"}, status=405)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def handle_get(request):
    """Обработка GET запросов"""
    params = request.query
    action = params.get('action')
    
    if action == 'get_ads':
        return await get_ads_handler(params)
    elif action == 'get_favorites':
        return await get_favorites_handler(params)
    elif action == 'get_categories':
        return await get_categories_handler()
    elif action == 'get_market_analysis':
        return await get_market_analysis_handler(params)
    
    return web.json_response({"error": "Неизвестное действие"})


async def handle_post(request):
    """Обработка POST запросов"""
    data = await request.json()
    action = data.get('action')
    
    if action == 'save_ad':
        return await save_ad_handler(data)
    elif action == 'remove_favorite':
        return await remove_favorite_handler(data)
    
    return web.json_response({"error": "Неизвестное действие"})


# ===== ОСНОВНЫЕ ОБРАБОТЧИКИ =====

async def get_ads_handler(params):
    """Получение объявлений с фильтрацией и пагинацией"""
    category = params.get('category', 'phones')
    page = int(params.get('page', 1))
    search = params.get('search', '')
    price_filter = params.get('price', 'all')
    city_filter = params.get('city', 'all')
    user_id = params.get('user_id')
    
    # Парсим объявления
    url = build_search_url(category)
    html = await fetch_page(url)
    
    if not html:
        return web.json_response({"error": "Не удалось загрузить страницу"})
    
    ads = extract_ads(html, category)
    
    # Фильтрация по поиску
    if search:
        ads = [a for a in ads if search.lower() in a.get('title', '').lower()]
    
    # Фильтрация по городу
    if city_filter and city_filter != 'all':
        city_map = {
            'minsk': 'Минск', 'gomel': 'Гомель', 'mogilev': 'Могилев',
            'vitebsk': 'Витебск', 'grodno': 'Гродно', 'brest': 'Брест'
        }
        city_name = city_map.get(city_filter, '')
        if city_name:
            ads = [a for a in ads if city_name.lower() in a.get('city', '').lower()]
    
    # Фильтрация по цене
    if price_filter and price_filter != 'all':
        ads = filter_by_price(ads, price_filter)
    
    # Анализ цен
    analyzed = analyze_prices(ads)
    ads = analyzed.get('ads', [])
    avg_price = analyzed.get('avg_price', 0)
    best_deal = analyzed.get('best_deal')
    
    # Добавляем среднюю цену и is_best
    for ad in ads:
        ad['avg_price'] = avg_price
        ad['is_best'] = best_deal and ad.get('url') == best_deal.get('url')
        
        # Рассчитываем экономию
        if ad.get('price_value') and avg_price:
            diff = avg_price - ad['price_value']
            if diff > 0:
                ad['savings'] = round(diff, 2)
                ad['savings_percent'] = round((diff / avg_price) * 100, 1)
    
    # Пагинация
    ads_per_page = 5
    total = len(ads)
    total_pages = (total + ads_per_page - 1) // ads_per_page if ads else 1
    page = min(page, total_pages) if total_pages > 0 else 1
    start = (page - 1) * ads_per_page
    end = min(start + ads_per_page, total)
    
    # Получаем избранное пользователя
    favorites = []
    if user_id:
        favorites = get_favorites(int(user_id))
        fav_urls = [f['url'] for f in favorites]
        for ad in ads[start:end]:
            ad['is_favorite'] = ad.get('url') in fav_urls
    
    return web.json_response({
        "ads": ads[start:end],
        "total": total,
        "page": page,
        "totalPages": total_pages,
        "avg_price": avg_price,
        "best_deal": best_deal
    })


async def get_favorites_handler(params):
    """Получение избранных объявлений"""
    user_id = params.get('user_id')
    if not user_id:
        return web.json_response({"error": "Не указан пользователь"})
    
    favorites = get_favorites(int(user_id))
    return web.json_response({
        "favorites": favorites
    })


async def get_categories_handler():
    """Получение списка категорий"""
    categories = []
    for key, cat in CATEGORIES.items():
        categories.append({
            "key": key,
            "name": cat['name'],
            "emoji": cat['name'].split()[0] if cat['name'].split() else '📱'
        })
    return web.json_response({"categories": categories})


async def get_market_analysis_handler(params):
    """Анализ рынка"""
    category = params.get('category', 'phones')
    
    url = build_search_url(category)
    html = await fetch_page(url)
    
    if not html:
        return web.json_response({"error": "Не удалось загрузить страницу"})
    
    ads = extract_ads(html, category)
    analysis = analyze_market(ads)
    
    return web.json_response(analysis)


async def save_ad_handler(data):
    """Сохранение объявления в избранное"""
    user_id = data.get('user_id')
    url = data.get('url')
    title = data.get('title', '')
    price = data.get('price', '')
    city = data.get('city', '')
    
    if not user_id or not url:
        return web.json_response({"error": "Недостаточно данных"})
    
    add_favorite(int(user_id), url, title, price, city)
    return web.json_response({"message": "✅ Объявление сохранено в избранное!"})


async def remove_favorite_handler(data):
    """Удаление из избранного"""
    user_id = data.get('user_id')
    url = data.get('url')
    
    if not user_id or not url:
        return web.json_response({"error": "Недостаточно данных"})
    
    from storage.db import remove_favorite
    remove_favorite(int(user_id), url)
    return web.json_response({"message": "🗑 Объявление удалено из избранного"})


# ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

def filter_by_price(ads, price_filter):
    """Фильтрация по цене"""
    filtered = []
    for ad in ads:
        price_value = ad.get('price_value')
        if price_value is None:
            continue
        
        if price_filter == '0-100' and price_value <= 100:
            filtered.append(ad)
        elif price_filter == '100-300' and 100 < price_value <= 300:
            filtered.append(ad)
        elif price_filter == '300-500' and 300 < price_value <= 500:
            filtered.append(ad)
        elif price_filter == '500-1000' and 500 < price_value <= 1000:
            filtered.append(ad)
        elif price_filter == '1000+' and price_value > 1000:
            filtered.append(ad)
    
    return filtered if filtered else ads


# ===== ЗАПУСК API СЕРВЕРА =====

async def start_api_server():
    """Запускает API сервер для мини-аппа"""
    app = web.Application()
    app.router.add_get('/api', handle_api)
    app.router.add_post('/api', handle_api)
    app.router.add_get('/health', lambda r: web.json_response({"status": "OK"}))
    
    # Добавляем маршрут для отдачи index.html
    from pathlib import Path
    import os
    
    # Если файл index.html есть в папке frontend
    frontend_dir = Path(__file__).parent / 'frontend'
    if frontend_dir.exists():
        app.router.add_static('/', frontend_dir)
    
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', 8081)
    await site.start()
    print("✅ API сервер запущен на порту 8081")
    
    while True:
        await asyncio.sleep(3600)
