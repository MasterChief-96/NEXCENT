import bcrypt from 'bcryptjs';
import { query, pool } from '../server/db.js';
import { profile, password } from '../server/validation.js';
// Creates an admin only when the entire users table is empty. Never promotes an existing account.
try {
 const keys=['ADMIN_EMAIL','ADMIN_PASSWORD','ADMIN_PHONE'];
 if(!process.env.ADMIN_PASSWORD) {
  console.log('Admin bootstrap skipped: configure ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_PHONE for an empty database.');
 } else {
  if(keys.some(k=>!process.env[k])) throw new Error('Set all ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_PHONE values.');
  const data=profile.parse({email:process.env.ADMIN_EMAIL,phone:process.env.ADMIN_PHONE,name:process.env.ADMIN_NAME||'Администратор'});
  password.parse(process.env.ADMIN_PASSWORD);
  const [{n}]=await query('SELECT COUNT(*) n FROM users');
  if(n) console.log('Admin bootstrap skipped: users already exist. Existing passwords and roles are unchanged.');
  else {
   const hash=await bcrypt.hash(process.env.ADMIN_PASSWORD,12);
   await query("INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,'admin')",[data.name,data.email,data.phone,hash]);
   console.log('Initial administrator created. Remove ADMIN_PASSWORD from deployment secrets.');
  }
 }
} catch(error) { console.error('Admin bootstrap failed:',error.code||error.message);process.exitCode=1; }
finally {await pool.end();}
