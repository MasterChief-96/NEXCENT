import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import bcrypt from 'bcryptjs';
import { query,pool } from '../server/db.js';
import { profile,password,fail } from '../server/validation.js';
let muted=false;
const output=new Writable({write(chunk,encoding,callback){if(!muted)process.stdout.write(chunk);callback();}});
const rl=createInterface({input:process.stdin,output,terminal:!!process.stdin.isTTY});
async function ask(label,secret=false){process.stdout.write(label);muted=secret;const value=await rl.question('');muted=false;if(secret)process.stdout.write('\n');return value;}
try {
 const email=process.env.ADMIN_EMAIL||await ask('Email: ');
 const pass=process.env.ADMIN_PASSWORD||await ask('Новый пароль (от 8 символов): ',true);password.parse(pass);
 if(!process.env.ADMIN_PASSWORD&&pass!==await ask('Повторите пароль: ',true))fail(400,'Пароли не совпадают.');
 const hash=await bcrypt.hash(pass,12);
 if(process.argv.includes('--reset')){
  const [u]=await query('SELECT id FROM users WHERE email=?',[email.toLowerCase()]);if(!u)fail(404,'Пользователь не найден.');
  await query('UPDATE users SET password_hash=? WHERE id=?',[hash,u.id]);await query('DELETE FROM user_sessions WHERE user_id=?',[u.id]);console.log('Пароль изменён, все сессии завершены.');
 } else {
  const data=profile.parse({email,name:process.env.ADMIN_NAME||await ask('Имя: '),phone:process.env.ADMIN_PHONE||await ask('Телефон с кодом страны: ')});
  const [existing]=await query('SELECT id FROM users WHERE email=?',[data.email]);
  if(existing)fail(409,'Email уже зарегистрирован. Назначьте роль через админ-панель или используйте другой email.');
  await query("INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,'admin')",[data.name,data.email,data.phone,hash]);console.log('Администратор создан. Вход: /about.html#login, панель: /admin.html');
 }
} catch(e){console.error(e.message);process.exitCode=1;}finally{rl.close();await pool.end();}
