import mysql from 'mysql2/promise';
export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'nexcent', password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'nexcent', connectionLimit: 10,
  charset: 'utf8mb4', timezone: 'Z', decimalNumbers: true, dateStrings: true,
  multipleStatements: false
});
// DATETIME values are written and returned as UTC regardless of the VPS timezone.
pool.on('connection', connection => connection.query("SET time_zone = '+00:00'"));
export async function query(sql, params = [], db = pool) { return (await db.execute(sql, params))[0]; }
export async function transaction(fn) {
  const db = await pool.getConnection();
  try { await db.beginTransaction(); const result = await fn(db); await db.commit(); return result; }
  catch (e) { await db.rollback(); throw e; }
  finally { db.release(); }
}
export async function log(userId, action, page = '', db = pool) {
  if (userId) await query('INSERT INTO user_actions(user_id,action,page) VALUES(?,?,?)', [userId, action, page], db);
}
