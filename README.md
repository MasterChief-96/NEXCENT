# Nexcent 5.2: Netrun + Adminer + ЛР4

Для **Railway** начните с [docs/RAILWAY_RU.md](docs/RAILWAY_RU.md). Команда запуска и healthcheck уже заданы в `railway.json`; MySQL и ссылки DB_* добавляются в панели Railway.

Для **Netrun**: **docs/NETRUN_AND_TESTS_RU.md**. Подробная PDF-инструкция выдаётся отдельно.

- `compose.yaml`: Netrun, публичный сервис `web`, порт `8080`; сайт `/`, БД `/adminer/`.
- `.env.netrun.example`: список секретов для панели Netrun. Не загружайте заполненные `.env`.
- `compose.test.yaml` и `.env.test.example`: отдельная временная БД для локальных тестов.
- `qa/RESULTS_RU.md`: фактические результаты подготовки и то, что ещё нужно проверить.
- `docs/CHECKLIST_RU.md`: чек-лист и таблица для отчёта.
- `compose.vps.yaml`: прежний вариант для самостоятельного VPS; не основной путь этой инструкции.

Быстрый локальный запуск тестов (Node 24+, запущен Docker Desktop):

```powershell
npm ci
Copy-Item .env.test.example .env.test
docker compose -p nexcent-qa -f compose.test.yaml up -d --wait
npm run test:init
npm test
npm run coverage
npx playwright install chromium firefox
npm run start:test
```

Во втором терминале из этой же папки:

```powershell
npm run test:e2e
npm run test:browser
npm run test:browser:firefox
npm run test:load
```

Продуктовые данные не входят в архив. Первый запуск на пустой БД создаёт каталог и администратора из ADMIN_*. После успешного входа удалите ADMIN_PASSWORD из секретов. Старые аккаунты и пароли bootstrap не меняет.

Не используйте production-базу для автотестов. Не удаляйте том mysql_data при обновлениях.
