import { app } from './app.js';
import { pool,query } from './db.js';
try{await query('SELECT 1 FROM restaurant_settings LIMIT 1');}
catch(error){console.error('Не удалось подключиться к базе или прочитать её схему. Проверьте DB_HOST, DB_PORT, DB_NAME и доступность MySQL. Код:',error.code||'DB_ERROR');await pool.end();process.exit(1);}
const port=Number(process.env.PORT||3000);
const server=app.listen(port,'0.0.0.0',()=>console.log(`Nexcent: http://localhost:${port}`));
const cleanup=setInterval(()=>query('DELETE FROM user_sessions WHERE expires_at<UTC_TIMESTAMP()').catch(()=>console.error('Session cleanup failed')),3600000);cleanup.unref();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(cleanup);server.close(async()=>{await pool.end();process.exit(0);});setTimeout(()=>process.exit(1),10000).unref();});
