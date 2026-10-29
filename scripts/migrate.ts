import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from 'dotenv';
config({ path: '.env.local' });
import { db } from '../src/lib/db';
async function main(){const pool=db();const conn=await pool.getConnection();try{await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations(version VARCHAR(80) PRIMARY KEY,applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`);const [rows]=await conn.query<any[]>('SELECT version FROM schema_migrations WHERE version=?',['001_initial']);if(rows.length){console.log('Migration 001_initial already applied');return}const sql=await readFile(join(process.cwd(),'database/migrations/001_initial.sql'),'utf8');for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await conn.query(statement);await conn.query('INSERT INTO schema_migrations(version) VALUES(?)',['001_initial']);console.log('Applied 001_initial')}finally{conn.release();await pool.end()}}
main().catch(e=>{console.error(e);process.exitCode=1});
