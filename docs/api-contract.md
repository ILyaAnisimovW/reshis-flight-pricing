# Контракт API v1
Один origin. JSON UTF-8, цена в рублях, спрос/продажи — оценка пассажиров, seats — мест всего. BigDecimal без округления в расчётах. UI до 2 знаков.
GET /api/catalog -> {routes:[{route,name,origin:"Москва",destination,base_price,cost_per_passenger,price_sensitivity,price_min,price_max,dates:["2026-06-01",...]}]}
POST /api/calculate {route,date,price} -> {route,date,price,seats,base_demand,demand,sales,quantiles:[{q:0.1,demand:...},...],warnings:[строки]}. Публичный расчёт; CSRF обязателен для POST.
GET /api/health -> {status:"UP"}; GET /api/ready -> {status:"UP",forecast_rows:155}. При повреждении CSV fail-fast без заглушки.
GET /api/auth/csrf -> {token,headerName}; получать снова после login/logout.
POST /api/auth/register JSON {username,password} -> 201 {username}; 409 дубликат. Не выполняет автоматический вход.
POST /api/auth/login application/x-www-form-urlencoded username/password -> 200 {username}; 401 неверные данные.
POST /api/auth/logout -> 200 {message}; cookie session + HttpOnly SameSite=Lax; Secure по окружению для HTTPS.
GET /api/auth/me -> {username}; 401 без сессии.
GET /api/account/report -> {username,message} — защищённая сервером памятка участника, публичный расчёт доступен без входа.
Ошибки всегда JSON {code,message}; 400 невалидный JSON/дата/цена/тип/маршрут; 404 отсутствующий рейс; 401 нет авторизации; 403 CSRF/доступ; 409 дубликат; 500 безопасная общая ошибка. Цена только JSON number >0, не строка и не boolean. Дата ISO строго.
Формула demand = 0.5_base_demand - price_sensitivity*(price-base_price); sales=min(seats,max(0,demand)). Каждый квантиль с той же ценой. Вне price_min/max допускается с warnings.
Данные src/main/resources/data/*.csv копируются из data/ приложения после проверки SHA. Только собственный прогноз. Java 21, Spring Boot 3.5.16, Gradle 8.14.3, Apache Commons CSV 1.14.1. H2 file + JDBC; BCrypt. Учётные записи не коммитить.
