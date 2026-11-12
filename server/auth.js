import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { query, log, transaction } from './db.js';
import { fail } from './validation.js';
export const hash = v => createHash('sha256').update(v).digest('hex');
const token = () => randomBytes(32).toString('hex');
export const production = process.env.NODE_ENV === 'production';
export const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
export const cookieOptions = { httpOnly:true, secure:production, sameSite:'lax', path:'/' };
export const publicUser = u => u ? { id:u.id,name:u.name,email:u.email,phone:u.phone,role:u.role,created_at:u.created_at,last_login:u.last_login } : null;
export async function createSession(req,res,userId=null,remember=false,state={}) {
 // A new login/password rotation must reflect the existing account cart.
 // Anonymous state is scoped to its own session and never copied into another account.
 state={...state,cart:userId?await query('SELECT product_id,quantity FROM cart_items WHERE user_id=? ORDER BY product_id',[userId]):(state.cart||[])};
 const raw=token(), csrf=token(); const hours=remember?720:24;
 const row=await query('INSERT INTO user_sessions(user_id,session_token,csrf_token,ip_address,user_agent,state,expires_at) VALUES(?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? HOUR))',[userId,hash(raw),csrf,req.ip||'',String(req.get('user-agent')||'').slice(0,255),JSON.stringify(state),hours]);
 res.cookie('nx_session',raw,{...cookieOptions,...(remember?{maxAge:hours*3600000}:{})});
 req.session={id:row.insertId,user_id:userId,csrf_token:csrf,state};return req.session;
}
export async function session(req,res,next) {
 const raw=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('nx_session='))?.slice(11);
 let s;
 if(raw && /^[a-f0-9]{64}$/.test(raw)) [s]=await query('SELECT * FROM user_sessions WHERE session_token=? AND expires_at>UTC_TIMESTAMP()',[hash(raw)]);
 if(!s) s=await createSession(req,res);
 if(typeof s.state==='string')s.state=JSON.parse(s.state);
 req.session=s;req.user=null;
 if(s.user_id) {
  const [u]=await query('SELECT * FROM users WHERE id=?',[s.user_id]);
  if(!u || u.blocked){await query('DELETE FROM user_sessions WHERE id=?',[s.id]);await createSession(req,res);}
  else req.user=u;
 }
 next();
}
export function csrf(req,res,next) {
 if(['GET','HEAD','OPTIONS'].includes(req.method)) return next();
 if(req.get('origin') && req.get('origin')!==origin) return fail(403,'Запрос с другого сайта запрещён.');
 const actual=req.get('x-csrf-token')||'';const expected=req.session.csrf_token;
 if(!/^[a-f0-9]{64}$/.test(actual) || !timingSafeEqual(Buffer.from(actual),Buffer.from(expected))) return fail(403,'Сессия формы устарела. Обновите страницу.');
 if(!req.is('application/json'))return fail(415,'Ожидается JSON.');
 next();
}
export function auth(req,res,next){if(!req.user)fail(401,'Войдите в аккаунт, чтобы продолжить.');next();}
export function admin(req,res,next){auth(req,res,()=>{});if(req.user.role!=='admin')fail(403,'Доступ только для администратора.');next();}
export async function stateChange(req,fn) {
 return transaction(async db=>{
  const [s]=await query('SELECT state FROM user_sessions WHERE id=? FOR UPDATE',[req.session.id],db);if(!s)return;
  const data=typeof s.state==='string'?JSON.parse(s.state):s.state;fn(data);
  await query('UPDATE user_sessions SET state=? WHERE id=?',[JSON.stringify(data),req.session.id],db);req.session.state=data;
 });
}
export async function signedIn(req,res,user,remember){
 const previous=req.session;await createSession(req,res,user.id,remember,previous.state);
 await query('DELETE FROM user_sessions WHERE id=?',[previous.id]);
 await query('UPDATE users SET last_login=UTC_TIMESTAMP() WHERE id=?',[user.id]);
 await log(user.id,'login','/about.html');req.user=user;
 return {user:publicUser(user),csrfToken:req.session.csrf_token};
}
