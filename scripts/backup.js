// Binary streams keep SQL intact on Windows PowerShell as well as Linux.
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir,rename,rm,access } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

const local=process.argv.includes('--local');
const flags=process.argv.slice(2);
if(flags.some(v=>!['--local','--docker'].includes(v))||(flags.includes('--local')&&flags.includes('--docker')))throw new Error('Используйте --docker (по умолчанию) или --local.');
const directory=path.resolve('backups');
const output=path.join(directory,'nexcent-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sql.gz');
const temporary=output+'.tmp';
let child;
try{
 if(!local)await access(path.resolve('compose.yaml'));
 if(local&&!process.env.DB_NAME)throw new Error('Для --local нужны переменные DB_NAME, DB_USER, DB_PASSWORD, DB_HOST и DB_PORT из .env.');
 await mkdir(directory,{recursive:true,mode:0o700});
 const command=local?'mysqldump':'docker';
 const args=local?[
  '--host='+ (process.env.DB_HOST||'127.0.0.1'),'--port='+ (process.env.DB_PORT||'3306'),
  '--user='+ (process.env.DB_USER||'nexcent'),'--single-transaction','--quick','--routines','--triggers','--hex-blob','--no-tablespaces',process.env.DB_NAME
 ]:['compose','exec','-T','db','sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --quick --routines --triggers --hex-blob --no-tablespaces --set-gtid-purged=OFF "$MYSQL_DATABASE"'];
 child=spawn(command,args,{stdio:['ignore','pipe','pipe'],env:local?{...process.env,MYSQL_PWD:process.env.DB_PASSWORD||''}:process.env});
 let details='';child.stderr.on('data',chunk=>{if(details.length<4000)details+=chunk.toString();});
 const ended=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error('Команда резервного копирования завершилась с кодом '+code+'. '+details.trim())));});
 const streams=pipeline(child.stdout,createGzip(),createWriteStream(temporary,{flags:'wx',mode:0o600}));
 streams.catch(()=>child.kill());
 const results=await Promise.allSettled([ended,streams]);
 const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;
 await rename(temporary,output);
 console.log('Резервная копия создана: '+output);
}catch(error){
 child?.kill();await rm(temporary,{force:true});
 // Never report credentials that could appear in a client error.
 let message=error.message;
 for(const secret of [process.env.DB_PASSWORD,process.env.MYSQL_ROOT_PASSWORD])if(secret)message=message.replaceAll(secret,'[скрыто]');
 console.error('Копия не создана. '+message);process.exitCode=1;
}
