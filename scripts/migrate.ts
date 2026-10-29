import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from 'dotenv';
import { db } from '../src/lib/db';

config({ path: '.env.local' });

async function main() {
  const pool = db();
  const connection = await pool.getConnection();
  try {
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(80) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);

    const directory = join(process.cwd(), 'database', 'migrations');
    const files = (await readdir(directory))
      .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
      .sort((a, b) => a.localeCompare(b));

    for (const file of files) {
      const version = file.replace(/\.sql$/i, '');
      const [applied] = await connection.query<any[]>(
        'SELECT version FROM schema_migrations WHERE version=? LIMIT 1',
        [version],
      );
      if (applied.length) {
        console.log(`Already applied ${version}`);
        continue;
      }

      const sql = await readFile(join(directory, file), 'utf8');
      for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) {
        await connection.query(statement);
      }
      await connection.query('INSERT INTO schema_migrations(version) VALUES(?)', [version]);
      console.log(`Applied ${version}`);
    }
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
