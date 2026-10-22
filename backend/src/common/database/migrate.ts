import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { loadLocalEnv } from '../config/load-env';

loadLocalEnv();

function resolveMigrationsDir(): string {
  const candidates = [
    // Source execution (ts-node): backend/src/common/database -> backend/src/migrations
    path.join(__dirname, '../../migrations'),
    // Compiled execution (dist/migrations copied by nest-cli assets)
    path.join(process.cwd(), 'dist/migrations'),
    path.join(process.cwd(), 'backend/dist/migrations'),
    // Docker image also ships backend/src/migrations
    path.join(process.cwd(), 'src/migrations'),
    // Running from the repository root against source files
    path.join(process.cwd(), 'backend/src/migrations'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  throw new Error(`Could not locate migrations directory. Tried: ${candidates.join(', ')}`);
}

export async function runMigrations(customDatabaseUrl?: string): Promise<void> {
  const connectionString = customDatabaseUrl || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set for migrations');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
      )
    `);

    const dir = resolveMigrationsDir();
    const files = fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      throw new Error(`No migration files found in ${dir}`);
    }

    for (const filename of files) {
      const applied = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [filename],
      );
      if (applied.rows.length > 0) {
        console.log(`↷ Skipping migration ${filename} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(dir, filename), 'utf8');
      console.log(`Running migration ${filename}...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    console.log('✅ Migrations completed successfully.');
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    });
}
