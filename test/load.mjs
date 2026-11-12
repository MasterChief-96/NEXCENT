// Exactly 100 read-only requests for each concurrency level. Run explicitly on your own site.
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://localhost:3000';const url=new URL('/',base);
if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&process.env.ALLOW_REMOTE_LOAD!=='YES')throw new Error('For your own public site set ALLOW_REMOTE_LOAD=YES explicitly.');
const results=[];
for(const concurrency of [10,50]){
 const warm=await fetch(url,{signal:AbortSignal.timeout(45000)});await warm.arrayBuffer();if(!warm.ok)throw new Error('Warm-up failed: '+warm.status);
 let cursor=0,errors=0;const times=[],statuses={};const start=performance.now();
 await Promise.all(Array.from({length:concurrency},async()=>{while(cursor<100){cursor++;const t=performance.now();try{const r=await fetch(url,{signal:AbortSignal.timeout(30000)});await r.arrayBuffer();statuses[r.status]=(statuses[r.status]||0)+1;if(r.status!==200)errors++;}catch{errors++;statuses.network=(statuses.network||0)+1;}times.push(performance.now()-t);}}));
 const elapsed=(performance.now()-start)/1000;times.sort((a,b)=>a-b);
 const result={requests:100,concurrency,success:100-errors,errors,statuses,rps:+(100/elapsed).toFixed(2),mean_ms:+(times.reduce((a,b)=>a+b)/100).toFixed(2),p95_ms:+times[94].toFixed(2),max_ms:+times[99].toFixed(2)};results.push(result);console.log(result);
}
await mkdir('test-results',{recursive:true});await writeFile('test-results/load.json',JSON.stringify({date:new Date().toISOString(),url:url.href,results},null,2));if(results.some(r=>r.errors))process.exitCode=1;
