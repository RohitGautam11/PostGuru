// Local development PostgreSQL without Docker or a system install.
// Data lives in apps/api/.local-db (git-ignored). Usage: npm run db:start  (Ctrl+C to stop)
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const databaseDir = fileURLToPath(new URL('../.local-db', import.meta.url));
const port = Number(process.env.LOCAL_DB_PORT ?? 5432);

const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'socialhub',
  password: 'socialhub',
  port,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});

if (!existsSync(databaseDir)) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase('socialhub');
} catch {
  /* already exists */
}
console.log(`\nLocal PostgreSQL ready: postgresql://socialhub:socialhub@localhost:${port}/socialhub\nPress Ctrl+C to stop.\n`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
