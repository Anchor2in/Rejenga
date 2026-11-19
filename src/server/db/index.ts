import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "postgres://rejenga:rejenga@localhost:5432/rejenga";

const globalForDb = globalThis as unknown as { rejengaSql?: ReturnType<typeof postgres> };
const client = globalForDb.rejengaSql ?? postgres(url, { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.rejengaSql = client;

export const db = drizzle(client, { schema });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Executor = DB | Tx;
export { schema };
