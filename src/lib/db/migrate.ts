/**
 * Minimal SQL migration runner (no ORM CLI dependency).
 *
 * Applies every `drizzle/*.sql` file in filename order, tracking applied
 * migrations in `drizzle_migrations`. Used by `npm run db:migrate`.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "drizzle");

export async function runMigrations(connectionString: string) {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString, max: 1 });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS drizzle_migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    const applied = await pool.query<{ filename: string }>(
      "SELECT filename FROM drizzle_migrations"
    );
    const done = new Set(applied.rows.map((row) => row.filename));

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO drizzle_migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`applied ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }

    console.log("migrations up to date");
  } finally {
    await pool.end();
  }
}
