/**
 * Aplica as migrações SQL de db/migrations em ordem, uma única vez cada.
 * Uso: npm run db:migrate
 * Lê DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD do ambiente ou de .env
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { carregarEnv } from "./env";

async function main() {
  carregarEnv();

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME,
    multipleStatements: true,
    charset: "utf8mb4",
    timezone: "+00:00",
  });

  try {
    await conn.execute(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         nome VARCHAR(255) NOT NULL PRIMARY KEY,
         aplicada_em DATETIME NOT NULL DEFAULT NOW()
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    );

    const pasta = path.join(process.cwd(), "db", "migrations");
    const arquivos = readdirSync(pasta)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      "SELECT nome FROM schema_migrations",
    );
    const aplicadas = new Set(rows.map((r) => r.nome as string));

    let novas = 0;
    for (const arq of arquivos) {
      if (aplicadas.has(arq)) continue;
      const sql = readFileSync(path.join(pasta, arq), "utf8");
      process.stdout.write(`Aplicando ${arq}... `);
      await conn.beginTransaction();
      try {
        await conn.query(sql);
        await conn.execute(
          "INSERT INTO schema_migrations (nome) VALUES (?)",
          [arq],
        );
        await conn.commit();
        novas++;
        console.log("ok");
      } catch (e) {
        await conn.rollback();
        throw e;
      }
    }
    console.log(
      novas
        ? `${novas} migração(ões) aplicada(s).`
        : "Banco de dados já está atualizado.",
    );
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error("Falha na migração:", (e as Error).message);
  process.exit(1);
});
