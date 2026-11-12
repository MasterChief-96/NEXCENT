import { z } from 'zod';
z.config(z.locales.ru());
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const fail = (status, message) => { throw new HttpError(status, message); };
export const id = z.coerce.number().int().positive().max(4294967295);
export const text = (min, max) => z.string().trim().min(min).max(max);
export const password = z.string().min(8).max(72).refine(v => Buffer.byteLength(v) <= 72, 'Пароль: не более 72 байт UTF-8.');
export const phone = z.string().trim().regex(/^[+\d\s()-]+$/).transform(v => {
 let n = v.replace(/\D/g, ''); if(n.length===11 && n[0]==='8') n='7'+n.slice(1); return '+'+n;
}).pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Введите телефон с кодом страны.'));
export const profile = z.object({ name: text(2,80), email: z.email().max(254).transform(v=>v.toLowerCase()), phone });
export const consent = { privacy: z.literal(true), policy: z.literal(true) };
export const registration = profile.extend({ password, password_confirm: z.string(), ...consent, terms: z.literal(true) }).refine(v=>v.password===v.password_confirm,{message:'Пароли не совпадают.'});
export const cartSchema = z.object({items:z.array(z.object({product_id:id,quantity:z.number().int().min(1).max(50)})).max(50)}).refine(v=>new Set(v.items.map(i=>i.product_id)).size===v.items.length,{message:'Повтор блюда в корзине.'});
export const imagePath = z.string().regex(/^assets\/[a-zA-Z0-9_-]+\.(webp|png|jpg|jpeg)$/);
export const productSchema = z.object({
 name:text(2,160),alias:z.string().regex(/^[a-z0-9-]{2,160}$/),category_id:id,manufacturer_id:id.optional(),
 short_description:text(5,500),description:text(5,5000),price:z.number().min(1).max(1000000).refine(v=>Math.abs(Math.round(v*100)-v*100)<1e-6),
 image:imagePath,available:z.boolean(),vegetarian:z.boolean(),weight:text(1,80),allergens:text(1,255),
 meta_keywords:text(0,255).default(''),meta_description:text(0,500).default(''),meta_title:text(0,160).default(''),
 images:z.array(z.object({image:imagePath,title:text(1,160)})).max(8).optional()
});
export const feedbackSchema=z.object({subject:text(3,160),message:text(10,2000),kind:z.enum(['message','review']),rating:z.number().int().min(1).max(5).optional(),...consent}).refine(v=>v.kind!=='review'||v.rating!==undefined,{message:'Выберите оценку от 1 до 5.'});
export const key = z.string().regex(/^[a-zA-Z0-9-]{16,80}$/);
export const bookingSchema=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),time:z.string().regex(/^(1[2-9]|20|21):(00|30)$/),guests:z.number().int().min(1).max(12),table_preference:z.enum(['any','window','quiet','company']),message:text(10,2000),dinner:z.array(id).max(3).default([]),idempotency_key:key,...consent});
