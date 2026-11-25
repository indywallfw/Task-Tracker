import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile();
} catch {
  // no .env file; rely on the real environment
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // drizzle-kit runs schema changes, which need a direct (unpooled) connection on Neon
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL! },
});
