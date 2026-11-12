import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { readFile, access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query,transaction,log } from './db.js';
import { session,csrf,auth,admin,publicUser,signedIn,stateChange,cookieOptions,production,origin,createSession } from './auth.js';
import { fail,HttpError,id,profile,registration,password,text,cartSchema,productSchema,feedbackSchema,bookingSchema,key,consent } from './validation.js';
import { products,productCard,escapeHTML } from './catalog.js';
import { legalDocument,consentVersion } from './legal.js';
import { orderTotal,bookingInstant,canTransition } from './domain.js';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const app=express();
if(production && !origin.startsWith('https://'))throw new Error('Для production нужен APP_ORIGIN=https://ваш-домен');
if(production && (!process.env.DB_PASSWORD || process.env.DB_PASSWORD.length<16 || process.env.DB_PASSWORD.startsWith('CHANGE_ME')))throw new Error('Задайте случайный DB_PASSWORD длиной от 16 символов.');
app.disable('x-powered-by');if(process.env.TRUST_PROXY==='1')app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'","data:"],fontSrc:["'self'"],connectSrc:["'self'"],frameSrc:['https://yandex.ru'],formAction:["'self'"],upgradeInsecureRequests:production?[]:null}},strictTransportSecurity:production?undefined:false}));
app.use(express.json({limit:'32kb'}));
app.get('/api/health',async(req,res)=>{await query('SELECT 1');res.json({ok:true});});
app.use('/api',rateLimit({windowMs:60000,limit:240,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Слишком много запросов. Попробуйте через минуту.'}}));
app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');next();},session,csrf);
const loginLimit=rateLimit({windowMs:15*60000,limit:20,skipSuccessfulRequests:true,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Слишком много попыток входа. Подождите 15 минут.'}});
const writeLimit=rateLimit({windowMs:60000,limit:12,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Пожалуйста, подождите минуту перед новой отправкой.'}});
app.get('/api/session',(req,res)=>res.json({user:publicUser(req.user),csrfToken:req.session.csrf_token}));
app.post('/api/register',loginLimit,async(req,res)=>{
 const v=registration.parse(req.body);const h=await bcrypt.hash(v.password,12);
 const row=await query('INSERT INTO users(name,email,phone,password_hash,consent_version) VALUES(?,?,?,?,?)',[v.name,v.email,v.phone,h,consentVersion]);
 const [u]=await query('SELECT * FROM users WHERE id=?',[row.insertId]);await log(u.id,'register');res.status(201).json(await signedIn(req,res,u,false));
});
const dummyHash=await bcrypt.hash('not-a-real-password-'+Math.random(),12);
app.post('/api/login',loginLimit,async(req,res)=>{
 const v=z.object({identifier:text(3,254),password:z.string().min(1).max(200),remember:z.boolean().default(false)}).parse(req.body);
 let identifier=v.identifier.toLowerCase();if(!identifier.includes('@')) {let digits=identifier.replace(/\D/g,'');if(digits.length===11&&digits[0]==='8')digits='7'+digits.slice(1);identifier='+'+digits;}
 const [u]=await query('SELECT * FROM users WHERE email=? OR phone=? LIMIT 1',[identifier,identifier]);
 const correct=await bcrypt.compare(v.password,u?.password_hash||dummyHash);
 if(!u||!correct||u.blocked)fail(401,'Неверные данные для входа или аккаунт недоступен.');
 res.json(await signedIn(req,res,u,v.remember));
});
app.post('/api/logout',async(req,res)=>{await log(req.user?.id,'logout');await query('DELETE FROM user_sessions WHERE id=?',[req.session.id]);res.clearCookie('nx_session',cookieOptions);res.json({ok:true});});
app.get('/api/profile',auth,(req,res)=>res.json({user:publicUser(req.user),state:req.session.state}));
app.put('/api/profile',auth,async(req,res)=>{
 const v=profile.parse(req.body);await query('UPDATE users SET name=?,email=?,phone=? WHERE id=?',[v.name,v.email,v.phone,req.user.id]);await log(req.user.id,'profile_updated');res.json({user:publicUser({...req.user,...v})});
});
app.put('/api/profile/password',auth,loginLimit,async(req,res)=>{
 const v=z.object({current_password:z.string(),password,password_confirm:z.string()}).refine(v=>v.password===v.password_confirm,{message:'Пароли не совпадают.'}).parse(req.body);
 if(!await bcrypt.compare(v.current_password,req.user.password_hash))fail(400,'Текущий пароль неверен.');
 const h=await bcrypt.hash(v.password,12);
 await transaction(async db=>{await query('UPDATE users SET password_hash=? WHERE id=?',[h,req.user.id],db);await query('DELETE FROM user_sessions WHERE user_id=?',[req.user.id],db);await log(req.user.id,'password_changed','',db);});
 await createSession(req,res,req.user.id);res.json({ok:true,csrfToken:req.session.csrf_token});
});
app.get('/api/actions',auth,async(req,res)=>res.json({items:await query('SELECT action,page,created_at FROM user_actions WHERE user_id=? ORDER BY id DESC LIMIT 100',[req.user.id])}));
app.get('/api/sessions',auth,async(req,res)=>res.json({items:(await query('SELECT id,ip_address,user_agent,created_at,expires_at FROM user_sessions WHERE user_id=? AND expires_at>UTC_TIMESTAMP() ORDER BY id DESC',[req.user.id])).map(s=>({...s,current:s.id===req.session.id}))}));
app.delete('/api/sessions',auth,async(req,res)=>{await query('DELETE FROM user_sessions WHERE user_id=? AND id<>?',[req.user.id,req.session.id]);await log(req.user.id,'sessions_revoked');res.json({ok:true});});
app.get('/api/products',async(req,res)=>res.json({items:await products()}));
app.get('/api/categories',async(req,res)=>res.json({items:await query('SELECT * FROM categories ORDER BY id')}));
app.get('/api/search',async(req,res)=>{
 const q=text(1,100).parse(req.query.q);const escaped=q.replace(/[=%_]/g,'=$&');
 const ids=await query("SELECT id FROM products WHERE available=1 AND deleted_at IS NULL AND (name LIKE ? ESCAPE '=' OR description LIKE ? ESCAPE '=')",['%'+escaped+'%','%'+escaped+'%']);
 const set=new Set(ids.map(r=>String(r.id)));await stateChange(req,s=>{s.searches=[q,...(s.searches||[]).filter(x=>x!==q)].slice(0,10);});
 await log(req.user?.id,'search','/menu.html');res.json({items:(await products()).filter(p=>set.has(p.id))});
});
app.get('/api/products/:id',async(req,res)=>{
 const pid=id.parse(req.params.id);const p=(await products()).find(p=>p.id===String(pid));if(!p)fail(404,'Блюдо не найдено.');
 await stateChange(req,s=>{s.recent=[pid,...(s.recent||[]).filter(x=>x!==pid)].slice(0,10);});
 res.json({product:p,images:await query('SELECT image,title FROM product_images WHERE product_id=?',[pid])});
});
app.get('/api/favorites',auth,async(req,res)=>res.json({items:(await query('SELECT product_id FROM favorites WHERE user_id=?',[req.user.id])).map(r=>String(r.product_id))}));
app.put('/api/favorites/:id',auth,async(req,res)=>{const pid=id.parse(req.params.id),{selected}=z.object({selected:z.boolean()}).parse(req.body);const [p]=await query('SELECT id FROM products WHERE id=? AND deleted_at IS NULL',[pid]);if(!p)fail(404,'Блюдо не найдено.');if(selected)await query('INSERT IGNORE INTO favorites(user_id,product_id) VALUES(?,?)',[req.user.id,pid]);else await query('DELETE FROM favorites WHERE user_id=? AND product_id=?',[req.user.id,pid]);res.json({ok:true});});
async function cart(userId,db){return query('SELECT c.product_id,c.quantity,p.name,p.price,p.image,p.available,p.deleted_at FROM cart_items c JOIN products p ON p.id=c.product_id WHERE c.user_id=? ORDER BY p.id',[userId],db);}
const cartState=items=>items.map(i=>({product_id:Number(i.product_id),quantity:i.quantity}));
async function guestCart(req){
 const menu=await products();
 return (req.session.state.cart||[]).flatMap(i=>{const p=menu.find(p=>p.id===String(i.product_id));return p?[{product_id:Number(p.id),quantity:i.quantity,name:p.name,price:p.price,image:p.image,available:p.available,deleted_at:p.deleted_at}]:[];});
}
app.get('/api/cart',async(req,res)=>{
 const items=req.user?await cart(req.user.id):await guestCart(req);
 await stateChange(req,s=>{s.cart=cartState(items);});res.json({items});
});
async function saveCart(req,res,merge){
 const v=cartSchema.parse(req.body);
 if(!req.user){
  const menu=await products();
  if(v.items.some(i=>!menu.some(p=>p.id===String(i.product_id))))fail(409,'Одно из блюд больше недоступно. Обновите меню.');
  await stateChange(req,s=>{s.cart=v.items;});return res.json({items:await guestCart(req)});
 }
 await transaction(async db=>{
  await query('SELECT id FROM users WHERE id=? FOR UPDATE',[req.user.id],db);
  for(const i of v.items){const [p]=await query('SELECT id FROM products WHERE id=? AND available=1 AND deleted_at IS NULL',[i.product_id],db);if(!p)fail(409,'Одно из блюд больше недоступно. Обновите меню.');}
  if(!merge)await query('DELETE FROM cart_items WHERE user_id=?',[req.user.id],db);
  for(const i of v.items)await query('INSERT INTO cart_items(user_id,product_id,quantity) VALUES(?,?,?) ON DUPLICATE KEY UPDATE quantity=LEAST(50,quantity+VALUES(quantity))',[req.user.id,i.product_id,i.quantity],db);
  await log(req.user.id,merge?'cart_merged':'cart_updated','/cart.html',db);
 });
 const items=await cart(req.user.id);await stateChange(req,s=>{s.cart=cartState(items);});res.json({items});
}
app.put('/api/cart',(req,res)=>saveCart(req,res,false));app.post('/api/cart/merge',auth,(req,res)=>saveCart(req,res,true));
app.post('/api/orders',auth,writeLimit,async(req,res)=>{
 const v=z.object({note:text(0,1000).default(''),idempotency_key:key,...consent}).parse(req.body);
 const order=await transaction(async db=>{
  await query('SELECT id FROM users WHERE id=? FOR UPDATE',[req.user.id],db);
  const [prior]=await query('SELECT * FROM orders WHERE user_id=? AND idempotency_key=?',[req.user.id,v.idempotency_key],db);if(prior)return prior;
  const items=await query('SELECT c.product_id,c.quantity,p.name,p.price,p.available,p.deleted_at FROM cart_items c JOIN products p ON p.id=c.product_id WHERE c.user_id=? FOR UPDATE',[req.user.id],db);
  if(!items.length)fail(400,'Корзина пуста.');if(items.some(i=>!i.available||i.deleted_at))fail(409,'В корзине есть недоступное блюдо. Удалите его.');
  const total=orderTotal(items);
  const row=await query('INSERT INTO orders(user_id,total,customer_name,phone,note,idempotency_key) VALUES(?,?,?,?,?,?)',[req.user.id,total,req.user.name,req.user.phone,v.note,v.idempotency_key],db);
  for(const i of items)await query('INSERT INTO order_items(order_id,product_id,name,unit_price,quantity) VALUES(?,?,?,?,?)',[row.insertId,i.product_id,i.name,i.price,i.quantity],db);
  await query('DELETE FROM cart_items WHERE user_id=?',[req.user.id],db);await log(req.user.id,'order_created','#'+row.insertId,db);
  return {id:row.insertId,total,status:'pending'};
 });await stateChange(req,s=>{s.cart=[];});res.status(201).json({order});
});
async function orderList(uid){const rows=await query(`SELECT * FROM orders ${uid?'WHERE user_id=?':''} ORDER BY id DESC LIMIT 200`,uid?[uid]:[]);for(const o of rows)o.items=await query('SELECT name,unit_price,quantity FROM order_items WHERE order_id=?',[o.id]);return rows;}
app.get('/api/orders',auth,async(req,res)=>res.json({items:await orderList(req.user.id)}));
app.post('/api/orders/:id/cancel',auth,async(req,res)=>{const row=await query("UPDATE orders SET status='cancelled' WHERE id=? AND user_id=? AND status='pending'",[id.parse(req.params.id),req.user.id]);if(!row.affectedRows)fail(409,'Заказ недоступен для отмены.');await log(req.user.id,'order_cancelled',req.params.id);res.json({ok:true});});
app.post('/api/feedback',auth,writeLimit,async(req,res)=>{const v=feedbackSchema.parse(req.body);const row=await query('INSERT INTO feedback(user_id,subject,message,rating,kind) VALUES(?,?,?,?,?)',[req.user.id,v.subject,v.message,v.kind==='review'?v.rating:null,v.kind]);await log(req.user.id,'feedback_created');res.status(201).json({id:row.insertId,message:v.kind==='review'?'Отзыв отправлен на модерацию.':'Сообщение отправлено.'});});
app.get('/api/feedback',auth,async(req,res)=>res.json({items:await query('SELECT * FROM feedback WHERE user_id=? ORDER BY id DESC LIMIT 100',[req.user.id])}));
app.get('/api/reviews',async(req,res)=>{
 const page=z.coerce.number().int().min(1).max(10000).default(1).parse(req.query.page);const offset=(page-1)*12;
 const items=await query(`SELECT f.id,COALESCE(u.name,f.author_name,'Гость') author,f.message,f.rating,f.response,f.is_demo,f.created_at FROM feedback f LEFT JOIN users u ON u.id=f.user_id WHERE f.kind='review' AND f.moderation='published' ORDER BY f.is_demo ASC,f.id DESC LIMIT 12 OFFSET ${offset}`);
 const [stats]=await query("SELECT COUNT(*) count,ROUND(AVG(rating),1) average FROM feedback WHERE kind='review' AND moderation='published' AND is_demo=0");
 const [total]=await query("SELECT COUNT(*) count FROM feedback WHERE kind='review' AND moderation='published'");res.json({items,stats,page,pages:Math.ceil(total.count/12)});
});
app.post('/api/bookings',auth,writeLimit,async(req,res)=>{
 const v=bookingSchema.parse(req.body);
 const at=bookingInstant(v.date,v.time);
 const booking=await transaction(async db=>{
  const [setting]=await query('SELECT capacity FROM restaurant_settings WHERE id=1 FOR UPDATE',[],db);
  const [prior]=await query('SELECT * FROM bookings WHERE user_id=? AND idempotency_key=?',[req.user.id,v.idempotency_key],db);if(prior)return prior;
  const [{used}]=await query("SELECT COALESCE(SUM(guests),0) used FROM bookings WHERE status IN ('pending','confirmed') AND visit_at>DATE_SUB(?,INTERVAL 2 HOUR) AND visit_at<DATE_ADD(?,INTERVAL 2 HOUR)",[at,at],db);
  if(Number(used)+v.guests>setting.capacity)fail(409,'На это время недостаточно мест. Выберите другое время.');
  const menu=await products(db);const dinner=v.dinner.map(pid=>{const p=menu.find(p=>p.id===String(pid));if(!p)fail(409,'Блюдо в плане ужина недоступно.');return {id:pid,name:p.name,price:p.price};});
  const row=await query('INSERT INTO bookings(user_id,visit_at,guests,table_preference,message,dinner,customer_name,phone,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?)',[req.user.id,at,v.guests,v.table_preference,v.message,JSON.stringify(dinner),req.user.name,req.user.phone,v.idempotency_key],db);
  await log(req.user.id,'booking_created','#'+row.insertId,db);return {id:row.insertId,status:'pending',visit_at:at};
 });res.status(201).json({booking});
});
app.get('/api/bookings',auth,async(req,res)=>res.json({items:await query('SELECT * FROM bookings WHERE user_id=? ORDER BY id DESC LIMIT 100',[req.user.id])}));
app.post('/api/bookings/:id/cancel',auth,async(req,res)=>{const r=await query("UPDATE bookings SET status='cancelled' WHERE id=? AND user_id=? AND status IN ('pending','confirmed') AND visit_at>UTC_TIMESTAMP()",[id.parse(req.params.id),req.user.id]);if(!r.affectedRows)fail(409,'Бронь недоступна для отмены.');await log(req.user.id,'booking_cancelled',req.params.id);res.json({ok:true});});
app.use('/api/admin',admin);
app.get('/api/admin/overview',async(req,res)=>{
 const result={};for(const [key,sql] of Object.entries({users:'SELECT COUNT(*) value FROM users',orders:"SELECT COUNT(*) value FROM orders WHERE status='pending'",bookings:"SELECT COUNT(*) value FROM bookings WHERE status='pending'",reviews:"SELECT COUNT(*) value FROM feedback WHERE kind='review' AND moderation='pending'",revenue:"SELECT COALESCE(SUM(total),0) value FROM orders WHERE status='completed'"}))result[key]=(await query(sql))[0].value;
 res.json(result);
});
app.get('/api/admin/products',async(req,res)=>res.json({items:await products(undefined,true),images:(await readdir(path.join(root,'public/assets'))).filter(v=>/\.(webp|png|jpg|jpeg)$/.test(v)).map(v=>'assets/'+v)}));
async function writeProduct(req,res,existing){
 const v=productSchema.parse(req.body),pid=existing?id.parse(req.params.id):null;
 for(const file of [v.image,...(v.images||[]).map(i=>i.image)]){try{await access(path.join(root,'public',file));}catch{fail(400,'Файл изображения отсутствует в public/assets.');}}
 const result=await transaction(async db=>{
  let current=pid,previous;
  if(existing){[previous]=await query('SELECT id,manufacturer_id FROM products WHERE id=? AND deleted_at IS NULL FOR UPDATE',[pid],db);if(!previous)fail(404,'Блюдо не найдено.');}
  const params=[v.manufacturer_id??previous?.manufacturer_id??1,v.category_id,v.name,v.alias,v.short_description,v.description,v.price,v.image,v.available,v.vegetarian,v.meta_keywords,v.meta_description,v.meta_title];
  if(existing){await query('UPDATE products SET manufacturer_id=?,category_id=?,name=?,alias=?,short_description=?,description=?,price=?,image=?,available=?,vegetarian=?,meta_keywords=?,meta_description=?,meta_title=? WHERE id=?',[...params,pid],db);}
  else current=(await query('INSERT INTO products(manufacturer_id,category_id,name,alias,short_description,description,price,image,available,vegetarian,meta_keywords,meta_description,meta_title) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',params,db)).insertId;
  // Edit the two visible fields without deleting custom properties or their prices.
  for(const prop of ['weight','allergens'])await query('INSERT INTO product_properties(product_id,property_name,property_value) VALUES(?,?,?) ON DUPLICATE KEY UPDATE property_value=VALUES(property_value)',[current,prop,v[prop]],db);
  // Omitting images preserves the existing gallery; an explicit array replaces it.
  if(v.images!==undefined){
   await query('DELETE FROM product_images WHERE product_id=?',[current],db);
   for(const i of v.images)await query('INSERT INTO product_images(product_id,image,title) VALUES(?,?,?)',[current,i.image,i.title],db);
  }
  const [mainImage]=await query('SELECT id FROM product_images WHERE product_id=? AND image=? LIMIT 1',[current,v.image],db);
  if(!mainImage)await query('INSERT INTO product_images(product_id,image,title) VALUES(?,?,?)',[current,v.image,v.name],db);
  await log(req.user.id,existing?'product_updated':'product_created',String(current),db);return current;
 });res.status(existing?200:201).json({id:result});
}
app.post('/api/admin/products',(req,res)=>writeProduct(req,res,false));app.put('/api/admin/products/:id',(req,res)=>writeProduct(req,res,true));
app.delete('/api/admin/products/:id',async(req,res)=>{const pid=id.parse(req.params.id);const r=await query('UPDATE products SET deleted_at=UTC_TIMESTAMP(),available=0 WHERE id=? AND deleted_at IS NULL',[pid]);if(!r.affectedRows)fail(404,'Блюдо не найдено.');await log(req.user.id,'product_archived',String(pid));res.json({ok:true});});
app.get('/api/admin/users',async(req,res)=>res.json({items:await query('SELECT id,name,email,phone,role,blocked,created_at,last_login FROM users ORDER BY id DESC LIMIT 500')}));
app.put('/api/admin/users/:id',async(req,res)=>{
 const uid=id.parse(req.params.id),v=z.object({role:z.enum(['user','admin']),blocked:z.boolean()}).parse(req.body);
 if(uid===req.user.id)fail(400,'Свою роль и блокировку здесь менять нельзя.');
 await transaction(async db=>{const admins=await query("SELECT id FROM users WHERE role='admin' AND blocked=0 ORDER BY id FOR UPDATE",[],db);if(admins.length===1&&admins[0].id===uid&&(v.role!=='admin'||v.blocked))fail(409,'Нельзя отключить последнего администратора.');const r=await query('UPDATE users SET role=?,blocked=? WHERE id=?',[v.role,v.blocked,uid],db);if(!r.affectedRows)fail(404,'Пользователь не найден.');await query('DELETE FROM user_sessions WHERE user_id=?',[uid],db);await log(req.user.id,'user_updated',String(uid),db);});res.json({ok:true});
});
app.get('/api/admin/feedback',async(req,res)=>res.json({items:await query('SELECT f.*,COALESCE(u.name,f.author_name) author FROM feedback f LEFT JOIN users u ON u.id=f.user_id ORDER BY f.id DESC LIMIT 500')}));
app.put('/api/admin/feedback/:id',async(req,res)=>{const v=z.object({status:z.enum(['new','in_progress','resolved']),moderation:z.enum(['pending','published','rejected']),response:text(0,2000)}).parse(req.body);const r=await query('UPDATE feedback SET status=?,moderation=?,response=? WHERE id=?',[v.status,v.moderation,v.response,id.parse(req.params.id)]);if(!r.affectedRows)fail(404,'Обращение не найдено.');await log(req.user.id,'feedback_moderated',req.params.id);res.json({ok:true});});
app.get('/api/admin/orders',async(req,res)=>res.json({items:await orderList()}));
app.get('/api/admin/bookings',async(req,res)=>res.json({items:await query('SELECT * FROM bookings ORDER BY visit_at DESC LIMIT 500')}));
for(const table of ['orders','bookings'])app.put(`/api/admin/${table}/:id`,async(req,res)=>{
 const v=z.object({status:z.enum(table==='orders'?['pending','confirmed','ready','completed','cancelled']:['pending','confirmed','completed','cancelled'])}).parse(req.body);
 await transaction(async db=>{const [row]=await query(`SELECT status FROM ${table} WHERE id=? FOR UPDATE`,[id.parse(req.params.id)],db);if(!row)fail(404,'Запись не найдена.');if(!canTransition(table,row.status,v.status))fail(409,'Недопустимый переход статуса.');await query(`UPDATE ${table} SET status=? WHERE id=?`,[v.status,Number(req.params.id)],db);await log(req.user.id,table+'_status_changed',req.params.id,db);});res.json({ok:true});
});
app.use('/api',(req,res)=>res.status(404).json({error:'Метод API не найден.'}));
app.get('/assets/catalog.js',async(req,res)=>res.type('js').set('Cache-Control','no-store').send('window.NexcentMenu='+JSON.stringify(await products()).replaceAll('<','\\u003c')+';'));
app.get(['/','/index.html','/menu.html'],async(req,res)=>{
 const file=req.path==='/menu.html'?'menu.html':'index.html';let html=await readFile(path.join(root,'public',file),'utf8');
 const menu=await products();
 if(file==='menu.html'){
  const cats=await query('SELECT * FROM categories ORDER BY id');
  html=html.replace('<!-- PRODUCT_LIST -->',cats.map(c=>`<section class="menu-section container" id="${escapeHTML(c.alias)}"><h2 class="section__title">${escapeHTML(c.name)}</h2><div class="dish-grid">${menu.filter(p=>p.category_id===c.id).map(productCard).join('')}</div></section>`).join(''));
 }
 if(file==='index.html') html=html.replace(/<article class="spotlight"[\s\S]*?<\/article>/g,card=>{
  const pid=card.match(/#dish-(\d+)/)?.[1],p=menu.find(p=>p.id===pid);if(!p)return '';
  return card.replace(/(<p class="spotlight__price">)[\s\S]*?(<\/p>)/,(_,a,b)=>a+p.price.toLocaleString('ru-RU')+' ₽'+b).replace(/(<a class="spotlight__link"[^>]*>)[\s\S]*?(<\/a>)/,(_,a,b)=>a+escapeHTML(p.name)+b).replace(/(<img class="spotlight__image" src=")[^"]+/,(_,a)=>a+escapeHTML(p.image)).replace(/(<p class="spotlight__description">)[\s\S]*?(<\/p>)/,(_,a,b)=>a+escapeHTML(p.short_description)+b);
 });
 res.type('html').set('Cache-Control','no-store').send(html);
});
app.get(['/privacy.html','/privacy.txt'],async(req,res)=>{
 const format=req.path.endsWith('.txt')?'txt':'html';
 res.type(format==='txt'?'text/plain':'html').set('Cache-Control','no-store');
 if(format==='txt')res.attachment('privacy.txt');
 res.send(await legalDocument(format));
});
// Forms and their API contract change together; revalidate static pages/scripts after updates.
app.use(express.static(path.join(root,'public'),{index:false,maxAge:0}));
app.use((req,res)=>res.status(404).type('html').send('<html lang="ru"><meta charset="utf-8"><title>Не найдено</title><h1>Страница не найдена</h1><a href="/">На главную</a></html>'));
app.use((err,req,res,next)=>{
 if(res.headersSent)return next(err);
 if(err instanceof z.ZodError)return res.status(400).json({error:'Проверьте заполнение полей.',fields:err.issues.map(i=>({field:i.path.join('.'),message:i.message}))});
 if(err.code==='ER_DUP_ENTRY')return res.status(409).json({error:'Такие email, телефон или адрес блюда уже используются.'});
 if(err.code==='ER_NO_REFERENCED_ROW_2')return res.status(400).json({error:'Связанная запись не найдена.'});
 if(err instanceof HttpError)return res.status(err.status).json({error:err.message});
 if(err.type==='entity.parse.failed')return res.status(400).json({error:'Некорректный JSON.'});
 if(err.type==='entity.too.large')return res.status(413).json({error:'Слишком большой запрос.'});
 console.error('Request failed:',err.code||err.name,req.method,req.path);
 res.status(500).json({error:'Не удалось выполнить запрос. Повторите позже.'});
});
