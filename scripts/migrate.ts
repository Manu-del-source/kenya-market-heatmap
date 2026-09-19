/**
 * Apply database migrations.
 *
 *   npm run db:migrate
 *
 * Requires DATABASE_URL. Prints a friendly message (and exits 0) when no
 * database is configured, so CI without a database is not a failure.
 */

import { runMigrations } from "../src/lib/db/migrate";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log("DATABASE_URL is not set — skipping migrations.");
    console.log("The application will use the in-memory store and the demo provider.");
    return;
  }
  await runMigrations(connectionString);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
