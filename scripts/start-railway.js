import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function prepareEnvironment(input) {
  const env = { ...input };
  const required = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const missing = required.filter(key => !env[key]?.trim() || env[key].includes('${{'));
  if (missing.length) throw new Error(`Railway: задайте переменные сервиса сайта: ${missing.join(', ')}. См. docs/RAILWAY_RU.md.`);
  const port = Number(env.DB_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Railway: неверный DB_PORT.');
  env.NODE_ENV = 'production';
  env.TRUST_PROXY = '1';
  env.SEED_DEMO_REVIEWS ??= 'false';
  if (!env.APP_ORIGIN && env.RAILWAY_PUBLIC_DOMAIN) env.APP_ORIGIN = `https://${env.RAILWAY_PUBLIC_DOMAIN}`;
  let url;
  try { url = new URL(env.APP_ORIGIN); } catch { /* Report only the key, never its value. */ }
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.hostname === 'localhost' || url.hostname.endsWith('.invalid')) {
    throw new Error('Railway: создайте публичный домен (Generate Domain) или задайте APP_ORIGIN=https://адрес-сайта без пути.');
  }
  env.APP_ORIGIN = url.origin;
  if (env.DB_PASSWORD.length < 16 || env.DB_PASSWORD.startsWith('CHANGE_ME')) throw new Error('Railway: DB_PASSWORD должен ссылаться на настоящий пароль MySQL (от 16 символов).');
  return env;
}

// Retry only temporary network/startup failures; credentials and schema errors need a fix.
export async function waitForDatabase(connect, { attempts = 30, delay = sleep, log = console.log } = {}) {
  const transient = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'PROTOCOL_CONNECTION_LOST']);
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let connection;
    try {
      connection = await connect();
      await connection.query('SELECT 1');
      return;
    } catch (error) {
      if (!transient.has(error.code) || attempt === attempts) {
        const code = /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'DB_ERROR';
        throw new Error(`Railway: MySQL недоступен (${code}). Проверьте статус базы и ссылки DB_* в Variables.`);
      }
      log(`Ожидание MySQL: попытка ${attempt}/${attempts}.`);
    } finally {
      if (connection) connection.destroy();
    }
    await delay(2000);
  }
}

async function main() {
  Object.assign(process.env, prepareEnvironment(process.env));
  const { default: mysql } = await import('mysql2/promise');
  await waitForDatabase(() => mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, connectTimeout: 3000
  }));
  for (const script of ['init-db.js', 'bootstrap-admin.js']) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], { stdio: 'inherit', env: process.env });
    if (result.error || result.status !== 0) throw new Error(`Railway: шаг ${script} не завершён. Запуск сайта остановлен; см. журнал выше.`);
  }
  // Import after preparing the environment so auth/cookie configuration sees production values.
  await import('../server/index.js');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
