import { Pool, type PoolClient } from "pg";
import { MIGRATIONS } from "./schema";

export class DbNotConfiguredError extends Error {
  constructor() {
    super("No database is connected yet. Set POSTGRES_URL.");
    this.name = "DbNotConfiguredError";
  }
}

export interface Queryable {
  query<T = Record<string, any>>(text: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
}

type Globals = typeof globalThis & {
  __ssPool?: Pool;
  __ssReady?: Promise<void>;
};
const g = globalThis as Globals;

function connectionString(): string | null {
  return process.env.POSTGRES_URL || process.env.DATABASE_URL || null;
}

export function isDbConfigured(): boolean {
  return Boolean(connectionString());
}

function buildPool(raw: string): Pool {
  const url = new URL(raw);
  // We control TLS ourselves; these params confuse node-postgres or poolers.
  for (const p of ["sslmode", "supa", "pgbouncer", "uselibpqcompat"]) url.searchParams.delete(p);

  const sslMode = new URL(raw).searchParams.get("sslmode");
  const isLocal = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  let ssl: false | { ca?: string; rejectUnauthorized: boolean } = false;
  if (!isLocal && sslMode !== "disable") {
    ssl = process.env.PG_SSL_INSECURE === "1"
      ? { rejectUnauthorized: false }
      : { rejectUnauthorized: true, ...(process.env.PG_SSL_CA ? { ca: process.env.PG_SSL_CA } : {}) };
  }

  const pool = new Pool({
    connectionString: url.toString(),
    ssl,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on("error", (err) => console.error("[db] idle client error:", err.message));
  return pool;
}

async function migrate(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    // Transaction-scoped lock: safe behind transaction poolers, and serialises racing cold starts.
    await client.query("select pg_advisory_xact_lock(727001)");
    await client.query(
      "create table if not exists ss_migrations (id text primary key, applied_at timestamptz not null default now())",
    );
    const done = new Set((await client.query("select id from ss_migrations")).rows.map((r) => r.id as string));
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      await client.query(m.sql);
      await client.query("insert into ss_migrations (id) values ($1)", [m.id]);
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function getPool(): Promise<Pool> {
  const raw = connectionString();
  if (!raw) throw new DbNotConfiguredError();
  if (!g.__ssPool) g.__ssPool = buildPool(raw);
  if (!g.__ssReady) {
    const pool = g.__ssPool;
    g.__ssReady = migrate(pool).catch((err) => {
      g.__ssReady = undefined; // allow a retry on the next request
      throw err;
    });
  }
  await g.__ssReady;
  return g.__ssPool;
}

export const db: Db = {
  async query<T = Record<string, any>>(text: string, params: unknown[] = []): Promise<T[]> {
    const pool = await getPool();
    const res = await pool.query(text, params as any[]);
    return res.rows as T[];
  },
  async tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
    const pool = await getPool();
    const client: PoolClient = await pool.connect();
    const q: Queryable = {
      async query<R = Record<string, any>>(text: string, params: unknown[] = []): Promise<R[]> {
        const res = await client.query(text, params as any[]);
        return res.rows as R[];
      },
    };
    try {
      await client.query("begin");
      const out = await fn(q);
      await client.query("commit");
      return out;
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  },
};

/** Test helper: close the shared pool. */
export async function closeDb(): Promise<void> {
  if (g.__ssPool) {
    await g.__ssPool.end();
    g.__ssPool = undefined;
    g.__ssReady = undefined;
  }
}
