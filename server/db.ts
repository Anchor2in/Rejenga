import "dotenv/config";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool, type PoolClient } from "@neondatabase/serverless";

type DbRow = Record<string, unknown>;

const seedModels = [
  ["tecno-spark-10", "Tecno", "Spark 10"],
  ["tecno-spark-20", "Tecno", "Spark 20"],
  ["tecno-spark-20c", "Tecno", "Spark 20C"],
  ["tecno-camon-20", "Tecno", "Camon 20"],
  ["tecno-pop-8", "Tecno", "Pop 8"],
  ["samsung-galaxy-a14", "Samsung", "Galaxy A14"],
  ["samsung-galaxy-a05", "Samsung", "Galaxy A05"],
  ["samsung-galaxy-a05s", "Samsung", "Galaxy A05s"],
  ["samsung-galaxy-a15", "Samsung", "Galaxy A15"],
  ["infinix-hot-30", "Infinix", "Hot 30"],
  ["infinix-hot-40i", "Infinix", "Hot 40i"],
  ["infinix-smart-8", "Infinix", "Smart 8"],
  ["infinix-note-30", "Infinix", "Note 30"],
  ["itel-a60s", "itel", "A60s"],
  ["itel-a70", "itel", "A70"],
  ["xiaomi-redmi-12c", "Xiaomi", "Redmi 12C"],
  ["xiaomi-redmi-13c", "Xiaomi", "Redmi 13C"],
  ["oppo-a18", "OPPO", "A18"],
] as const;
const seedParts = [
  ["screen", "Screen"],
  ["battery", "Battery"],
  ["charging-board", "Charging board"],
  ["camera", "Camera"],
  ["charging-port", "Charging port"],
  ["front-camera", "Front camera"],
  ["rear-camera", "Rear camera"],
  ["loudspeaker", "Loudspeaker"],
  ["earpiece-speaker", "Earpiece speaker"],
  ["microphone", "Microphone"],
  ["power-volume-flex", "Power/volume button flex"],
  ["back-cover", "Back cover"],
  ["fingerprint-sensor", "Fingerprint sensor"],
] as const;

class NeonDatabase {
  private readonly pool: Pool;
  private readonly transactionClient = new AsyncLocalStorage<PoolClient>();
  private readonly ready: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000 });
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
    for (const statement of schema.split(";").map((part) => part.trim()).filter(Boolean)) {
      await this.pool.query(statement);
    }

    for (const model of seedModels) {
      await this.pool.query("INSERT INTO device_models (id, brand, model_name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [...model]);
    }
    for (const part of seedParts) {
      await this.pool.query("INSERT INTO part_types (id, part_name) VALUES ($1, $2) ON CONFLICT DO NOTHING", [...part]);
    }
  }

  private async query(sql: string, params: unknown[] = []) {
    await this.ready;
    const client = this.transactionClient.getStore() ?? this.pool;
    return client.query(this.toPostgres(sql), params);
  }

  private toPostgres(sql: string): string {
    let index = 0;
    return sql
      .replace(/\bCOLLATE\s+NOCASE\b/gi, "")
      .replace(/\bAS\s+([A-Za-z_][A-Za-z0-9_]*)/g, (match, alias: string) =>
        /[A-Z]/.test(alias) ? `AS "${alias}"` : match)
      .replace(/\?/g, () => `$${++index}`);
  }

  prepare(sql: string) {
    return {
      get: async (...params: unknown[]): Promise<DbRow | undefined> => {
        const result = await this.query(sql, params);
        const row = result.rows[0] as DbRow | undefined;
        if (row && typeof row.count === "string") row.count = Number(row.count);
        return row;
      },
      all: async (...params: unknown[]): Promise<DbRow[]> => {
        const result = await this.query(sql, params);
        return result.rows as DbRow[];
      },
      run: async (...params: unknown[]): Promise<{ changes: number }> => {
        const result = await this.query(sql, params);
        return { changes: result.rowCount ?? 0 };
      },
    };
  }

  async transaction<T>(action: () => T | Promise<T>): Promise<T> {
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await this.transactionClient.run(client, action);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("Set DATABASE_URL to a Neon PostgreSQL connection string before starting ReJenga.");
}

export const db = new NeonDatabase(process.env.DATABASE_URL);

export function id(): string {
  return randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

export async function notify(userId: string, title: string, body: string): Promise<void> {
  await db.prepare("INSERT INTO notifications (id, user_id, title, body, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id(), userId, title, body, now());
}

export type Role = "admin" | "technician" | "donor" | "recipient";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  area: string;
}

export async function authUser(userId: string): Promise<AuthUser | undefined> {
  return await db.prepare("SELECT id, name, email, role, area FROM users WHERE id = ? AND status = 'approved'")
    .get(userId) as AuthUser | undefined;
}

export function transaction<T>(action: () => T | Promise<T>): Promise<T> {
  return db.transaction(action);
}
