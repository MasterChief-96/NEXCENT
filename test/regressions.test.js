import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import request from 'supertest';
if(!process.env.DB_NAME?.endsWith('_test'))throw new Error('Нужна отдельная база с суффиксом _test.');
const {app}=await import('../server/app.js');
const {pool,query}=await import('../server/db.js');
const password='Regression-password-2026!';
const stamp=String(Date.now());
const identity={name:'Тест сохранения',email:'preserve-'+randomUUID()+'@example.test',phone:'+78'+stamp.slice(-9),password,password_confirm:password,privacy:true,policy:true,terms:true};
let agent=request.agent(app),csrf,userId;
const send=(client,token,url,body,method='post')=>client[method](url).set('X-CSRF-Token',token).set('Origin','http://localhost:3000').send(body);
before(async()=>{
 const initial=await agent.get('/api/session');
 const result=await send(agent,initial.body.csrfToken,'/api/register',identity);
 assert.equal(result.status,201,JSON.stringify(result.body));csrf=result.body.csrfToken;userId=result.body.user.id;
 await query("UPDATE users SET role='admin' WHERE id=?",[userId]);
});
after(()=>pool.end());

test('required policy confirmation is rejected before registration or feedback writes',async()=>{
 const anon=request.agent(app),session=await anon.get('/api/session');
 const signup={...identity,email:'new-'+identity.email,phone:'+77'+stamp.slice(-9)};
 delete signup.policy;
 assert.equal((await send(anon,session.body.csrfToken,'/api/register',signup)).status,400);
 assert.equal((await send(anon,session.body.csrfToken,'/api/register',{...signup,policy:false})).status,400);
 assert.equal((await query('SELECT id FROM users WHERE email=?',[signup.email])).length,0);
 const feedback={subject:'Проверка согласия',message:'Тестовое обращение без подтверждения.',kind:'message',privacy:true};
 assert.equal((await send(agent,csrf,'/api/feedback',feedback)).status,400);
 assert.equal((await query('SELECT id FROM feedback WHERE user_id=?',[userId])).length,0);
 assert.equal((await send(agent,csrf,'/api/feedback',{...feedback,policy:true})).status,201);
});

test('guest cart is saved in its server session and isolated from other guests and accounts',async()=>{
 const one=request.agent(app),two=request.agent(app);const session=await one.get('/api/session');
 const raw=/nx_session=([^;]+)/.exec(session.headers['set-cookie'][0])[1];
 const items=[{product_id:1,quantity:3}];
 assert.equal((await send(one,session.body.csrfToken,'/api/cart',{items},'put')).status,200);
 assert.equal((await one.get('/api/cart')).body.items[0].quantity,3);
 const [row]=await query('SELECT state,user_id FROM user_sessions WHERE session_token=?',[createHash('sha256').update(raw).digest('hex')]);
 assert.equal(row.user_id,null);assert.deepEqual((typeof row.state==='string'?JSON.parse(row.state):row.state).cart,items);
 assert.deepEqual((await two.get('/api/cart')).body.items,[]);
 assert.equal((await one.get('/api/profile')).status,401);
 assert.equal((await send(one,session.body.csrfToken,'/api/cart',{items:[{product_id:1,quantity:0}]},'put')).status,400);
 assert.equal((await query('SELECT * FROM cart_items WHERE user_id=?',[userId])).length,0);
});

test('login restores saved cart in a new session without changing password or account',async()=>{
 const items=[{product_id:2,quantity:2}];
 await send(agent,csrf,'/api/cart',{items},'put');
 const [original]=await query('SELECT id,email,phone,password_hash,created_at,consent_version FROM users WHERE id=?',[userId]);
 await send(agent,csrf,'/api/logout',{});
 const anonymous=await agent.get('/api/session');
 const login=await send(agent,anonymous.body.csrfToken,'/api/login',{identifier:identity.email,password});
 assert.equal(login.status,200);csrf=login.body.csrfToken;
 assert.deepEqual((await agent.get('/api/profile')).body.state.cart,items);
 const [current]=await query('SELECT id,email,phone,password_hash,created_at,consent_version FROM users WHERE id=?',[userId]);
 assert.deepEqual(current,original);
 const other=request.agent(app),s=await other.get('/api/session');
 const logged=await send(other,s.body.csrfToken,'/api/login',{identifier:identity.email,password});
 await send(agent,csrf,'/api/cart',{items:[{product_id:2,quantity:4}]},'put');
 assert.equal((await other.get('/api/cart')).body.items[0].quantity,4);
 assert.equal((await other.get('/api/profile')).body.state.cart[0].quantity,4);
 assert.equal(logged.status,200);
});

test('admin editing preserves custom properties, surcharge, gallery IDs and manufacturer',async()=>{
 const maker=await query('INSERT INTO manufacturers(name) VALUES(?)',['Тестовый производитель']);
 const payload={name:'Тест сохранения блюда',alias:'preserve-'+stamp,category_id:3,manufacturer_id:maker.insertId,short_description:'Описание для проверки',description:'Полное описание для проверки',price:240,image:'assets/fondant.webp',available:true,vegetarian:true,weight:'150 г',allergens:'Молоко',images:[{image:'assets/fondant.webp',title:'Основной ракурс'},{image:'assets/cheesecake.webp',title:'Дополнительный ракурс'}]};
 const result=await send(agent,csrf,'/api/admin/products',payload);assert.equal(result.status,201,JSON.stringify(result.body));const pid=result.body.id;
 await query("INSERT INTO product_properties(product_id,property_name,property_value,property_price) VALUES(?,'extra','Сыр',55)",[pid]);
 await query("UPDATE product_properties SET property_price=12 WHERE product_id=? AND property_name='weight'",[pid]);
 const images=await query('SELECT * FROM product_images WHERE product_id=? ORDER BY id',[pid]);
 const [extra]=await query("SELECT * FROM product_properties WHERE product_id=? AND property_name='extra'",[pid]);
 const [weight]=await query("SELECT * FROM product_properties WHERE product_id=? AND property_name='weight'",[pid]);
 const {images:ignoredImages,manufacturer_id:ignoredManufacturer,...update}=payload;
 assert.equal((await send(agent,csrf,'/api/admin/products/'+pid,{...update,price:280,weight:'170 г'},'put')).status,200);
 assert.deepEqual(await query('SELECT * FROM product_images WHERE product_id=? ORDER BY id',[pid]),images);
 assert.deepEqual((await query("SELECT * FROM product_properties WHERE product_id=? AND property_name='extra'",[pid]))[0],extra);
 const [newWeight]=await query("SELECT * FROM product_properties WHERE product_id=? AND property_name='weight'",[pid]);
 assert.equal(newWeight.id,weight.id);assert.equal(newWeight.property_price,12);assert.equal(newWeight.property_value,'170 г');
 assert.equal((await query('SELECT manufacturer_id FROM products WHERE id=?',[pid]))[0].manufacturer_id,maker.insertId);
 assert.equal((await send(agent,csrf,'/api/admin/products/'+pid,{...update,image:'assets/burrata.webp'},'put')).status,200);
 const newImages=await query('SELECT * FROM product_images WHERE product_id=? ORDER BY id',[pid]);
 assert.deepEqual(newImages.slice(0,images.length),images);assert.equal(newImages.at(-1).image,'assets/burrata.webp');
});

test('database initializer preserves existing accounts, hashes, settings and catalogue rows',async()=>{
 const tables=['users','products','product_properties','product_images','cart_items','feedback','restaurant_settings'];
 const beforeRows={};for(const table of tables)beforeRows[table]=await query('SELECT * FROM '+table+' ORDER BY '+(table==='cart_items'?'user_id,product_id':'id'));
 await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/init-db.js'],{env:process.env,stdio:'pipe'});let error='';child.stderr.on('data',s=>error+=s);child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(error)));});
 for(const table of tables)assert.deepEqual(await query('SELECT * FROM '+table+' ORDER BY '+(table==='cart_items'?'user_id,product_id':'id')),beforeRows[table],table+' changed');
});

test('search length is limited on both the page and API',async()=>{
 assert.match((await agent.get('/menu.html')).text,/id="menu-search" maxlength="100"/);
 assert.equal((await agent.get('/api/search').query({q:'а'.repeat(101)})).status,400);
 assert.equal((await agent.get('/api/search').query({q:'а'.repeat(100)})).status,200);
});

test('configured operator details match downloadable policy and are escaped in HTML',async()=>{
 const keys=['LEGAL_OPERATOR_NAME','LEGAL_OPERATOR_ADDRESS','LEGAL_CONTACT_EMAIL'];const saved=keys.map(k=>process.env[k]);
 try{
  process.env.LEGAL_OPERATOR_NAME='Тест <script>оператора</script>';process.env.LEGAL_OPERATOR_ADDRESS='Тестовый адрес';process.env.LEGAL_CONTACT_EMAIL='privacy@example.test';
  const html=await agent.get('/privacy.html'),txt=await agent.get('/privacy.txt');
  assert.match(html.text,/Тест &lt;script&gt;оператора&lt;\/script&gt;/);assert.ok(!html.text.includes('Тест <script>'));
  assert.ok(txt.text.includes(process.env.LEGAL_OPERATOR_NAME));assert.ok(txt.text.includes(process.env.LEGAL_CONTACT_EMAIL));assert.match(txt.headers['content-disposition'],/attachment/);
 }finally{keys.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i];});}
});
