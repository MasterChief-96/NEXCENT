import { query, pool } from './db.js';
export async function products(db=pool,admin=false) {
 const rows=await query(`SELECT p.*, c.alias category,c.name category_name,
 (SELECT property_value FROM product_properties WHERE product_id=p.id AND property_name='weight') weight,
 (SELECT property_value FROM product_properties WHERE product_id=p.id AND property_name='allergens') allergens
 FROM products p JOIN categories c ON c.id=p.category_id WHERE p.deleted_at IS NULL ${admin?'':'AND p.available=1'} ORDER BY p.id`,[],db);
 return rows.map(r=>({...r,id:String(r.id),available:!!r.available,vegetarian:!!r.vegetarian}));
}
export const escapeHTML = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function productCard(p) {
 const e=escapeHTML;
 return `<article class="dish-card" id="dish-${p.id}" data-dish="${p.id}" data-category="${e(p.category)}" data-vegetarian="${p.vegetarian}">
 <div class="dish-card__media"><img class="dish-card__image" src="${e(p.image)}" width="640" height="480" loading="lazy" alt="${e(p.name)}"><button class="favorite-button" type="button" data-favorite="${p.id}" aria-pressed="false" aria-label="В избранное: ${e(p.name)}">♡</button></div>
 <div class="dish-card__content"><h3 class="dish-card__title">${e(p.name)}</h3><p class="dish-card__description">${e(p.short_description)}</p><p class="dish-card__allergens">Аллергены: ${e(p.allergens)}</p><div class="dish-card__bottom"><span class="dish-card__weight">${e(p.weight)}</span><strong class="dish-card__price">${p.price.toLocaleString('ru-RU')} ₽</strong></div><div class="dish-actions"><button class="button button_theme_tertiary" data-details="${p.id}" type="button">Подробнее</button><button class="button button_theme_primary" data-cart-add="${p.id}" type="button">В корзину</button><button class="button button_theme_tertiary" data-add-dinner="${p.id}" type="button">В ужин</button></div></div></article>`;
}
