import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

// DATE (OID 1082) volta como texto "AAAA-MM-DD" — evita deslocamento de fuso.
types.setTypeParser(1082, (v) => v);

declare global {
  // eslint-disable-next-line no-var
  var __rhgcfPool: Pool | undefined;
}

function criarPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não configurada.");

  const sslEnv = (process.env.DATABASE_SSL ?? "").trim().toLowerCase();
  const ssl =
    sslEnv === "true"
      ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
      : sslEnv === "no-verify"
        ? { rejectUnauthorized: false }
        : undefined;

  // Log seguro (sem a URL completa) — ajuda no diagnóstico em produção.
  const host = (() => {
    try { return new URL(connectionString).hostname; } catch { return "(parse falhou)"; }
  })();
  console.log(`[rh-gcf] pool: host=${host}, ssl=${sslEnv || "off"}, max=${process.env.DATABASE_POOL_MAX ?? 10}`);

  const p = new Pool({
    connectionString,
    ssl,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    connectionTimeoutMillis: 10_000,   // 10 s — evita requisição pendurada
    idleTimeoutMillis: 30_000,         // 30 s — libera conexões ociosas
    statement_timeout: 15_000,         // 15 s — evita consultas travadas
  });

  p.on("error", (err) => {
    console.error("[rh-gcf] pool: erro de conexão ociosa —", err.message);
  });

  return p;
}

export function pool(): Pool {
  if (!globalThis.__rhgcfPool) globalThis.__rhgcfPool = criarPool();
  return globalThis.__rhgcfPool;
}

export type Executor = Pick<PoolClient, "query">;

export async function query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = [], ex?: Executor): Promise<T[]> {
  const r = await (ex ?? pool()).query<T>(sql, params);
  return r.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = [], ex?: Executor): Promise<T | null> {
  const rows = await query<T>(sql, params, ex);
  return rows[0] ?? null;
}

export async function transacao<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
