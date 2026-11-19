import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://rejenga:rejenga@localhost:5432/rejenga_test";
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql`drop owned by current_user cascade`;
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  await sql.end();
}
