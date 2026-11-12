# API Nexcent

Все пути начинаются с `/api`. Формат тела — JSON. Cookie `nx_session` передаётся браузером автоматически. Сначала вызовите `GET /api/session` и возьмите `csrfToken`. Для POST/PUT/DELETE передавайте `X-CSRF-Token` и `Content-Type: application/json`. После входа/регистрации/смены пароля используйте новый токен из ответа.

При ошибке: `{ "error": "Сообщение", "fields": [{"field":"имя поля","message":"причина"}] }`; `fields` есть только при ошибках проверки полей. HTTP: 400 — неверные данные; 401 — нужен вход; 403 — роль/CSRF; 404 — не найдено; 409 — конфликт; 413 — тело слишком велико; 429 — слишком частые запросы; 500 — ошибка сервера.

## Аккаунт

| Метод | Путь | Доступ | Содержание |
|---|---|---|---|
| GET | `/health` | Все | Проверка БД |
| GET | `/session` | Все | `{user, csrfToken}` |
| POST | `/register` | Все | `name,email,phone,password,password_confirm,privacy:true,terms:true` |
| POST | `/login` | Все | `identifier` (email/телефон), `password`, `remember` (boolean) |
| POST | `/logout` | Все | `{}`; удаляет текущую сессию |
| GET | `/profile` | Пользователь | `{user,state}` без хэша пароля |
| PUT | `/profile` | Пользователь | `name,email,phone`; роль игнорируется |
| PUT | `/profile/password` | Пользователь | `current_password,password,password_confirm` |
| GET | `/actions` | Пользователь | Последние 100 действий |
| GET | `/sessions` | Пользователь | Свои активные сессии без токенов |
| DELETE | `/sessions` | Пользователь | `{}`; завершить остальные сессии |

Телефон нормализуется к `+кодстраныномер`; российское начало `8` при 11 цифрах преобразуется в `+7`. Пароль — от 8 символов, до 72 байт UTF-8 (ограничение bcrypt).

## Каталог и корзина

| Метод | Путь | Доступ | Содержание |
|---|---|---|---|
| GET | `/products` | Все | Доступный каталог |
| GET | `/products/:id` | Все | Блюдо, фото; добавляет в просмотренные |
| GET | `/categories` | Все | Категории |
| GET | `/search?q=...` | Все | Поиск 1–100 символов, история в сессии |
| GET | `/favorites` | Пользователь | Массив ID избранного |
| PUT | `/favorites/:id` | Пользователь | `{selected:true/false}` |
| GET | `/cart` | Пользователь | Собственная корзина с текущими ценами |
| PUT | `/cart` | Пользователь | Заменить состав: `{items:[{product_id:1,quantity:2}]}` |
| POST | `/cart/merge` | Пользователь | Добавить гостевой состав, тот же формат |

Не более 50 строк корзины и 50 порций одного блюда. Цены от клиента не принимаются. Отсутствующее/недоступное блюдо вызывает 409.

## Заказы, отзывы и бронь

| Метод | Путь | Доступ | Содержание |
|---|---|---|---|
| POST | `/orders` | Пользователь | `note`, `privacy:true`, `idempotency_key` (UUID); состав из корзины |
| GET | `/orders` | Пользователь | Свои заказы с позициями |
| POST | `/orders/:id/cancel` | Владелец | `{}`; отмена только pending |
| POST | `/feedback` | Пользователь | `subject,message,kind,privacy:true`, для kind=review ещё rating |
| GET | `/feedback` | Пользователь | Свои обращения и отзывы |
| GET | `/reviews?page=1` | Все | Опубликованные отзывы, средняя оценка без примеров, 12 на страницу |
| POST | `/bookings` | Пользователь | См. пример ниже |
| GET | `/bookings` | Пользователь | Свои бронирования |
| POST | `/bookings/:id/cancel` | Владелец | `{}`; отмена будущих pending/confirmed |

Пример заявки на стол (дата должна находиться в ближайших 90 днях):

```json
{
  "date": "2026-10-25",
  "time": "18:30",
  "guests": 2,
  "table_preference": "window",
  "message": "Хотелось бы столик у окна.",
  "dinner": [1,4,7],
  "privacy": true, "policy": true,
  "idempotency_key": "5c6ec2f1-6026-4825-a7bf-0e12198cfd43"
}
```

Время 12:00–21:30 с шагом 30 минут, часовой пояс Europe/Moscow. `table_preference`: any/window/quiet/company. `dinner` — до трёх ID, это план, не оплаченный заказ. Данные гостя берутся из текущего профиля.

## Администратор

Все `/admin/*` требуют роль admin. Каждый запрос повторно проверяет роль и блокировку через БД.

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/admin/overview` | Статистика |
| GET/POST | `/admin/products` | Список с недоступными блюдами / создание |
| PUT/DELETE | `/admin/products/:id` | Изменение / архивирование |
| GET | `/admin/users` | Пользователи без паролей |
| PUT | `/admin/users/:id` | `{role:"user"/"admin",blocked:boolean}`; сессии пользователя отзываются |
| GET | `/admin/feedback` | Все обращения/отзывы |
| PUT | `/admin/feedback/:id` | `status:new/in_progress/resolved`, `moderation:pending/published/rejected`, `response` |
| GET | `/admin/orders` | Заказы с позициями |
| PUT | `/admin/orders/:id` | `status`: pending → confirmed → ready → completed; активный можно отменить |
| GET | `/admin/bookings` | Бронирования |
| PUT | `/admin/bookings/:id` | `status`: pending → confirmed → completed; активный можно отменить |

Тело блюда: `name`, `alias` (латиница/цифры/дефисы), `category_id`, `manufacturer_id` (по умолчанию 1), `short_description`, `description`, `price` (число), `image` (`assets/имя.webp`), `available`, `vegetarian`, `weight`, `allergens`. Дополнительно `meta_keywords`, `meta_description`, `meta_title`, `images:[{image,title}]`. Файлы должны существовать в `public/assets`. Выполнение HTML/JavaScript и внешние URL в поле изображения не допускаются.

## Уточнения версии 5.1

Для регистрации, обращения/отзыва, брони и заказа передавайте `privacy: true` и `policy: true`; при регистрации также `terms: true`. Отсутствие любого обязательного подтверждения возвращает 400.

`GET /api/cart` и `PUT /api/cart` доступны гостю в пределах его серверной сессии; PUT по-прежнему требует CSRF. Для вошедшего пользователя корзина хранится в `cart_items`, а её копия — в `user_sessions.state.cart`. `POST /api/cart/merge` и оформление заказа требуют авторизации. Гостевая корзина из localStorage переносится существующим клиентским сценарием после входа.

`PUT /api/admin/products/:id`: если `manufacturer_id` отсутствует, производитель сохраняется. Если `images` отсутствует, галерея сохраняется. Явно переданный массив `images` заменяет галерею; основная фотография добавляется, если её нет в массиве. Редактируются только значения свойств `weight` и `allergens`; их `id`, доплаты и все остальные свойства сохраняются. Форма админки не посылает массив `images` при обычном редактировании.

HTML и TXT политики используют `LEGAL_OPERATOR_NAME`, `LEGAL_OPERATOR_ADDRESS`, `LEGAL_CONTACT_EMAIL` из окружения при заполнении всех трёх полей.
