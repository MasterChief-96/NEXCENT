> Это альтернативная инструкция для VPS. Для Netrun используйте NETRUN_AND_TESTS_RU.md и основной compose.yaml.

# Размещение на VPS в РФ

## 1. Сервер и домен

Подойдёт VPS с Ubuntu 24.04, 2 vCPU, 4 ГБ RAM, диском от 40 ГБ. Выберите российский дата-центр, публичный IPv4 и резервное копирование. Timeweb Cloud предоставляет VPS с выбором локации; Beget предлагает готовую установку Docker и бэкапы VPS. Условия проверены по официальным страницам 16.10.2026; окончательная цена зависит от региона, конфигурации и дополнительных услуг:

- https://timeweb.cloud/services/vds-vps
- https://beget.com/ru/vps

Установите Docker Engine и Compose plugin по официальной инструкции https://docs.docker.com/engine/install/ubuntu/ либо выберите образ с Docker у провайдера. Проверка: `docker --version` и `docker compose version`.

Создайте DNS-запись A для своего домена на IP сервера. Если опубликована AAAA-запись, она тоже должна указывать на работающий сервер; иначе удалите её. На сервере и в панели провайдера откройте TCP 80/443, UDP 443 при необходимости HTTP/3; SSH ограничьте своим доступом. MySQL наружу не открывается.

## 2. Подготовка

Скопируйте весь проект, например, в `/opt/nexcent`. Перейдите в эту папку и создайте настройки:

```bash
docker run --rm -v "${PWD}:/work" -w /work node:24-alpine node scripts/setup.js
```

В `.env` измените:

```dotenv
NODE_ENV=production
DOMAIN=restaurant.example.ru
APP_ORIGIN=https://restaurant.example.ru
TRUST_PROXY=1
SEED_DEMO_REVIEWS=false
```

Замените домен своим. У `APP_ORIGIN` не должно быть завершающего `/`. Случайные пароли БД из setup оставьте. Права на файл: `chmod 600 .env`. Значение `TRUST_PROXY=1` рассчитано на один Caddy перед приложением. В compose порт приложения опубликован только на localhost.

Прежде чем принимать реальные обращения, замените учебные адрес, тексты, команду и политику данных; настройте обработку заявок владельцем. Демонстрационные отзывы можно убрать из публикации в панели. `SEED_DEMO_REVIEWS=false` предотвращает их добавление при первом заполнении, но не удаляет уже созданные.

## 3. Запуск с HTTPS

```bash
docker compose -f compose.vps.yaml --profile production up -d --build
docker compose -f compose.vps.yaml ps
docker compose -f compose.vps.yaml logs --tail=100 app caddy
docker compose -f compose.vps.yaml exec app node scripts/admin.js
```

Caddy получает TLS-сертификат автоматически, когда DNS и доступность портов настроены. Откройте `https://ваш-домен`, войдите администратором и проверьте `/admin.html`. Затем выполните тестовую регистрацию, заказ, бронь и отзыв, подтвердите/обработайте их через панель.

Проверка здоровья: `https://ваш-домен/api/health` возвращает `{"ok":true}` только при доступной базе.

## 4. Резервные копии

Из папки проекта:

```bash
bash scripts/backup.sh
```

Получится файл `backups/nexcent-ДАТА.sql.gz`. Копируйте резервные копии также вне VPS и ограничьте доступ: они содержат данные пользователей. Скрипт ничего не удаляет автоматически. Настройте ежедневный запуск, например через cron, и разумный срок хранения копий у себя. Файлы сайта и `.env` сохраняйте отдельно в защищённом месте.

Проверяйте восстановление на отдельной базе. Для восстановления **осознанно выбранной** копии в текущую базу (существующие таблицы будут заменены содержимым дампа):

```bash
docker compose -f compose.vps.yaml stop app
gzip -dc backups/ИМЯ-КОПИИ.sql.gz | docker compose -f compose.vps.yaml exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot "$MYSQL_DATABASE"'
docker compose -f compose.vps.yaml start app
```

Не запускайте восстановление на рабочей базе без свежей резервной копии текущего состояния.

## 5. Обновление

Сделайте резервную копию. Замените исходники новой версией, сохраняя `.env` и Docker volumes. Выполните:

```bash
docker compose -f compose.vps.yaml --profile production up -d --build
docker compose -f compose.vps.yaml logs --tail=100 app
```

Первичная миграция идемпотентна; её checksum защищает от незаметного изменения уже применённой схемы. В текущей версии одна миграция. Для дальнейших изменений схемы добавляйте новые версионируемые миграции и расширяйте runner, а не меняйте `001-schema.sql` на работающей базе. Seed не перезаписывает каталог.

## Если что-то не работает

- `ECONNREFUSED`: база не запущена либо неверные host/port; в Docker нужен `DB_HOST=db` (compose задаёт автоматически).
- `Access denied`: проверьте пароль и пользователя. Изменение `.env` после создания MySQL volume **не меняет пароль внутри БД**; меняйте его SQL-командой и затем в `.env`.
- Ошибка CSRF после смены домена: проверьте `APP_ORIGIN`, перезапустите app и обновите страницу. Входите по тому адресу, который указан в настройках.
- Cookie не сохраняется: в `production` нужен HTTPS. Для локального HTTP используйте `NODE_ENV=development`.
- Ошибка сертификата: проверьте A/AAAA, открытые 80/443, занятые порты и логи Caddy.
- Заказ/бронь не подтверждены: откройте админ-панель. Автоматического подтверждения и внешней рассылки нет.

## Дополнительные официальные материалы

- Express, защита production-приложений: https://expressjs.com/en/advanced/best-practice-security/
- mysql2, параметризованные запросы и пул: https://sidorares.github.io/node-mysql2/docs
- Caddy, автоматический HTTPS: https://caddyserver.com/docs/automatic-https

Сам сайт в этот момент не размещён на новом VPS: архив содержит готовые конфигурации, сервер и домен выбирает владелец.
