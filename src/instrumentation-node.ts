// Applies any pending database migrations on server start (Node.js runtime only).
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

if (process.env.SKIP_MIGRATIONS !== "true") {
  const client = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), "drizzle") });
    console.log("Database migrations are up to date.");
  } finally {
    await client.end();
  }
}
