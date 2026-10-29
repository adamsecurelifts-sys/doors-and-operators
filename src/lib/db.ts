import mysql, { type Pool } from 'mysql2/promise';

let pool: Pool | undefined;
export function db(): Pool {
  if (!pool) {
    const required = ['MYSQL_HOST', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD'];
    for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key}`);
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
      database: process.env.MYSQL_DATABASE, user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD, waitForConnections: true,
      connectionLimit: 10, queueLimit: 0, decimalNumbers: true,
      ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    });
  }
  return pool;
}
