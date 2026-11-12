import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pool,query,transaction } from '../server/db.js';
import { root } from '../server/paths.js';
import path from 'node:path';
try {
 await query('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(80) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)');
 const sql=await readFile(path.join(root,'sql/001-schema.sql'),'utf8');
 const checksum=createHash('sha256').update(sql).digest('hex');
 const [previous]=await query('SELECT checksum FROM schema_migrations WHERE version=?',['001-schema']);
 if(previous&&previous.checksum!==checksum)throw new Error('Применённая миграция изменена. Создайте новую миграцию, не редактируйте старую.');
 if(!previous){for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await query(statement);await query('INSERT INTO schema_migrations(version,checksum) VALUES(?,?)',['001-schema',checksum]);}
 await transaction(async db=>{
  await query("INSERT IGNORE INTO manufacturers(id,name) VALUES(1,'Кухня Nexcent')",[],db);
  for(const c of [[1,'Закуски','starters'],[2,'Горячие блюда','mains'],[3,'Десерты','desserts']])await query('INSERT IGNORE INTO categories(id,name,alias) VALUES(?,?,?)',c,db);
  await query('INSERT IGNORE INTO restaurant_settings(id,capacity) VALUES(1,40)',[],db);
  const [{n}]=await query('SELECT COUNT(*) n FROM products',[],db);
  if(!n){
   const seed=JSON.parse(await readFile(path.join(root,'sql/products.json'),'utf8'));
   for(const p of seed){
    await query('INSERT INTO products(id,manufacturer_id,category_id,name,alias,short_description,description,price,image,vegetarian) VALUES(?,1,?,?,?,?,?,?,?,?)',[Number(p.id),{starters:1,mains:2,desserts:3}[p.category],p.name,'dish-'+p.id,p.description,p.description,p.price,p.image,!['5','6'].includes(p.id)],db);
    for(const prop of ['weight','allergens'])await query('INSERT INTO product_properties(product_id,property_name,property_value) VALUES(?,?,?)',[Number(p.id),prop,p[prop]],db);
    await query('INSERT INTO product_images(product_id,image,title) VALUES(?,?,?)',[Number(p.id),p.image,p.name],db);
   }
  }
  const [{n:reviews}]=await query('SELECT COUNT(*) n FROM feedback',[],db);
  if(!reviews&&process.env.SEED_DEMO_REVIEWS!=='false')for(const r of [['Анна',5,'Уютный вечер у окна. Особенно понравились ризотто и спокойная атмосфера.'],['Михаил',4,'Хорошее место для встречи с друзьями. Брускетты хрустящие, десерты приятно удивили.'],['Екатерина',5,'Брали буррату и лосося. Красиво подали, помогли определиться с блюдами для компании.']])await query("INSERT INTO feedback(author_name,subject,message,rating,kind,moderation,is_demo) VALUES(?,'Впечатления о визите',?,?,'review','published',1)",[r[0],r[2],r[1]],db);
 });
 console.log('База готова. Каталог добавлен; существующие данные сохранены.');
} finally {await pool.end();}
