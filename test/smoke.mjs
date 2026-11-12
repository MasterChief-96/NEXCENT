// Read-only checks for the deployed site. Does not register users or mutate the database.
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL;
if(!base)throw new Error('Set BASE_URL, for example https://YOUR-PROJECT.netrun.io');
const url=new URL(base),local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
if(!local&&url.protocol!=='https:')throw new Error('Public site must use HTTPS.');
const checks=[];function check(name,ok,detail=''){checks.push({name,ok,detail});console.log(`${ok?'PASS':'FAIL'} ${name} ${detail}`);}
for(const route of ['/','/menu.html','/about.html','/booking.html','/reviews.html','/cart.html','/account.html','/privacy.html','/privacy.txt','/api/health','/api/products']){
 const start=performance.now();try{const r=await fetch(new URL(route,url),{signal:AbortSignal.timeout(45000)});const body=await r.text();check(route,r.status===200,`${r.status}; ${Math.round(performance.now()-start)} ms`);
 if(route==='/api/health')check('database health',JSON.parse(body).ok===true);
 if(route==='/'){for(const header of ['content-security-policy','x-content-type-options','x-frame-options'])check(header,!!r.headers.get(header));if(!local)check('HSTS',!!r.headers.get('strict-transport-security'));}}
 catch(e){check(route,false,e.message);}
}
if(!local){const http=new URL(url);http.protocol='http:';const r=await fetch(http,{redirect:'manual',signal:AbortSignal.timeout(45000)});const loc=r.headers.get('location');check('HTTP redirects to same HTTPS host',[301,302,307,308].includes(r.status)&&!!loc&&new URL(loc,http).protocol==='https:'&&new URL(loc,http).host===url.host);}
const session=await fetch(new URL('/api/session',url));
const cookie=session.headers.get('set-cookie')||'';
check('HttpOnly cookie',/HttpOnly/i.test(cookie));check('SameSite cookie',/SameSite=Lax/i.test(cookie));if(!local)check('Secure cookie',/; Secure/i.test(cookie));
const r=await fetch(new URL('/adminer/',url),{redirect:'manual'});check('Adminer requires gateway password',r.status===401);
for(const path of ['/.env','/server/app.js','/sql/001-schema.sql']){const r=await fetch(new URL(path,url));check('source hidden '+path,r.status===404||r.status===403);}
await mkdir('test-results',{recursive:true});await writeFile('test-results/smoke.json',JSON.stringify({date:new Date().toISOString(),base,checks},null,2));if(checks.some(c=>!c.ok))process.exitCode=1;
