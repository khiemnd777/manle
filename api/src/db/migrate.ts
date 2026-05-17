import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { db } from './client';

const migrationDir = join(import.meta.dir, '../../db/migrations');
const files = (await readdir(migrationDir)).filter(file => file.endsWith('.sql')).sort();
const sql = db();

for (const file of files) {
  const source = await readFile(join(migrationDir, file), 'utf8');
  console.log(`Running migration ${file}`);
  await sql.unsafe(source);
}

console.log(`Applied ${files.length} migration file(s).`);

