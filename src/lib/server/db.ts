import "server-only";
import mysql from "mysql2/promise";
import type { Pool as MySQLPool, PoolConnection, ResultSetHeader } from "mysql2/promise";

// ---------------------------------------------------------------------------
// Tipos compatíveis com a interface anterior (pg)
// ---------------------------------------------------------------------------

export interface PgResult<T> {
  rows: T[];
  rowCount: number;
}

/** Interface mínima do PoolClient do pg — usada em toda a base de código. */
export interface Executor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query<T = any>(
    sql: string,
    params?: unknown[],
  ): Promise<PgResult<T>>;
}

// ---------------------------------------------------------------------------
// Conversor PostgreSQL → MySQL2
// ---------------------------------------------------------------------------

/**
 * Converte SQL com sintaxe PostgreSQL ($N, ANY, ::cast, extract) para MySQL2.
 * Os parâmetros são reordenados conforme a ordem de aparição dos $N no texto.
 */
function pgToMysql(
  sql: string,
  params: unknown[],
): { sql: string; params: unknown[]; returningId: boolean } {
  // 1. Detecta RETURNING id (único caso tratado automaticamente)
  const returningId = /\s+RETURNING\s+id\s*$/i.test(sql);
  // Remove qualquer cláusula RETURNING (colunas múltiplas devem ser tratadas
  // manualmente no código de chamada com SELECT após UPDATE/INSERT)
  sql = sql.replace(/\s+RETURNING\s+[\w,\s]+$/i, "").trim();

  // 2. Converte = ANY($N::type[]) → marcador temporário (antes de remover ::)
  sql = sql.replace(
    /=\s*ANY\s*\(\s*\$(\d+)::[\w\[\]]+\s*\)/gi,
    (_, n: string) => `__ARRAYIN_${n}__`,
  );

  // 3. Remove casts PostgreSQL  ::tipo  ou  ::tipo[]
  sql = sql.replace(/::[A-Za-z_]+(\[\])?/g, "");

  // 4. Converte extract() → funções MySQL
  sql = sql.replace(/extract\s*\(\s*month\s+from\s+([^)]+)\)/gi, "MONTH($1)");
  sql = sql.replace(/extract\s*\(\s*day\s+from\s+([^)]+)\)/gi, "DAY($1)");
  sql = sql.replace(/extract\s*\(\s*year\s+from\s+([^)]+)\)/gi, "YEAR($1)");

  // 5. IS DISTINCT FROM → NOT (a <=> b)  (operador NULL-safe)
  sql = sql.replace(
    /([A-Za-z_.]+)\s+IS\s+DISTINCT\s+FROM\s+\$(\d+)/gi,
    (_, col: string, n: string) => `NOT (${col} <=> $${n})`,
  );

  // 6. Coleta aparições de $N na ordem em que aparecem no texto SQL
  const appearances: number[] = [];

  // 6a. Processa marcadores de array primeiro
  sql = sql.replace(/__ARRAYIN_(\d+)__/g, (_, n: string) => {
    appearances.push(parseInt(n, 10));
    return "IN (?)";
  });

  // 6b. Processa $N restantes
  sql = sql.replace(/\$(\d+)/g, (_, n: string) => {
    appearances.push(parseInt(n, 10));
    return "?";
  });

  const newParams = appearances.map((n) => params[n - 1]);
  return { sql, params: newParams, returningId };
}

// ---------------------------------------------------------------------------
// Pool singleton
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var __rhgcfPool: MySQLPool | undefined;
}

function criarPool(): MySQLPool {
  const host = process.env.DB_HOST;
  const port = Number(process.env.DB_PORT ?? 3306);
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD ?? "";
  const database = process.env.DB_NAME;

  if (!host || !user || !database) {
    throw new Error(
      "Variáveis de banco de dados não configuradas. Defina DB_HOST, DB_USER e DB_NAME.",
    );
  }

  console.log(
    `[rh-gcf] pool mysql: host=${host}:${port}, db=${database}, max=${process.env.DB_POOL_MAX ?? 10}`,
  );

  return mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_MAX ?? 10),
    queueLimit: 0,
    connectTimeout: 10_000,
    timezone: "+00:00",
    // DATE retorna string "AAAA-MM-DD" — evita deslocamento de fuso
    dateStrings: ["DATE"],
    charset: "utf8mb4",
  });
}

export function pool(): MySQLPool {
  if (!globalThis.__rhgcfPool) globalThis.__rhgcfPool = criarPool();
  return globalThis.__rhgcfPool;
}

// ---------------------------------------------------------------------------
// Wrappers com interface pg-compatível
// ---------------------------------------------------------------------------

function wrapPool(): Executor {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async query<T = any>(
      sql: string,
      params: unknown[] = [],
    ): Promise<PgResult<T>> {
      const { sql: msql, params: mparams, returningId } = pgToMysql(sql, params);
      const [result] = await pool().query(msql, mparams);
      if (returningId) {
        const id = (result as ResultSetHeader).insertId;
        return { rows: [{ id } as unknown as T], rowCount: 1 };
      }
      const rows = result as T[];
      return { rows, rowCount: rows.length };
    },
  };
}

function wrapConnection(conn: PoolConnection): Executor {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async query<T = any>(
      sql: string,
      params: unknown[] = [],
    ): Promise<PgResult<T>> {
      const { sql: msql, params: mparams, returningId } = pgToMysql(sql, params);
      const [result] = await conn.query(msql, mparams);
      if (returningId) {
        const id = (result as ResultSetHeader).insertId;
        return { rows: [{ id } as unknown as T], rowCount: 1 };
      }
      const rows = result as T[];
      return { rows, rowCount: rows.length };
    },
  };
}

const _executor = wrapPool();

// ---------------------------------------------------------------------------
// Funções públicas
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function query<T = any>(
  sql: string,
  params: unknown[] = [],
  ex?: Executor,
): Promise<T[]> {
  const r = await (ex ?? _executor).query<T>(sql, params);
  return r.rows;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function queryOne<T = any>(
  sql: string,
  params: unknown[] = [],
  ex?: Executor,
): Promise<T | null> {
  const rows = await query<T>(sql, params, ex);
  return rows[0] ?? null;
}

export async function transacao<T>(fn: (c: Executor) => Promise<T>): Promise<T> {
  const conn = await pool().getConnection();
  const ex = wrapConnection(conn);
  try {
    await conn.beginTransaction();
    const r = await fn(ex);
    await conn.commit();
    return r;
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}
