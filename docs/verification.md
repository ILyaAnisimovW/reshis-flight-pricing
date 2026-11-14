# Протокол проверок — 14.11.2026

Среда: Windows, Temurin 21.0.10+7, Gradle Wrapper 8.14.3, Spring Boot 3.5.16. `gradlew.bat clean test bootJar --no-daemon`: BUILD SUCCESSFUL; 8 JUnit тестов, 0 failures: BackendCsvTest 2, BackendForecastTest 2, QaApiTest 3, QaAuthTest 1. Тесты сгруппированы: внутри несколько входов/проверок.

Проверены реальный Spring context и MockMvc, формула, clamp, девять квантилей, CSRF, register/duplicate/login/wrong password/logout/защищённый ресурс, schema/missing/corrupt/NaN/seats/duplicate CSV. Используется in-memory H2 только в изолированных тестах; сдаваемая конфигурация — H2 file.

JAR запущен отдельным Java процессом; scripts/verify-http.ps1 завершён PASS. scripts/verify-reference.ps1: 30 независимых сравнений CSV/API (5 маршрутов × 3 даты × 2 цены), все совпали. Числа в independent-reference-results.json. SHA прогноза совпадает с submission_verification.json ML: 154f3c8d587eb9ae70aa5cdd7c2d8d5133139511337755ab544e04a49d8f8b4c.

Браузер IAB: MOW-AER 01.06, 10000→713/713; 8000→995/900; 100000→-11977/0. График медианы совпадает, 9 строк таблицы. При изменении ввода result скрыт. Register/login/report/logout пройдены; реальный рестарт JAR и повторный вход тем же вымышленным пользователем подтверждают сохранность БД. Ширина 390 px: clientWidth=scrollWidth=390; десктоп и мобильный вид проверены визуально. Скриншоты в screenshots/.

Исправленные ошибки: конкурирующие Gradle clean запуски (первый результат не учитывался); кодировка Gradle worker argfile в пути с кириллицей (org.gradle.jvmargs=-Dfile.encoding=COMPAT, JavaCompile UTF-8; известная проблема https://github.com/gradle/gradle/issues/30304); неправильный тестовый эталон price_demand766 заменён на base_demand854; гонка init/me/CSRF устранена последовательностью и отключением request cache при сохранении CSRF. После правок полная сборка повторена успешно.

Ограничения проверки: не моделировался искусственно медленный ответ браузера (есть AbortController и номер запроса, проверены чтением); не ожидалось 30 минут для тайм-аута (конфигурация 30m, потеря сессии после рестарта проверена); нет полного аудита доступности со screen reader; Docker и публичный хостинг не запускались. Видео не записано. Порядок работ: часть дополнительных функций подготовлена параллельно до окончательной проверки ядра; включены и проверены после него.

CI и распаковка ZIP фиксируются отдельным дополнением после фактического выполнения.
